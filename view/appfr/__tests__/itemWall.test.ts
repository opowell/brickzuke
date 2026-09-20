/**
 * The wall under a query naming an item.
 *
 * `id:"30001"` is a question about one item, and every card should answer it:
 * the sellers who have it, the countries they are in, the sets it is a line
 * of, the lists that want it, the carts holding a lot of it. Two things made
 * the wall stand at its population instead. The item's lots were read off its
 * page alone, which is held for the session — so after a reload the join had
 * no lot to read a seller off, while the sellers' own fronts held hundreds of
 * the item's lots that nothing looked at. And the types about the item itself
 * were read through those lots too, so an item nobody sells was in no set
 * and wanted by no list.
 *
 * These pin both halves: the stored lots of the item join in beside its
 * page's, and the types about the item are read off the item, exactly, lot
 * or no lot.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { QueryRequest } from 'header-content-layout'

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
  catalogSource,
  matchingRows,
  yearCount
} = await import('../catalogSource')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  previewFor
} = await import('../catalogPreviews')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  putAll
} = await import('../../../idb/db')
const STORES = (await import('../../../idb/stores')).default

/** One lot off a seller's front, as the store keeps it. */
function storedLot(id: string, record: string, store: string, colorId = '5') {
  const [itemType, itemNumber] = record.split('-')
  return {
    id,
    store,
    record,
    itemType,
    itemNumber,
    itemName: record,
    description: '',
    condition: 'N',
    colorId,
    colorName: 'Red',
    quantity: 2,
    price: 0.1,
    displayPrice: 'EUR 0.10',
    nativePrice: 'EUR 0.10'
  }
}

beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  await putAll(db, STORES.STORE_REGIONS, [
    {
      name: 'Europe',
      countryCount: 1
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
  // Two items. Nobody's page has been read this session; what is known of
  // who sells them is the sellers' fronts, and only the German one stocks
  // the brick. The tile is in nobody's front at all.
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    {
      id: 'P-3001',
      bzItemId: 30001,
      itemType: 'P',
      Name: 'Brick 2 x 4',
      Number: '3001',
      'Category ID': '5',
      'Category Name': 'Brick',
      'Year Released': '1958'
    },
    {
      id: 'P-3070',
      bzItemId: 30070,
      itemType: 'P',
      Name: 'Tile 1 x 1',
      Number: '3070',
      'Category ID': '37',
      'Category Name': 'Tile',
      'Year Released': '1995'
    }
  ])
  await putAll(db, STORES.STORE_LOTS, [
    storedLot('1', 'P-3001', 'brickmeister'),
    storedLot('2', 'P-3001', 'brickmeister', '7'),
    storedLot('3', 'P-2456', 'bricksusa')
  ])
  await putAll(db, STORES.CATEGORIES, [
    {
      id: 1
    },
    {
      id: 2
    }
  ])
  await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
    {
      categoryId: '5',
      bzCategoryId: 1,
      catType: 'P',
      'Category Name': 'Brick',
      items: 4_000
    },
    {
      categoryId: '37',
      bzCategoryId: 2,
      catType: 'P',
      'Category Name': 'Tile',
      items: 1_500
    }
  ])
  await putAll(db, STORES.COLORS, [
    {
      id: 1,
      name: 'Red'
    },
    {
      id: 2,
      name: 'Blue'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_COLORS, [
    {
      colorId: '5',
      bzColorId: 1,
      'Color Name': 'Red'
    },
    {
      colorId: '7',
      bzColorId: 2,
      'Color Name': 'Blue'
    }
  ])
  // Two sets: one has the tile in it, the other the brick.
  await putAll(db, STORES.ITEM_INVENTORIES, [
    {
      id: 'S-100-1:P-3070',
      record: 'S-100-1',
      quantity: 2,
      itemVariant: {
        itemType: 'P',
        itemId: '3070',
        name: 'Tile 1 x 1',
        thumbnail: '',
        colorId: '5',
        colorName: 'Red',
        catType: 'P',
        catString: '37',
        variantId: '3070-5',
        categoryName: 'Tile'
      }
    },
    {
      id: 'S-200-1:P-3001',
      record: 'S-200-1',
      quantity: 4,
      itemVariant: {
        itemType: 'P',
        itemId: '3001',
        name: 'Brick 2 x 4',
        thumbnail: '',
        colorId: '5',
        colorName: 'Red',
        catType: 'P',
        catString: '5',
        variantId: '3001-5',
        categoryName: 'Brick'
      }
    }
  ])
  // Two lists, of which one wants the tile; two carts, of which one holds a
  // lot of the tile.
  await putAll(db, STORES.SHOP_LISTS, [
    {
      id: 1,
      name: 'Tiles',
      createdAt: new Date()
    },
    {
      id: 2,
      name: 'Nothing yet',
      createdAt: new Date()
    }
  ])
  await putAll(db, STORES.SHOP_LIST_ITEMS, [
    {
      id: 1,
      listId: 1,
      record: 'P-3070',
      minQuantity: 10
    }
  ])
  await putAll(db, STORES.CARTS, [
    {
      id: 1,
      name: 'Tiles order',
      createdAt: new Date()
    },
    {
      id: 2,
      name: 'Empty',
      createdAt: new Date()
    }
  ])
  await putAll(db, STORES.CART_LINES, [
    {
      id: 1,
      cartId: 1,
      lotId: '9',
      store: 'bricksusa',
      record: 'P-3070',
      quantity: 1
    }
  ])
  db.close()
})

