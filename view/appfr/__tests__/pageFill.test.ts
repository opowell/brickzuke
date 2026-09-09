/**
 * The rest of a long answer, fetched while the table is up.
 *
 * What is pinned here is not that the pages arrive — the tables they fill
 * assert that — but the manners [pageFill] promises, every one of which is a
 * request to BrickLink that must not be made: a page asked for twice, a page
 * asked for after the table was left, a page asked for again after nobody
 * answered the last one. Those show up as a rate limit rather than as a wrong
 * number on screen, which is why they are tested where they are decided.
 *
 * The arithmetic is the other half. Which page comes next is read off the
 * scope stored beside the rows — `first 3,000 of 6,254 lots` is a seller to
 * resume at page 31, not one to fetch again from page 1 — and getting that
 * wrong is either a table that never finishes or one that fetches what it has.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Fill } from '../pageFill'

/** Pages asked for, in the order they were asked for, across every mock. */
const asked: number[] = []

/**
 * The two page stores, standing in for BrickLink and for the handler that
 * writes what comes back. A fetch here does what a response does — it moves
 * the scope on — because that is the only thing a fill looks at to decide
 * whether the page it asked for arrived.
 *
 * It moves it all the way, rather than by one page: what these cases are about
 * is which page a half-fetched answer resumes at, and a mock that answers it
 * whole says so in one request instead of thirty-three. Working through the
 * rest of them, in order and one at a time, is the run's own business and is
 * pinned above.
 */
vi.mock('../../assets/js/init-brick-link-worker', () => ({
  installResponseListener: () => {}
}))

vi.mock('../../assets/js/make-call', () => ({
  processQueue: async () => {}
}))

vi.mock('../../stores/bricklink/store-front-page', () => ({
  PAGE_SIZE: 100,
  storeIds: new Map([['huge', 1_801_484]]),
  fetchStoreFront: async () => {},
  fetchStoreItems: async (username: string, sid: number, page: number) => {
    asked.push(page)
    await landStoreLots(username)
  },
}))

vi.mock('../../stores/bricklink/catalog-list-color-page', () => ({
  COLOR_LIST_TYPES: new Set(['P', 'S']),
  colorScope: (catType: string, colorId: string) => `${catType}-${colorId}`,
  fetchColorPage: async (catType: string, colorId: string, page: number) => {
    asked.push(page)
    await landColorPage(`${catType}-${colorId}`)
  }
}))

const {
  fillPages
} = await import('../pageFill')
const {
  storeLotsFill
} = await import('../storeLotsFetch')
const {
  colorItemsFill
} = await import('../colorItemsFetch')
const {
  get, put
} = await import('../../../idb/db')
const {
  getDbConnection
} = await import('../../../idb/idb')
const STORES = (await import('../../../idb/stores')).default

async function withDb<T>(read: (db: Awaited<ReturnType<typeof getDbConnection>>) => Promise<T>) {
  const db = await getDbConnection()
  try {
    return await read(db)
  } finally {
    db.close()
  }
}

/** A seller as the store front leaves it: so many lots, so many of them stored. */
async function recordStore(store: string, lots: number, fetchedLots: number) {
  await withDb((db) =>
    put(db, STORES.STORE_LOT_SCOPES, {
      store,
      lots,
      fetchedLots
    })
  )
}

/** The rest of a seller's lots landing — see the note on the mocks. */
async function landStoreLots(store: string) {
  await withDb(async (db) => {
    const scope = (await get(db, STORES.STORE_LOT_SCOPES, store)) as {
      store: string
      lots: number
      fetchedLots: number
    }
    await put(db, STORES.STORE_LOT_SCOPES, {
      ...scope,
      fetchedLots: scope.lots
    })
  })
}

/** A colour as its first page leaves it: so many pages, so many of them read. */
async function recordColor(scope: string, pages: number, fetchedPages: number) {
  await withDb((db) =>
    put(db, STORES.COLOR_SCOPES, {
      scope,
      pages,
      fetchedPages
    })
  )
}

/** The rest of a colour landing — see the note on the mocks. */
async function landColorPage(scope: string) {
  await withDb(async (db) => {
    const held = (await get(db, STORES.COLOR_SCOPES, scope)) as {
      scope: string
      pages: number
      fetchedPages: number
    }
    await put(db, STORES.COLOR_SCOPES, {
      ...held,
      fetchedPages: held.pages
    })
  })
}

