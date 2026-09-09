/**
 * How the wall goes and gets what it needs to answer itself.
 *
 * A narrowed card is only as sharp as the lots brickzuke holds, so under a
 * query the home screen fetches more of them — and the whole argument is which
 * ones, in which order. One page from every seller in scope beats a hundred
 * pages from one: the second page of a shop stocks the categories and colours
 * the first page already did, and the first page of the next shop does not.
 *
 * These pin that order, and the two things that bound it: only the sellers the
 * query is about, and nothing at all when nothing is asked.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'

vi.mock('../../../model', async () => {
  const {
    ref: makeRef
  } = await import('vue')
  return {
    itemTypes: makeRef([]),
    processingCounts: makeRef(false),
    selectedCounts: makeRef({})
  }
})

/** Every seller a page was asked for, in the order it was asked. */
const opened: string[] = []
/** Every seller whose remaining pages were run, in order. */
const paged: string[] = []

vi.mock('../storeLotsFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../storeLotsFetch')>()
  return {
    ...original,
    readAllStoreLots: async () => [],
    storeLotsFor: async (username: string) => {
      opened.push(username)
      return [
        {
          id: username + '-1',
          store: username,
          record: 'P-3001',
          itemType: 'P',
          itemNumber: '3001',
          colorId: '2',
          condition: 'N',
          quantity: 1,
          price: 0.1,
          displayPrice: 'EUR 0.10'
        }
      ]
    },
    storeLotsFill: (username: string) => ({
      version: ref(0),
      async run() {
        paged.push(username)
      },
      stop() {}
    })
  }
})

const {
  startReachFill,
  stopReachFill
} = await import('../reachFill')
const {
  reachGapMs,
  reachPatience
} = await import('../settings')

beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  await putAll(db, STORES.STORE_COUNTRIES, [
    {
      countryCode: 'DE',
      countryName: 'Germany',
      regionId: 'Europe',
      groupState: 'N',
      image: '',
      storeCount: 2
    },
    {
      countryCode: 'US',
      countryName: 'United States',
      regionId: 'Americas',
      groupState: 'N',
      image: '',
      storeCount: 1
    },
    {
      countryCode: 'JP',
      countryName: 'Japan',
      regionId: 'Asia',
      groupState: 'N',
      image: '',
      storeCount: 1
    },
    {
      countryCode: 'FR',
      countryName: 'France',
      regionId: 'Nowhere',
      groupState: 'N',
      image: '',
      storeCount: 40
    }
  ])
  // Each test works a region of its own, a seller once asked about never being
  // asked again in the same session.
  await putAll(db, STORES.BRICK_LINK_STORES, [
    // Named so that the store's own key order is the *opposite* of the size
    // order: alphabetically the small shop comes first, so a run that takes
    // them as they come reads `aaa` before `zzz` and a run that prioritises
    // reads `zzz` first. Without this the two orders agree and the test
    // passes whether anything is prioritised or not.
    {
      id: 'aaa-kleine-steine',
      name: 'Kleine Steine',
      countryID: 'DE',
      items: 100
    },
    {
      id: 'zzz-grosse-steine',
      name: 'Grosse Steine',
      countryID: 'DE',
      items: 900
    },
    {
      id: 'texas-bricks',
      name: 'Texas Bricks',
      countryID: 'US',
      items: 5_000
    },
    {
      id: 'tokyo-bricks',
      name: 'Tokyo Bricks',
      countryID: 'JP',
      items: 700
    },
    // Forty identical shops, so that every one after the first is barren: the
    // mocked page is the same lot each time, which is the same colour, the same
    // condition, the same type and the same item.
    ...Array.from({
      length: 40
    }, (_unused, at) => ({
      id: 'same-' + String(at).padStart(2, '0'),
      name: 'Same Shop ' + at,
      countryID: 'FR',
      items: 1_000 - at
    }))
  ])
  db.close()
})

beforeEach(() => {
  opened.length = 0
  paged.length = 0
  reachGapMs.value = 1_500
  reachPatience.value = 15
  vi.useFakeTimers()
})

afterEach(() => {
  stopReachFill()
  vi.useRealTimers()
})

/** Lets the run get as far as it is going to, the gaps between sellers included. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(30_000)
}

describe('deepening a narrowed wall', () => {
  it('opens the sellers in scope biggest first, and none out of it', async () => {
    startReachFill('region:"Europe"')
    await settle()
    // Grosse Steine has nine times the stock, so its page moves the answer
    // furthest and is worth asking for first.
    expect(opened).toEqual(['zzz-grosse-steine', 'aaa-kleine-steine'])
    // The Texan has more on offer than either and is not in Europe.
    expect(opened).not.toContain('texas-bricks')
  })

  it('takes one page from everybody before a second from anybody', async () => {
    startReachFill('country:"JP"')
    await settle()
    // The whole of the prioritisation: breadth first, and only then the rest
    // of each shop. With one seller in scope that is one of each, in order.
    expect(opened).toEqual(['tokyo-bricks'])
    expect(paged).toEqual(['tokyo-bricks'])
  })

  it('fetches nothing at all when nothing is asked', async () => {
    // An un-narrowed wall is the whole catalogue and every card is already
    // exact — there is no join to deepen, so there is no seller to open.
    startReachFill('')
    await settle()
    expect(opened).toEqual([])
    expect(paged).toEqual([])
  })

  it('stops where it was when the wall is left', async () => {
    startReachFill('region:"Americas"')
    stopReachFill()
    await settle()
    expect(opened).toEqual([])
  })
})

describe('knowing when to stop', () => {
  it('gives up after the reader\'s patience in sellers that add nothing', async () => {
    // Every shop in this country stocks the identical lot, so the first one
    // teaches the wall everything it is going to learn and the rest are
    // barren. The run should be that one, plus patience-many more.
    reachPatience.value = 4
    startReachFill('country:"FR"')
    await settle()
    expect(opened).toHaveLength(5)
  })

  it('digs further when the reader asks it to', async () => {
    // The same shops, the same nothing, and a reader who wants more looked at
    // before brickzuke concludes there is nothing there.
    reachPatience.value = 9
    startReachFill('region:"Nowhere"')
    await settle()
    // The five from the run above are already stored and cost nothing; what is
    // new is the ten this run opens before giving up again.
    expect(opened).toHaveLength(10)
  })

  it('is a knob the reader owns, held to its stated range', async () => {
    const {
      SETTINGS,
      setSetting
    } = await import('../settings')
    const declared = SETTINGS.find((setting) => setting.key === 'reachPatience')
    expect(declared).toBeDefined()
    // Clamped rather than refused: the control is a number field, so anything
    // can be typed into it, and the nearest legal value beats a silent nought.
    setSetting('reachPatience', 0)
    expect(reachPatience.value).toBe(declared!.min)
    setSetting('reachPatience', 10_000)
    expect(reachPatience.value).toBe(declared!.max)
  })
})