function requestFor(entityKey: string, expr: string): QueryRequest {
  const entity = catalogSchema.value.entities.find((one) => one.key === entityKey)!
  return {
    query: {
      entity: entityKey,
      view: 'table',
      sort: 'name',
      dir: 'asc',
      expr,
      facets: {},
      page: 1
    },
    schema: catalogSchema.value,
    entity,
    limit: 50,
    offset: 0
  }
}

/** The number the type picker says beside the type, under the query. */
async function countOf(entityKey: string, expr: string): Promise<number> {
  return (
    await catalogSource.query({
      ...requestFor(entityKey, expr),
      limit: 0
    })
  ).total
}

/** The type's rows under the query, by id. */
async function idsOf(entityKey: string, expr: string): Promise<string[]> {
  return (await matchingRows(requestFor(entityKey, expr))).map((row) => row.id)
}

describe('the sellers of an item whose page nobody has read', () => {
  it('are the ones whose stored fronts hold a lot of it', async () => {
    expect(await idsOf('stores', 'id:"30001"')).toEqual(['brickmeister'])
    expect(await idsOf('countries', 'id:"30001"')).toEqual(['DE'])
    expect(await idsOf('regions', 'id:"30001"')).toEqual(['Europe'])
  })

  it('come with the colours those lots are in', async () => {
    expect(await countOf('colors', 'id:"30001"')).toBe(2)
  })

  it('are the lots table itself, so the two agree', async () => {
    expect((await idsOf('inventories', 'id:"30001"')).sort()).toEqual(['1', '2'])
  })

  it('leave every seller standing where the item has no stored lot and no page', async () => {
    // Nothing is known, which is not the same as nobody: see the note on
    // `walked.lots` in [reachFor].
    expect(await countOf('stores', 'id:"30070"')).toBe(2)
  })
})

describe('the types about the item itself, lot or no lot', () => {
  it('are the sets the item is a line of', async () => {
    expect(await idsOf('itemInventories', 'id:"30070"')).toEqual(['S-100-1:P-3070'])
    expect(await idsOf('itemInventories', 'id:"30001"')).toEqual(['S-200-1:P-3001'])
  })

  it('are the lists that want it and the carts holding a lot of it', async () => {
    expect(await idsOf('shopLists', 'id:"30070"')).toEqual(['1'])
    expect(await idsOf('carts', 'id:"30070"')).toEqual(['1'])
    expect(await countOf('shopLists', 'id:"30001"')).toBe(0)
    expect(await countOf('carts', 'id:"30001"')).toBe(0)
  })

  it('are the one category and year the item has', async () => {
    expect(await idsOf('categories', 'id:"30070"')).toEqual(['37'])
    // The years are a pass over the catalogue, made once — the home screen
    // makes it; here it has to be asked for.
    await yearCount()
    expect(await idsOf('years', 'id:"30070"')).toEqual(['1995'])
  })

  it('reach nothing for an id the catalogue has no record of', async () => {
    expect(await countOf('shopLists', 'id:"999999"')).toBe(0)
    expect(await countOf('itemInventories', 'id:"999999"')).toBe(0)
  })
})

describe('the cards over them', () => {
  it('say the number plainly where the item was read rather than its lots', async () => {
    const lists = await previewFor('shopLists', 'id:"30070"')
    expect(lists.count).toBe(1)
    expect(lists.estimated).toBeFalsy()
    expect(lists.tiles.map((tile) => tile.label)).toEqual(['Tiles'])
    const lines = await previewFor('itemInventories', 'id:"30070"')
    expect(lines.count).toBe(1)
    expect(lines.estimated).toBeFalsy()
  })

  it('leave the items card off, that being the term in the header', async () => {
    const items = await previewFor('items', 'id:"30070"')
    expect(items.count).toBe(1)
    expect(items.pinned).toBe(true)
  })

  it('keep the `~` on the sellers, the fronts being a fraction of them', async () => {
    const stores = await previewFor('stores', 'id:"30001"')
    expect(stores.count).toBe(1)
    expect(stores.estimated).toBe(true)
  })
})
