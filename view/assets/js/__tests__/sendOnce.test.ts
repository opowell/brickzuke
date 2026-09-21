/**
 * The write path past the cache and the queue.
 *
 * Every other call here is a read, and the cache is what stands between the
 * app and a request to BrickLink for every page it already has. A write is
 * the case the cache must not touch: an answer to "add these lots" replayed
 * a week later is lots added a week later, or — worse — a press that seems
 * to have worked and did nothing. So what is pinned is that `sendOnce` goes
 * to the extension now, that its answer reaches the press that made it and
 * nothing else, and that the response listener leaves it out of CALLS.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { Call, callKey, isWriteCall, sendOnce } from '../make-call'
import { installResponseListener } from '../init-brick-link-worker'
import { get } from '../../../../idb/db'
import { getDbConnection } from '../../../../idb/idb'
import STORES from '../../../../idb/stores'

const OPTIONS = {
  method: 'POST',
  body: 'itemArray=%5B%5D'
}

/** The extension's half of the bridge, answering the request it was given. */
function answerNext(response: unknown) {
  document.addEventListener(
    'bzClientToServer',
    (e) => {
      const request = (e as CustomEvent).detail
      document.dispatchEvent(
        new CustomEvent('bzServerToClient', {
          detail: {
            request,
            response
          }
        })
      )
    },
    {
      once: true
    }
  )
}

describe('a write', () => {
  it('is the cart add and nothing that is read', () => {
    expect(isWriteCall(Call.ADD_TO_CART)).toBe(true)
    expect(isWriteCall(Call.GET_STORE_POLICY)).toBe(false)
  })

  it('goes to the extension at once and comes back to the press that made it', async () => {
    installResponseListener()
    answerNext({
      returnCode: 0
    })
    const answered = await sendOnce(Call.ADD_TO_CART, Call.ADD_TO_CART, OPTIONS, 1_000, 'nothing')
    expect(answered).toEqual({
      returnCode: 0
    })
    // Not filed under any key a read would look up.
    const db = await getDbConnection()
    try {
      expect(await get(db, STORES.CALLS, callKey(Call.ADD_TO_CART, OPTIONS))).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('takes only its own answer, by the serial it was sent with', async () => {
    let seen = 0
    document.addEventListener(
      'bzClientToServer',
      (e) => {
        const request = (e as CustomEvent).detail
        // Somebody else's answer first, then this one's.
        document.dispatchEvent(
          new CustomEvent('bzServerToClient', {
            detail: {
              request: {
                ...request,
                extraParams: {
                  serial: -1
                }
              },
              response: {
                returnCode: -2
              }
            }
          })
        )
        seen++
        document.dispatchEvent(
          new CustomEvent('bzServerToClient', {
            detail: {
              request,
              response: {
                returnCode: 0
              }
            }
          })
        )
      },
      {
        once: true
      }
    )
    const answered = await sendOnce(Call.ADD_TO_CART, Call.ADD_TO_CART, OPTIONS, 1_000, 'nothing')
    expect(seen).toBe(1)
    expect(answered).toEqual({
      returnCode: 0
    })
  })

  it('fails as the extension being missing when nothing answers, or nothing is the answer', async () => {
    await expect(sendOnce(Call.ADD_TO_CART, Call.ADD_TO_CART, OPTIONS, 20, 'no extension')).rejects.toThrow(
      'no extension'
    )
    // The content script hands over `undefined` when the service worker's
    // fetch failed or the body would not parse — a sign-in page, say.
    answerNext(undefined)
    await expect(sendOnce(Call.ADD_TO_CART, Call.ADD_TO_CART, OPTIONS, 1_000, 'no extension')).rejects.toThrow(
      'no extension'
    )
  })
})
