/**
 * Paging the lots table: the walk over every lot is taken once per query, and
 * every page after the first is cut from the order it arrived at — no walk,
 * and a count that stays where it settled.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { computed, effectScope, nextTick, ref, watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useResults } from 'header-content-layout'
import type { ShellQuery } from 'header-content-layout'

vi.mock('../../../model', async () => {
  const {
    ref: r
  } = await import('vue')
  return {
    filters: r([]),
    search: r(undefined),
    selectedItemType: r(null),
    itemTypes: r([]),
    processingCounts: r(false),
    selectedCounts: r(undefined),
  }
})

const {
  CHECK_AFTER_MS, catalogSource
} = await import('../catalogSource')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  putAll
} = await import('../../../idb/db')
const {
  referencePrice
} = await import('../settings')
const {
  storeScopeVersion
} = await import('../storeLotsFetch')
const STORES = (await import('../../../idb/stores')).default

const inventories = () => catalogSchema.value.entities.find((e) => e.key === 'inventories')!

/** Thirty lots, three to a price, so the order has ties to keep straight. */
const SEEDED = 30

const stored = (i: number) => ({
  id: `lot-${String(i).padStart(2, '0')}`,
  store: `seller-${i % 4}`,
  record: `P-${3000 + (i % 5)}`,
  itemType: 'P',
  itemNumber: String(3000 + (i % 5)),
  itemName: `Part ${i}`,
  description: '',
  condition: i % 3 ? 'N' : 'U',
  colorId: '5',
  colorName: 'Red',
  quantity: 10 + i,
  price: (i % 10) / 10,
  displayPrice: `EUR ${((i % 10) / 10).toFixed(2)}`,
  nativePrice: `EUR ${((i % 10) / 10).toFixed(2)}`
})

/** Reads of the stored lots made in bulk — the walk's, and nothing else's. */
let walkReads = 0

beforeAll(async () => {
  setActivePinia(createPinia())
  referencePrice.value = 'off'
  const getAll = IDBObjectStore.prototype.getAll
  IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args) {
    if (this.name === STORES.STORE_LOTS.name) {
      walkReads++
    }
    return getAll.apply(this, args)
  }
  const db = await getDbConnection()
  await putAll(db, STORES.STORE_LOTS, Array.from({
    length: SEEDED 
  }, (_, i) => stored(i)))
  db.close()
})

/** The table as the shell holds it, paged by `query.page`. */
function table(overrides: Partial<ShellQuery> = {}, limit = 7) {
  const query = ref<ShellQuery>({
    view: 'table',
    sort: 'priceValue',
    dir: 'asc',
    expr: '',
    facets: {},
    page: 1,
    ...overrides,
  })
  const scope = effectScope()
  let state!: ReturnType<typeof useResults>
  scope.run(() => {
    state = useResults({
      source: computed(() => catalogSource),
      query: computed(() => query.value),
      schema: computed(() => catalogSchema.value),
      entity: computed(() => inventories()),
      limit: computed(() => limit),
    })
  })
  return {
    state,
    query,
    scope
  }
}

async function settle(state: ReturnType<typeof useResults>) {
  // A query changed is a run on the next tick, not this one.
  await nextTick()
  for (let i = 0; i < 200 && state.pending.value; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const ids = (state: ReturnType<typeof useResults>) => state.rows.value.map((row) => row.id)

describe('paging the lots', () => {
  it('walks once, and cuts every later page from the order it held', async () => {
    const {
      state, query, scope 
    } = table()
    await settle(state)
    const firstPage = ids(state)
    expect(state.total.value).toBe(SEEDED)
    const walked = walkReads

    const totals: number[] = []
    const stop = watch(() => state.total.value, (total) => totals.push(total))
    const pages = [firstPage]
    for (let page = 2; page <= 5; page++) {
      query.value = {
        ...query.value,
        page 
      }
      await settle(state)
      pages.push(ids(state))
    }
    stop()

    expect(walkReads).toBe(walked)
    // The count never started over — no nought, no climb.
    expect(totals.every((total) => total === SEEDED)).toBe(true)
    // Every lot once, in price order, across the pages.
    const all = pages.flat()
    expect(all).toHaveLength(SEEDED)
    expect(new Set(all).size).toBe(SEEDED)
    const prices = all.map((id) => Number(id.slice(4)) % 10)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    scope.stop()
  })

  it('draws the first page the walk drew the same way the held order cuts it', async () => {
    // Descending, over lots two to a price, in an order no other test walks.
    const {
      state, scope 
    } = table({
      dir: 'desc',
      expr: 'condition:N' 
    })
    // Every page the table showed on the way: the thirty lots are one chunk,
    // so the page the walk drew is already whole, and the cut that follows it
    // must not reshuffle the ties in it.
    const shown: string[][] = []
    const stop = watch(() => state.rows.value, () => shown.push(ids(state)))
    await settle(state)
    stop()
    expect(shown.length).toBeGreaterThan(1)
    expect(new Set(shown.map((page) => page.join())).size).toBe(1)
    scope.stop()
  })

  it('lets the order go once a lot has landed behind its back, a page later', async () => {
    const {
      state, query, scope
    } = table({
      expr: 'condition:N'
    })
    await settle(state)
    const before = state.total.value
    // Straight into the store, as another tab would, with nothing in this
    // one told of it.
    const db = await getDbConnection()
    await putAll(db, STORES.STORE_LOTS, [{
      ...stored(31),
      id: 'lot-new',
      condition: 'N'
    }])
    db.close()
    const walked = walkReads
    // The next page is up before the lots are counted, so it is the old
    // order's...
    query.value = {
      ...query.value,
      page: 2
    }
    await settle(state)
    expect(walkReads).toBe(walked)
    expect(state.total.value).toBe(before)
    // ...and the count once the paging stops lets that order go, so the
    // page after it walks.
    await new Promise((resolve) => setTimeout(resolve, CHECK_AFTER_MS + 50))
    query.value = {
      ...query.value,
      page: 3
    }
    await settle(state)
    expect(walkReads).toBeGreaterThan(walked)
    expect(state.total.value).toBe(before + 1)
    scope.stop()
  })

  it('walks again at once where a seller\'s page landed in this tab', async () => {
    const {
      state, query, scope
    } = table({
      expr: 'condition:U'
    })
    await settle(state)
    const walked = walkReads
    storeScopeVersion.value++
    query.value = {
      ...query.value,
      page: 2
    }
    await settle(state)
    expect(walkReads).toBeGreaterThan(walked)
    scope.stop()
  })
})
