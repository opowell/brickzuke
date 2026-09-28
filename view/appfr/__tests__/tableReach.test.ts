/**
 * A table read through the sellers' lots fetches more of them while it is up,
 * and reads itself again as they land.
 *
 * Two things pin that: which tables under which queries are read through the
 * lots at all — `country:"AT"` is on the items table and not on the sellers',
 * `type:S` on neither — and that the read a landing sets off reaches the
 * shell whole, rather than as the scan finds it one row at a time.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { QuerySink, QueryUpdate, ShellRow } from 'header-content-layout'

vi.mock('../../../model', async () => {
  const {
    ref
  } = await import('vue')
  return {
    itemTypes: ref([]),
    processingCounts: ref(false),
    selectedCounts: ref({})
  }
})

const {
  catalogSchema
} = await import('../catalogSchema')
const {
  joinedThroughLots
} = await import('../reach')
const {
  fillFor,
  held
} = await import('../tableReach')

beforeAll(() => {
  setActivePinia(createPinia())
})

function entity(key: string) {
  return catalogSchema.value.entities.find((type) => type.key === key)
}

function reads(key: string, expr: string): boolean {
  return joinedThroughLots(key, expr, [], entity(key))
}

describe('joinedThroughLots', () => {
  it('is the items table under a seller\'s country or region', () => {
    expect(reads('items', 'region:"Europe" country:"AT" type:S')).toBe(true)
    expect(reads('items', 'country:"AT"')).toBe(true)
  })

  it('is not the items table under what an item says of itself', () => {
    expect(reads('items', 'type:S')).toBe(false)
    expect(reads('items', '')).toBe(false)
  })

  it('is not a query naming the lots it is about', () => {
    expect(reads('items', 'country:"AT" store:"someone"')).toBe(false)
    expect(reads('colors', 'type:S id:"10311"')).toBe(false)
  })

  it('is not a type with no lots behind it', () => {
    expect(reads('stores', 'country:"AT"')).toBe(false)
  })
})

describe('fillFor', () => {
  const fill = (key: string, expr: string) => fillFor(key, expr, entity(key))

  it('reads a table through the lots it cannot answer without', () => {
    expect(fill('items', 'country:"AT" type:S')).toBe('lots')
    // Sellers with a set are known only from the lots.
    expect(fill('stores', 'region:"Europe" type:S')).toBe('lots')
  })

  it('fetches every seller\'s lots under anything but one item or seller', () => {
    expect(fill('inventories', 'country:"AT"')).toBe('lots')
    expect(fill('inventories', 'colorid:5')).toBe('lots')
    expect(fill('inventories', 'store:"doris"')).toBeUndefined()
    expect(fill('inventories', 'type:S id:"10311"')).toBeUndefined()
    // Every lot on BrickLink: a fill of days, run at the same pace.
    expect(fill('inventories', '')).toBe('lots')
  })

  it('lists the sellers anywhere wider than one country', () => {
    expect(fill('stores', 'region:"Europe"')).toBe('directory')
    expect(fill('stores', '')).toBe('directory')
    expect(fill('provinces', 'region:"Americas"')).toBe('directory')
    expect(fill('stores', 'country:"AT"')).toBeUndefined()
  })

  it('fetches the terms of every seller in scope, short of one named', () => {
    expect(fill('shippingMethods', 'country:"AT"')).toBe('policies')
    expect(fill('shippingCosts', 'region:"Europe" type:S')).toBe('policies')
    expect(fill('shippingCosts', 'store:"doris"')).toBeUndefined()
  })

  it('fetches what sets are made of, and what a named part is in', () => {
    expect(fill('itemInventories', 'part:"P-87615"')).toBe('lines')
    expect(fill('itemInventories', 'type:P id:"12345"')).toBe('lines')
    expect(fill('itemInventories', '')).toBe('lines')
    expect(fill('itemVariants', 'colorid:5')).toBe('lines')
  })

  it('fetches every item\'s pictures, short of the one item named', () => {
    expect(fill('images', '')).toBe('pictures')
    expect(fill('images', 'type:S')).toBe('pictures')
    expect(fill('images', 'type:S id:"10311"')).toBeUndefined()
  })

  it('leaves the rest alone', () => {
    expect(fill('items', 'type:S')).toBeUndefined()
    expect(fill('countries', 'region:"Europe"')).toBeUndefined()
    expect(fill('settings', '')).toBeUndefined()
  })
})

function row(id: string): ShellRow {
  return {
    id,
    entityKey: 'items',
    entityLabel: 'Items',
    fields: {}
  } as ShellRow
}

/** A sink recording what reaches the shell. */
function recording() {
  const said: QueryUpdate[] = []
  let closed = false
  const sink: QuerySink = {
    open: true,
    insert: () => {
      throw new Error('a held read says the page, never an insert')
    },
    set: (update) => said.push(update),
    close: () => {
      closed = true
    },
    fail: () => undefined
  }
  return {
    sink,
    said,
    closed: () => closed
  }
}

describe('held', () => {
  it('says the page once, when the read closes', () => {
    const {
      sink, said, closed
    } = recording()
    const done = vi.fn()
    const quiet = held(sink, done)
    quiet.set({
      rows: [row('a')],
      total: 1
    })
    quiet.set({
      rows: [row('a'), row('b')],
      total: 2
    })
    quiet.set({
      total: 7
    })
    expect(said).toEqual([])
    quiet.close()
    expect(said).toEqual([{
      rows: [row('a'), row('b')],
      total: 7
    }])
    expect(closed()).toBe(true)
    expect(done).toHaveBeenCalledOnce()
  })

  it('says an empty table where the read found nothing', () => {
    const {
      sink, said
    } = recording()
    const quiet = held(sink, () => undefined)
    quiet.close()
    expect(said).toEqual([{
      rows: [],
      total: 0
    }])
  })

  it('stops holding a read that runs past the hold', () => {
    vi.useFakeTimers()
    try {
      const {
        sink, said
      } = recording()
      const done = vi.fn()
      const quiet = held(sink, done, 100)
      quiet.set({
        rows: [row('a')],
        total: 1
      })
      vi.advanceTimersByTime(100)
      expect(said).toHaveLength(1)
      expect(done).toHaveBeenCalledOnce()
      quiet.set({
        rows: [row('a'), row('b')],
        total: 2
      })
      expect(said).toHaveLength(2)
      quiet.close()
      expect(done).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
