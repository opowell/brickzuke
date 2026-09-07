/**
 * The home screen's counts for the types no bulk download fills.
 *
 * `setCounts` in model.ts counts the five stores an update run writes, and
 * nothing counted the other nine — so every card below the first row read as a
 * bare label whatever was stored under it. What is asserted here is that each
 * card now states what its own table would show, and that a type nobody has
 * fetched still says nothing rather than saying nought.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

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
  refreshCounts
} = await import('../catalogCounts')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  useCatalogItemPageStore
} = await import('../../stores/bricklink/catalog-item-page')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  putAll
} = await import('../../../idb/db')
const STORES = (await import('../../../idb/stores')).default

/** What the card for one type reads, which is the whole of this screen. */
const cardCount = (key: string) =>
  catalogSchema.value.entities.find((entity) => entity.key === key)!.count

/** One part of one set, as `catalog-item-inv-page` stores it. */
function stored(id: string, record: string, variantId: string) {
  return {
    id,
    record,
    quantity: 1,
    itemVariant: {
      variantId,
      itemId: variantId.split('-')[0],
      itemType: 'P',
      name: 'Brick 2 x 4',
      colorId: '5',
      colorName: 'Red',
      catString: '5',
      categoryName: 'Brick',
      thumbnail: 'https://img.example/3001.png'
    }
  }
}

beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  await putAll(db, STORES.STORE_REGIONS, [
    {
      name: 'Europe',
      countryCount: 2
    },
    {
      name: 'North America',
      countryCount: 1
    }
  ])
  await putAll(db, STORES.STORE_COUNTRIES, [
    {
      countryCode: 'DE',
      countryName: 'Germany',
      regionId: 'Europe'
    },
    {
      countryCode: 'NL',
      countryName: 'Netherlands',
      regionId: 'Europe'
    },
    {
      countryCode: 'US',
      countryName: 'United States',
      regionId: 'North America'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_STORES, [
    {
      id: 'brickmeister',
      name: 'Brickmeister',
      countryID: 'DE'
    },
    {
      id: 'bricksusa',
      name: 'Bricks USA',
      countryID: 'US'
    }
  ])
  // Three parts across two sets, and the red 2x4 is in both of them — so the
  // two tables over these records do not state the same number.
  await putAll(db, STORES.ITEM_INVENTORIES, [
    stored('S-10511-1:3001-5', 'S-10511-1', '3001-5'),
    stored('S-10511-1:3002-5', 'S-10511-1', '3002-5'),
    stored('S-60051-1:3001-5', 'S-60051-1', '3001-5')
  ])
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    {
      id: '3001',
      bzItemId: 1,
      itemType: 'P',
      Name: 'Brick 2 x 4',
      'Year Released': '1958'
    },
    {
      id: '3002',
      bzItemId: 2,
      itemType: 'P',
      Name: 'Brick 2 x 3',
      'Year Released': '1958'
    },
    {
      id: '10511',
      bzItemId: 3,
      itemType: 'S',
      Name: 'Great Train',
      'Year Released': '2013'
    }
  ])
  db.close()

  const store = useCatalogItemPageStore()
  store.inventoriesMap.set('P-3001', [
    {
      invId: 'lot-1'
    },
    {
      invId: 'lot-2'
    }
  ] as never)
  store.imagesMap.set('P-3001', [
    {
      id: 'img-1',
      image: 'https://img.example/a.png'
    }
  ] as never)

  await refreshCounts()
})

describe('the store directory', () => {
  it('counts what is stored, one card per table', () => {
    expect(cardCount('regions')).toBe('2')
    expect(cardCount('countries')).toBe('3')
    expect(cardCount('stores')).toBe('2')
  })
})

describe('the two inventory tables', () => {
  it('counts the parts, and separately the variants they fold into', () => {
    // Three records; the red 2x4 turns up in both sets, so two variants. The
    // same fold `itemVariantRows` makes to build that table.
    expect(cardCount('itemInventories')).toBe('3')
    expect(cardCount('itemVariants')).toBe('2')
  })
})

describe('what is only ever in memory', () => {
  it('counts the lots and the pictures read this session', () => {
    expect(cardCount('inventories')).toBe('2')
    expect(cardCount('images')).toBe('1')
  })
})

describe('years', () => {
  it('counts the distinct years rather than the items in them', () => {
    // Three items across two years, which is what the Years table draws.
    expect(cardCount('years')).toBe('2')
  })
})

describe('conditions', () => {
  it('is a fixed pair rather than anything counted', () => {
    // BrickLink sells New and Used and nothing else, whether or not a single
    // lot has been read.
    expect(cardCount('conditions')).toBe('2')
  })
})

describe('a type nobody has fetched', () => {
  it('says nothing rather than nought', async () => {
    const db = await getDbConnection()
    await db.clear(STORES.STORE_REGIONS.name)
    db.close()
    await refreshCounts()
    // A card reading `0` for a directory nobody has asked for states a number
    // brickzuke never gave — the same rule `population` follows for the five
    // bulk-download tables while their counts are still running.
    expect(cardCount('regions')).toBe('')
  })
})
