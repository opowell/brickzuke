/**
 * The catalogue source, against a seeded IndexedDB.
 *
 * `fake-indexeddb` stands in for the browser's, driven through brickzuke's own
 * `getDbConnection`, so the stores, indices and key paths are the real ones.
 * The sink is appfr's own — this goes through `useResults`, not a stub of it,
 * so what is asserted is the contract the shell actually implements.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'
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
  catalogSource 
} = await import('../catalogSource')
const {
  catalogSchema 
} = await import('../catalogSchema')
const {
  getDbConnection 
} = await import('../../../idb/idb')
const stores = (await import('../../../idb/stores')).default

/** The items type, found by key: the schema declares five, items among them. */
const itemsEntity = () => catalogSchema.value.entities.find((entity) => entity.key === 'items')!

/** How many items the seeded catalogue holds. */
const SEEDED = 5_000

/** Names that do not sort the way the ids do, so ordering is actually tested. */
const nameFor = (i: number) => `Brick ${String((SEEDED - i) % 997).padStart(3, '0')} x 4`

beforeAll(async () => {
  const db = await getDbConnection()
  const itemsTx = db.transaction(stores.ITEMS.name, 'readwrite')
  const blTx = db.transaction(stores.BRICK_LINK_ITEMS.name, 'readwrite')
  for (let i = 0; i < SEEDED; i++) {
    void itemsTx.store.put({
      id: i 
    })
    void blTx.store.put({
      id: `bl-${i}`,
      bzItemId: i,
      itemId: i,
      Name: nameFor(i),
      Number: String(3000 + i),
      itemType: i % 2 ? 'P' : 'S',
      image: `https://img.example/${i}.png`,
      'Category ID': String(i % 40),
      'Category Name': `Category ${i % 40}`,
      weight: String((i % 500) / 100),
      'Year Released': String(1958 + (i % 60)),
      Dimensions: '2 x 4',
    })
  }
  await Promise.all([itemsTx.done, blTx.done])
  db.close()
}, 60_000)

function request() {
  return {
    query: {
      entity: 'items',
      view: 'table' as const,
      sort: 'name',
      dir: 'asc' as const,
      expr: '',
      facets: {},
      page: 1,
    },
    schema: catalogSchema.value,
    entity: itemsEntity(),
    limit: 50,
    offset: 0,
  }
}

function runStream(overrides: Partial<ShellQuery> = {}, limit = 50) {
  const query = ref<ShellQuery>({
    entity: 'items',
    view: 'table',
    sort: 'name',
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
      entity: computed(() => itemsEntity()),
      limit: computed(() => limit),
    })
  })
  return {
    state,
    query,
    scope 
  }
}

