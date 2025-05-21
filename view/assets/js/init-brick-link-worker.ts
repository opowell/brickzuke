import { callKey, handleEvent, processQueue } from './make-call'
import BrickLinkWorker from '@/assets/workers/brickLink?worker'
import { put } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import stores from '../../../idb/stores'
import { ONE_WEEK } from './timesToMs'

export function initBrickLinkWorker() {
  // @ts-expect-error addEventListener
  document.addEventListener('bzServerToClient', async function (e: CustomEvent) {
    const db = await getDbConnection()
    const request = e.detail.request
    await put(db, stores.CALLS, {
      url: callKey(request.url, request.options),
      options: request.options,
      response: e.detail.response,
      expiryTime: Date.now() + (e.detail.request.storageTime || ONE_WEEK),
    })
    handleEvent(e.detail)
  })

  const brickLinkWorker = new BrickLinkWorker()
  brickLinkWorker.onmessage = async () => {
    processQueue()
  }
  brickLinkWorker.postMessage('start')
}