beforeEach(() => {
  asked.length = 0
})

/**
 * The run itself, over a stub answer and a stub clock.
 *
 * Fake timers here and nowhere else in this file: they are what makes a
 * sixty-page walk cost nothing, and they are also what stops IndexedDB, whose
 * own scheduling is on the same timers. The cases below that read a scope run
 * on the wall clock and are one page long for that reason.
 */
describe('the run', () => {
  /** A whole run, with the gaps between pages waited out on the stub clock. */
  async function run(fill: Fill, ms = 600_000) {
    const done = fill.run()
    await vi.advanceTimersByTimeAsync(ms)
    await done
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** An answer of `pages` pages, each landing the moment it is asked for. */
  function answer(pages: number, lands = true) {
    let reach = 1
    return {
      async next() {
        return reach < pages ? reach + 1 : undefined
      },
      async fetch(page: number) {
        asked.push(page)
        if (lands) {
          reach = page
        }
      },
      async reach() {
        return reach
      }
    }
  }

  it('works through what is left, a page at a time and in order', async () => {
    await run(fillPages(answer(5), ref(0)))
    expect(asked).toEqual([2, 3, 4, 5])
  })

  it('counts every page that landed, for the table drawn from it', async () => {
    const version = ref(0)
    await run(fillPages(answer(5), version))
    // One per page rather than one per run: the table redraws as each lands,
    // which is the whole difference between this and a scrape.
    expect(version.value).toBe(4)
  })

  it('asks for nothing when the whole answer is stored', async () => {
    await run(fillPages(answer(1), ref(0)))
    expect(asked).toEqual([])
  })

  it('stops where it was when the table is left', async () => {
    const fill = fillPages(answer(60), ref(0))
    const done = fill.run()
    await vi.advanceTimersByTimeAsync(1_200)
    const reached = asked.length
    fill.stop()
    // Whatever was in flight may finish; nothing after it is asked for.
    await vi.advanceTimersByTimeAsync(600_000)
    await done
    expect(reached).toBeGreaterThan(0)
    expect(asked.length).toBe(reached)
  })

  it('stops the first time a page brings nothing back', async () => {
    // Nobody answering and a seller with fewer lots than BrickLink says look
    // the same from here, and asking again would be sixty more of the same.
    const version = ref(0)
    await run(fillPages(answer(60, false), version))
    expect(asked).toEqual([2])
    expect(version.value).toBe(0)
  })

  it('stops rather than throwing when the fetch itself fails', async () => {
    // The rows on screen are not made wrong by page forty-one failing to
    // arrive, and the table must not be emptied over one.
    const version = ref(0)
    await expect(
      run(
        fillPages(
          {
            async next() {
              return 2
            },
            async fetch() {
              throw new Error('no extension')
            },
            async reach() {
              return 1
            }
          },
          version
        )
      )
    ).resolves.toBeUndefined()
    expect(version.value).toBe(0)
  })
})

describe('a seller\'s next page', () => {
  it('resumes at the page after the lots already stored', async () => {
    // The store in the screenshot: three thousand lots of six thousand two
    // hundred and fifty-four, left there by the cap that used to be here.
    await recordStore('huge', 6_254, 3_000)
    await storeLotsFill('huge').run()
    // Page 31, because thirty pages of a hundred are stored — not page 1, and
    // not page 30 over again.
    expect(asked[0]).toBe(31)
  })

  it('asks for nothing about a seller whose lots are all stored', async () => {
    await recordStore('small', 240, 240)
    await storeLotsFill('small').run()
    expect(asked).toEqual([])
  })

  it('asks for nothing before the first page has landed', async () => {
    // Nothing recorded is a store nobody has opened. How many lots it holds is
    // stated on the first page of it, so there is no second one to ask for.
    await storeLotsFill('unopened').run()
    expect(asked).toEqual([])
  })
})

describe('a colour\'s next page', () => {
  it('resumes at the page after the ones already read', async () => {
    // Tan, stopped at twenty pages of two hundred and eighty-seven.
    await recordColor('P-2', 287, 20)
    await colorItemsFill('P', '2').run()
    expect(asked[0]).toBe(21)
  })

  it('asks for nothing about a colour read whole', async () => {
    await recordColor('P-41', 2, 2)
    await colorItemsFill('P', '41').run()
    expect(asked).toEqual([])
  })
})
