/**
 * The Items table's Store inventories column, off the lots brickzuke already
 * holds.
 *
 * `storeInventoryOf` is the number a cell shows once the fold has run — see
 * [storeInventoryCounts] for why it is a floor rather than a tally. These pin
 * the two things that make it more than a bare sum: a term naming a store, a
 * condition or a colour narrows the lots it is read from, and a term the
 * items table has already answered with does not — narrowing by it again
 * would either repeat a filter already applied or, for a field a lot does not
 * carry at all, wrongly zero every record out.
 */
import 'fake-indexeddb/auto'
import {describe, it, expect, beforeAll, vi} from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../../model', async () => {
  const {
    ref
  } = await import('vue')
  return {
    filters: ref([]),
    search: ref(undefined),
    selectedItemType: ref(null),
    itemTypes: ref([]),
    processingCounts: ref(false),
    selectedCounts: ref(undefined)
  }
})

const {
  ensureStoreInventories, storeInventoryOf
} = await import('../storeInventoryCounts')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  putAll
} = await import('../../../idb/db')
const STORES = (await import('../../../idb/stores')).default

beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  await putAll(db, STORES.STORE_LOTS, [
    {
      id: '901',
      store: 'steinehaus',
      record: 'P-3001',
      itemType: 'P',
      itemNumber: '3001',
      itemName: 'Brick 2 x 4',
      description: '',
      condition: 'U',
      colorId: '5',
      colorName: 'Red',
      quantity: 12,
      price: 0.1,
      displayPrice: 'EUR 0.10',
      nativePrice: 'US $0.12'
    },
    {
      id: '902',
      store: 'brickmeister',
      record: 'P-3001',
      itemType: 'P',
      itemNumber: '3001',
      itemName: 'Brick 2 x 4',
      description: '',
      condition: 'N',
      colorId: '86',
      colorName: 'Dark Bluish Gray',
      quantity: 30,
      price: 0.15,
      displayPrice: 'EUR 0.15',
      nativePrice: 'EUR 0.15'
    },
    {
      id: '903',
      store: 'steinehaus',
      record: 'S-10511-1',
      itemType: 'S',
      itemNumber: '10511-1',
      itemName: 'Sky Police Jet Patrol',
      description: '',
      condition: 'N',
      colorId: '0',
      colorName: '',
      quantity: 2,
      price: 24,
      displayPrice: 'EUR 24.00',
      nativePrice: 'EUR 24.00'
    }
  ])
  db.close()
  await ensureStoreInventories()
})

describe('storeInventoryOf', () => {
  it('sums every known lot of a record when the query names no store', () => {
    expect(storeInventoryOf('P-3001', '')).toBe(42)
  })

  it('narrows to the store a store: term names', () => {
    expect(storeInventoryOf('P-3001', 'store:"steinehaus"')).toBe(12)
    expect(storeInventoryOf('P-3001', 'store:"brickmeister"')).toBe(30)
  })

  it('is a real zero for a record whose known lots all belong elsewhere', () => {
    expect(storeInventoryOf('S-10511-1', 'store:"brickmeister"')).toBe(0)
  })

  it('narrows by a colour or a condition a lot carries and an item row does not', () => {
    expect(storeInventoryOf('P-3001', 'colorid:"5"')).toBe(12)
    expect(storeInventoryOf('P-3001', 'condition:"N"')).toBe(30)
  })

  it('leaves a term the items table already answered with alone', () => {
    // `category` is one of the items table's own fields — see `ITEM_FIELDS` —
    // so a category term is not asked of these lots a second time, whatever
    // it names.
    expect(storeInventoryOf('P-3001', 'category:"999"')).toBe(42)
  })

  it('is nothing at all for a record brickzuke holds no lots of', () => {
    expect(storeInventoryOf('P-9999', '')).toBeUndefined()
  })
})
