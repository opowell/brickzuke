import { callKey, CallType, handleEvent, isChallenge, isWriteCall, processQueue } from './make-call'
import BrickLinkWorker from '@/assets/workers/brickLink?worker'
import { put } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import stores from '../../../idb/stores'
import { ONE_WEEK } from './timesToMs'
import { noteAnswer, noteBotCheck } from './bot-check'

let listening = false

/**
 * One answer, kept and handed on.
 *
 * The key is `callKey` with the extra params, which is the key the three
 * lookups in make-call read by. Writing it without them — as this did — files
 * the answer under a name nothing ever asks for, so a call carrying extra
 * params was re-fetched every time however long it was meant to be held. That
 * is both of the calls behind an item's lots and its pictures.
 */
async function keepAndHandle(detail: {
  request: { url: string; options: { body?: string }; extraParams?: object; storageTime?: number }
  response: unknown
}) {
  const db = await getDbConnection()
  const request = detail.request
  try {
    await put(db, stores.CALLS, {
      url: callKey(request.url, request.options, request.extraParams),
      options: request.options,
      response: detail.response,
      expiryTime: Date.now() + (request.storageTime || ONE_WEEK),
    })
    handleEvent(detail as Parameters<typeof handleEvent>[0])
  } finally {
    db.close()
  }
}

/**
 * The half of the bridge that receives: the extension answers a dispatched call
 * with `bzServerToClient`, and this caches the raw response and hands it to
 * whichever store asked for it.
 *
 * Separate from the worker below because a host may want the answers without
 * the queue being drained on a timer — appfr fetches one inventory when someone
 * opens a set, and nothing else.
 */
export function installResponseListener() {
  if (listening) {
    return
  }
  listening = true
  // @ts-expect-error addEventListener
  document.addEventListener('bzServerToClient', async function (e: CustomEvent) {
    console.log('got response', e)
    // A write's answer is for the press that made it — see `sendOnce` — and
    // is not a page: kept here, it would be replayed as one.
    if (isWriteCall(e.detail.request?.call)) {
      return
    }
    // An empty page is the firewall too: BrickLink serves none of its own, and
    // a request it will not answer comes back as a bare 202.
    if (e.detail.response === '' && e.detail.request?.type === CallType.TEXT) {
      noteBotCheck(String(e.detail.request?.url ?? ''))
      return
    }
    if (!e.detail.response) {
      console.log('no response, skipping', e)
      return
    }
    // The firewall's bot check, not the page asked for: neither kept nor
    // handled, so the next ask goes to BrickLink again — see [isChallenge].
    if (isChallenge(e.detail.response)) {
      console.warn('BrickLink answered with a bot check', e.detail.request?.url)
      noteBotCheck(String(e.detail.request?.url ?? ''))
      return
    }
    noteAnswer()
    switch (e.detail.request.type) {
      /*
       * `json` was not here at all, and it is the type both of an item's own
       * calls are made with — the lots on offer and the image list. A type
       * matching no case fell out of the switch: not cached, and never handed
       * to `handleEvent`, so the handlers that fill those two maps never ran.
       * The extension had answered; the app dropped it on the floor.
       */
      case CallType.TEXT:
      case CallType.JSON: {
        await keepAndHandle(e.detail)
        break
      }
      case 'query': {
        console.log('got a query response', e.detail.response.query)
      }
      case CallType.SCRAPE: {
        console.log('got a scrape response', e.detail.response)
        await keepAndHandle(e.detail)
        break
      }
    }
  })
}

export function initBrickLinkWorker() {
  installResponseListener()

  const brickLinkWorker = new BrickLinkWorker()
  brickLinkWorker.onmessage = async () => {
    processQueue()
  }
  brickLinkWorker.postMessage('start')
}