/** Waits for the stream to report itself done, or gives up. */
async function settle(state: ReturnType<typeof useResults>, ms = 30_000) {
  const deadline = Date.now() + ms
  while (state.pending.value && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await nextTick()
}

describe('catalog source, streaming', () => {
  it('fills a page and keeps counting past it', async () => {
    const {
      state, scope 
    } = runStream()
    await settle(state)
    // The page holds `limit` and no more; the total is the whole match.
    expect(state.rows.value).toHaveLength(50)
    expect(state.total.value).toBe(SEEDED)
    expect(state.pageCount.value).toBe(100)
    scope.stop()
  }, 60_000)

  it('puts rows in sorted order, not scan order', async () => {
    const {
      state, scope 
    } = runStream()
    await settle(state)
    const names = state.rows.value.map((row) => String(row.fields.name))
    expect(names).toEqual([...names].sort())
    // Scan order would have started at item 0, whose name sorts late.
    expect(names[0]).not.toBe(nameFor(0))
    scope.stop()
  }, 60_000)

  it('reverses when the query does', async () => {
    const {
      state, scope 
    } = runStream({
      dir: 'desc' 
    })
    await settle(state)
    const names = state.rows.value.map((row) => String(row.fields.name))
    expect(names).toEqual([...names].sort().reverse())
    scope.stop()
  }, 60_000)

  it('narrows to what the expression matches', async () => {
    const {
      state, scope 
    } = runStream({
      expr: 'Brick 001' 
    })
    await settle(state)
    expect(state.total.value).toBeGreaterThan(0)
    expect(state.total.value).toBeLessThan(SEEDED)
    // Whitespace is AND over substrings, not a phrase: every term has to be in
    // the name, each on its own. That is the language appfr documents.
    for (const row of state.rows.value) {
      const name = String(row.fields.name).toLowerCase()
      expect(name).toContain('brick')
      expect(name).toContain('001')
    }
    scope.stop()
  }, 60_000)

  it('narrows by a field the row carries, not just by text', async () => {
    // What a category click now writes into `q`. The old substring matcher
    // could not do this: the category is a field, not part of the name.
    const {
      state, scope 
    } = runStream({
      // 37 rather than 7: matching is substring, so "7" would keep 17 and 27 too.
      expr: 'category:"37"' 
    })
    await settle(state)
    expect(state.total.value).toBeGreaterThan(0)
    expect(state.total.value).toBeLessThan(SEEDED)
    for (const row of state.rows.value) {
      expect(String(row.fields.category)).toBe('37')
    }
    scope.stop()
  }, 60_000)

  it('pushes rows in as it finds them rather than once at the end', async () => {
    // Driven at the sink rather than through a clock: what makes a source
    // streaming is that it inserts many times before it closes, which is true
    // however fast the scan happens to be.
    const inserts: number[] = []
    let closed = 0
    let insertsBeforeClose = 0
    await new Promise<void>((resolve) => {
      catalogSource.stream!(request(), {
        get open() {
          return true
        },
        insert(rows) {
          inserts.push(Array.isArray(rows) ? rows.length : 1)
        },
        set() {},
        close() {
          insertsBeforeClose = inserts.length
          closed++
          resolve()
        },
        fail: (thrown) => {
          throw thrown
        },
      })
    })
    expect(inserts.length).toBeGreaterThan(1)
    expect(insertsBeforeClose).toBe(inserts.length)
    expect(closed).toBe(1)
  }, 60_000)

  it('stops pushing once the sink has closed', async () => {
    // The shell shuts a sink when the query changes. A source doing real work
    // is meant to notice and stop, rather than spend the rest of the scan
    // writing into something that is dropping it.
    const STOP_AFTER = 3
    let seen = 0
    let open = true
    await new Promise<void>((resolve) => {
      catalogSource.stream!(request(), {
        get open() {
          return open
        },
        insert() {
          seen++
          if (seen >= STOP_AFTER) {
            open = false
            setTimeout(resolve, 200)
          }
        },
        set() {},
        close: () => resolve(),
        fail: (thrown) => {
          throw thrown
        },
      })
    })
    expect(seen).toBe(STOP_AFTER)
  }, 60_000)
})

/**
 * The years the catalogue covers, which is the one table here derived from the
 * items rather than read from a store of its own.
 *
 * The seed puts 5,000 items across 60 years — `1958 + (i % 60)` — so 5,000
 * divides into 20 years of 84 and 40 of 83. That arithmetic is the point: a
 * year states how many items came out in it, and pressing it has to land on
 * exactly that many.
 */
function runFor(entityKey: string, overrides: Partial<ShellQuery> = {}) {
  const query = ref<ShellQuery>({
    entity: entityKey,
    view: 'table',
    sort: 'name',
    dir: 'asc',
    expr: '',
    facets: {},
    page: 1,
    ...overrides,
  })
  const entity = catalogSchema.value.entities.find((candidate) => candidate.key === entityKey)!
  const scope = effectScope()
  let state!: ReturnType<typeof useResults>
  scope.run(() => {
    state = useResults({
      source: computed(() => catalogSource),
      query: computed(() => query.value),
      schema: computed(() => catalogSchema.value),
      entity: computed(() => entity),
      limit: computed(() => 100),
    })
  })
  return {
    state,
    scope 
  }
}

describe('years', () => {
  it('counts the items of each year, and covers every year seeded', async () => {
    const {
      state, scope 
    } = runFor('years')
    await settle(state)
    expect(state.total.value).toBe(60)
    const counts = state.rows.value.map((row) => Number(row.fields.items))
    // Every item accounted for exactly once: a year is the one an item's first
    // record states, which is the same field the items table draws.
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(SEEDED)
    scope.stop()
  }, 60_000)

  it('states a count the items table then agrees with', async () => {
    const {
      state, scope 
    } = runFor('years')
    await settle(state)
    const first = state.rows.value.find((row) => row.fields.name === '1958')!
    expect(first.fields.items).toBe(84)
    scope.stop()

    // The press: `year:"1958"` against the items table. A count that leads to
    // a different number is the one thing this table must not do.
    const narrowed = runStream({
      expr: 'year:"1958"' 
    })
    await settle(narrowed.state)
    expect(narrowed.state.total.value).toBe(84)
    narrowed.scope.stop()
  }, 60_000)

  it('holds a year as a number, so the column sorts as years', async () => {
    const {
      state, scope 
    } = runFor('years', {
      sort: 'year',
      dir: 'desc' 
    })
    await settle(state)
    // Text would put 1999 above 2017. The seed runs to 2017.
    expect(state.rows.value[0]!.fields.year).toBe(2017)
    scope.stop()
  }, 60_000)
})
