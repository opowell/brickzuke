/**
 * The response cache, which is the one thing standing between this app and a
 * request to BrickLink for every page it has already read.
 *
 * All three of these were broken in a way nothing on screen showed. An answer
 * was filed under a key nothing looked up; `expiryTime` was written and never
 * read, so a call asking to be held for a day was held for ever; and `json`
 * matched no case at all, so the two calls carrying an item's lots and its
 * pictures were neither kept nor delivered. A cache that quietly never hits
 * and a cache that quietly never misses look identical from the outside, which
 * is why they are asserted here rather than left to be noticed.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { Call, CallType, callKey, makeCall } from '../make-call'
import { installResponseListener } from '../init-brick-link-worker'
import { get, put, dbDelete } from '../../../../idb/db'
import { getDbConnection } from '../../../../idb/idb'
import STORES from '../../../../idb/stores'

const URL_UNDER_TEST = 'https://www.bricklink.com/ajax/clone/catalogifs.ajax?itemid=99'
const OPTIONS = {
  method: 'GET'
}

/** A call that matches no case in `handleEvent`, so a replay touches no store. */
const INERT = Call.GET_PRICES

async function withDb<T>(run: (db: Awaited<ReturnType<typeof getDbConnection>>) => Promise<T>) {
  const db = await getDbConnection()
  try {
    return await run(db)
  } finally {
    db.close()
  }
}

/** What the app sends when it wants a page it has not got. */
function dispatched(): Promise<CustomEvent> {
  return new Promise((resolve) => {
    document.addEventListener('bzClientToServer', (e) => resolve(e as CustomEvent), {
      once: true
    })
  })
}

beforeEach(async () => {
  await withDb(async (db) => {
    await dbDelete(db, STORES.CALLS, callKey(URL_UNDER_TEST, OPTIONS))
    await dbDelete(db, STORES.CALLS, callKey(URL_UNDER_TEST, OPTIONS, {
      itemType: 'P'
    }))
  })
})

describe('a stored answer', () => {
  it('is replayed rather than fetched again while it is still fresh', async () => {
    await withDb((db) =>
      put(db, STORES.CALLS, {
        url: callKey(URL_UNDER_TEST, OPTIONS),
        options: OPTIONS,
        response: {
          list: []
        },
        expiryTime: Date.now() + 60_000
      })
    )
    let asked = false
    document.addEventListener('bzClientToServer', () => {
      asked = true
    }, {
      once: true
    })
    // `true` is this function's way of saying "cached" — `processQueue` counts
    // on it to know whether a request was actually spent.
    expect(await makeCall(CallType.JSON, INERT, URL_UNDER_TEST, OPTIONS)).toBe(true)
    expect(asked).toBe(false)
  })

  it('is fetched again once it has expired, and not left behind', async () => {
    const key = callKey(URL_UNDER_TEST, OPTIONS)
    await withDb((db) =>
      put(db, STORES.CALLS, {
        url: key,
        options: OPTIONS,
        response: {
          list: []
        },
        // A day was asked for and a day has passed. Before `expiryTime` was
        // read this answer stood for ever.
        expiryTime: Date.now() - 1
      })
    )
    const asked = dispatched()
    expect(await makeCall(CallType.JSON, INERT, URL_UNDER_TEST, OPTIONS)).toBe(false)
    expect((await asked).detail.url).toBe(URL_UNDER_TEST)
    // Dropped rather than merely ignored: it will not be read again, and a
    // store that only ever grows is the other way to get this wrong.
    expect(await withDb((db) => get(db, STORES.CALLS, key))).toBeUndefined()
  })
})

describe('an answer coming back from the extension', () => {
  /** The extension's half of the bridge, as `content.js` dispatches it. */
  async function answer(type: CallType, extraParams?: object) {
    installResponseListener()
    document.dispatchEvent(
      new CustomEvent('bzServerToClient', {
        detail: {
          request: {
            type,
            call: INERT,
            url: URL_UNDER_TEST,
            options: OPTIONS,
            extraParams,
            storageTime: 60_000
          },
          response: {
            list: []
          }
        }
      })
    )
    const key = callKey(URL_UNDER_TEST, OPTIONS, extraParams)
    for (let i = 0; i < 50; i++) {
      const held = await withDb((db) => get(db, STORES.CALLS, key))
      if (held) {
        return held
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return undefined
  }

  it('is kept when it is json, which was falling through the switch', async () => {
    // `json` is the type of both calls behind an item — the lots on offer and
    // the image list. Matching no case, they were dropped on arrival: never
    // cached, and never handed to the handler that fills those maps.
    expect(await answer(CallType.JSON)).toBeDefined()
  })

  it('is filed under the key its extra params make, which is the key read back', async () => {
    // The write used to omit the extra params and every lookup includes them,
    // so an answer carrying any went under a name nothing asked for and the
    // call was repeated however long it was meant to be held.
    expect(await answer(CallType.JSON, {
      itemType: 'P'
    })).toBeDefined()
    // And not under the params-less key, which is where it used to land.
    expect(
      await withDb((db) => get(db, STORES.CALLS, callKey(URL_UNDER_TEST, OPTIONS)))
    ).toBeUndefined()
  })
})
