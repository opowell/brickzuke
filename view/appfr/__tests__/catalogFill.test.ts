/**
 * The catalogue's own tables, fetched while they are up.
 *
 * Pinned: a named part is asked what it is in and a named set what it is made
 * of; un-narrowed, every inventory not stored is asked for, newest first, and
 * every item's pictures of the types asked for; nothing is asked twice; and a
 * run of failures slows the fill rather than ending it.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'

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

/** Every ask made, as `kind record`, in order. */
const asked: string[] = []
/** Records whose asks fail. */
const failing = new Set<string>()

async function answer(kind: string, record: string) {
  asked.push(`${kind} ${record}`)
  if (failing.has(record)) {
    throw new Error('no answer')
  }
  return []
}

vi.mock('../appearancesFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../appearancesFetch')>()
  return {
    ...original,
    appearancesFor: (record: string) => answer('in', record)
  }
})

vi.mock('../inventoryFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../inventoryFetch')>()
  return {
    ...original,
    inventoryFor: (record: string) => answer('of', record)
  }
})

vi.mock('../itemPageFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../itemPageFetch')>()
  return {
    ...original,
    imagesFor: (record: string) => answer('pictures', record),
    imagedRecords: async () => new Set(['S-2000-1'])
  }
})

const {
  startCatalogFill,
  stopCatalogFill
} = await import('../catalogFill')
const {
  reachGapMs
} = await import('../settings')

beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  const item = (id: string, year: string) => ({
    id,
    itemType: id[0],
    Name: id,
    Number: id.slice(2),
    'Year Released': year
  })
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    item('S-1000-1', '1990'),
    item('S-2000-1', '2020'),
    item('S-3000-1', '2010'),
    item('M-fig001', '2015'),
    item('P-3001', '1958'),
    item('P-3002', '1958'),
    item('P-3003', '1958')
  ])
  // A set whose parts somebody opened: not asked for again.
  await putAll(db, STORES.ITEM_INVENTORIES, [
    {
      id: 'S-3000-1|3001-1',
      record: 'S-3000-1',
      quantity: 1,
      itemVariant: {}
    }
  ])
  db.close()
})

beforeEach(() => {
  asked.length = 0
  failing.clear()
  reachGapMs.value = 100
  vi.useFakeTimers()
})

afterEach(() => {
  stopCatalogFill()
  vi.useRealTimers()
})

async function settle(ms = 10_000): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('the lines of inventories', () => {
  it('asks a named part what it is in, and nothing else', async () => {
    startCatalogFill('lines', 'part:"P-3001"')
    await settle()
    expect(asked).toEqual(['in P-3001'])
  })

  it('asks a named minifigure what it is made of and what it is in', async () => {
    startCatalogFill('lines', 'record:"M-fig001"')
    await settle()
    expect(asked).toEqual(['of M-fig001', 'in M-fig001'])
  })

  it('asks for every inventory not stored, newest first, when nothing is named', async () => {
    startCatalogFill('lines', '')
    await settle()
    // S-3000-1 is opened already, the minifigure was asked about above, and a
    // part is made of nothing.
    expect(asked).toEqual(['of S-2000-1', 'of S-1000-1'])
  })

  it('asks nothing twice in a session', async () => {
    startCatalogFill('lines', 'colorid:5')
    await settle()
    expect(asked).toEqual([])
  })
})

describe('the pictures', () => {
  it('asks for the pictures of every item of the types named that has none', async () => {
    startCatalogFill('pictures', 'type:S')
    await settle()
    // S-2000-1's are stored.
    expect(asked).toEqual(['pictures S-1000-1', 'pictures S-3000-1'])
  })

  it('slows down after a run of failures, and does not stop', async () => {
    failing.add('M-fig001')
    failing.add('P-3001')
    failing.add('P-3002')
    startCatalogFill('pictures', '')
    await settle(1_000)
    // The sets were stored or asked above; then three failures in a row.
    expect(asked).toEqual(['pictures M-fig001', 'pictures P-3001', 'pictures P-3002'])
    // A minute later, not a glance: slowed, and still going.
    await settle(30_000)
    expect(asked).toHaveLength(3)
    await settle(31_000)
    expect(asked.at(-1)).toBe('pictures P-3003')
  })
})
