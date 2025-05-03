import { callKey, handleEvent, processQueue } from './make-call'
import BrickLinkWorker from '@/assets/workers/brickLink?worker'
import { put } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import stores from '../../../idb/stores'

interface StoredCall {}

export function initBrickLinkWorker() {
  const STORAGE_TIME = 1000 * 60 * 60 * 24 * 7 // 7 days
  // @ts-expect-error
  document.addEventListener('bzServerToClient', async function (e: CustomEvent) {
    const db = await getDbConnection()
    const request = e.detail.request
    await put(db, stores.CALLS, {
      url: callKey(request.url, request.options),
      options: request.options,
      response: e.detail.response,
      expiryTime: Date.now() + STORAGE_TIME,
    })
    handleEvent(e.detail)
  })

  const brickLinkWorker = new BrickLinkWorker()
  brickLinkWorker.onmessage = async () => {
    processQueue()
  }
  brickLinkWorker.postMessage('start')
}
