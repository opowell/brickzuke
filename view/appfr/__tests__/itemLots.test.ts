/**
 * The lots of an item the query names by its id.
 *
 * A press on the items table writes `id:"21051"` — brickzuke's own item id —
 * and a pivot to Store inventories carries that term over. An item's id is
 * not its BrickLink number: 21051 is `Brick 1 x 16`, whose page is `P=2465`.
 * These pin that the lots fetched are the ones behind the item's records, and
 * that everything else the query says still narrows them.
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
  catalogSource
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
const STORES = (await import('../../../idb/stores')).default
const {
  useCatalogItemPageStore
} = await import('../../stores/bricklink/catalog-item-page')
const {
  matchingRows
} = await import('../catalogSource')

function lot(
  invId: string,
  record: string,
  user: string,
  country: string,
  condition: string,
  colorId = '5'
) {
  const [itemType, itemNumber] = record.split('-')
  return {
    invId,
    description: '',
    price: 'EUR 1.00',
    nativePrice: 'EUR 1.00',
    colorName: colorId === '5' ? 'Red' : 'Blue',
    sellerCountryCode: country,
    sellerCountryName: country,
    sellerStoreName: user,
    strSellerUsername: user,
    condition,
    quantity: 3,
    sellerFeedbackScore: 10,
    image: '',
    itemType,
    itemNumber,
    colorId
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
  // Two colours, so the colours table has rows to narrow through the lots:
  // every lot below is Red but the Used one, which is Blue.
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
  // Two lines of two sets' inventories: the brick, and a part no lot is of.
  await putAll(db, STORES.ITEM_INVENTORIES, [
    {
      id: 'S-100-1:P-2465',
      record: 'S-100-1',
      quantity: 2,
      itemVariant: {
        itemType: 'P',
        itemId: '2465',
        name: 'Brick 1 x 16',
        thumbnail: '',
        colorId: '5',
        colorName: 'Red',
        catType: 'P',
        catString: '5',
        variantId: '2465-5',
        categoryName: 'Brick'
      }
    },
    {
      id: 'S-100-1:P-3001',
      record: 'S-100-1',
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
  // One item type, so the picker has a row to count against `type:P`.
  await putAll(db, STORES.ITEM_TYPES, [
    {
      id: 1,
      name: 'Part'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_ITEM_TYPES, [
    {
      itemTypeId: 'P',
      bzItemTypeId: 1,
      'Item Type Name': 'Part'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    {
      id: 'P-2465',
      bzItemId: 21051,
      itemType: 'P',
      Name: 'Brick 1 x 16',
      Number: '2465',
      'Category ID': '5',
      'Category Name': 'Brick'
    },
    // The same item under a second record of another type, as the items
    // table collapses them: `type:P` must leave this one out.
    {
      id: 'S-2465-1',
      bzItemId: 21051,
      itemType: 'S',
      Name: 'Brick 1 x 16',
      Number: '2465-1',
      'Category ID': '5',
      'Category Name': 'Brick'
    }
  ])
  db.close()
  // Already fetched, so the source reads rather than asks the extension.
  const store = useCatalogItemPageStore()
  store.inventoriesMap.set('P-2465', [
    lot('1', 'P-2465', 'brickmeister', 'DE', 'N'),
    lot('2', 'P-2465', 'brickmeister', 'DE', 'U', '7'),
    lot('3', 'P-2465', 'bricksusa', 'US', 'N')
  ])
  store.inventoriesMap.set('S-2465-1', [lot('4', 'S-2465-1', 'brickmeister', 'DE', 'N')])
  // And what BrickLink answered when asked for New lots in Europe — filed
  // apart from the page, under the ask. The query narrowing by condition and
  // region reads this, the page holding only a sample of the market.
  store.narrowedLotsMap.set('P-2465|cond=N|reg=6', [lot('1', 'P-2465', 'brickmeister', 'DE', 'N')])
  // And asked for Europe alone, both conditions — the conditions table's
  // ask, whole in one page, so nothing is left for its fill to fetch. Fewer
  // than the page narrowed to Europe would give (BrickLink's answer, not a
  // sample of it), which is what tells the two apart.
  store.narrowedLotsMap.set('P-2465|cond=|reg=6', [lot('2', 'P-2465', 'brickmeister', 'DE', 'U', '7')])
  store.narrowedLotsScope.set('P-2465|cond=|reg=6', {
    total: 1,
    pages: 1
  })
  // Both records' pictures stored — as none — so nothing asks for a page.
  const stored = await getDbConnection()
  await putAll(stored, STORES.ITEM_IMAGES, [
    {
      record: 'P-2465',
      images: []
    },
    {
      record: 'S-2465-1',
      images: []
    }
  ])
  stored.close()
})

/** The ids of the lots the source answers an inventories query with. */
async function lotsOf(expr: string): Promise<string[]> {
  const entity = catalogSchema.value.entities.find((one) => one.key === 'inventories')!
  const request: QueryRequest = {
    query: {
      entity: 'inventories',
      view: 'table',
      sort: 'priceValue',
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
  const page = await new Promise<{ rows: { id: string }[] }>((resolve, reject) => {
    catalogSource.stream!(request, {
      get open() {
        return true
      },
      insert() {},
      set(next) {
        resolve(next as { rows: { id: string }[] })
      },
      close() {},
      fail(thrown) {
        reject(thrown)
      }
    })
  })
  return page.rows.map((row) => row.id)
}

describe('an item\'s lots, by the item\'s id', () => {
  it('fetches the record behind the id, not a record spelled from it', async () => {
    expect(await lotsOf('type:P id:"21051"')).toEqual(['1', '2', '3'])
  })

  it('reads the same lots as the record itself', async () => {
    expect(await lotsOf('record:"P-2465"')).toEqual(['1', '2', '3'])
  })

  it('takes every record of the item when no type is named', async () => {
    expect(await lotsOf('id:"21051"')).toEqual(['1', '2', '3', '4'])
  })

  it('still narrows by everything else the query says', async () => {
    expect(await lotsOf('category:5 type:P condition:N region:Europe id:"21051"')).toEqual(['1'])
  })

  it('answers an id the catalogue has no record of with nothing', async () => {
    expect(await lotsOf('type:P id:"999999"')).toEqual([])
  })
})

/**
 * How many rows of a type the source counts against a query — the number the
 * type picker says beside the type's name.
 */
async function countOf(entityKey: string, expr: string): Promise<number> {
  const entity = catalogSchema.value.entities.find((one) => one.key === entityKey)!
  const request: QueryRequest = {
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
    limit: 0,
    offset: 0
  }
  return (await catalogSource.query(request)).total
}

/*
 * The picker counts every type against the same expression, `id:` included —
 * and `id` on every other table is the row's own, which is never the item's.
 * Read as a filter it zeroed every count beside `item: Brick 1 x 16`; read as
 * the item's address, the rest of the query is what narrows each type.
 */
describe('the type picker, over a query naming an item', () => {
  const NARROWED = 'type:P condition:N region:Europe id:"21051"'

  it('counts the one item type the query names', async () => {
    expect(await countOf('itemTypes', NARROWED)).toBe(1)
  })

  it('counts the one condition the query names, over the item\'s lots', async () => {
    expect(await countOf('conditions', NARROWED)).toBe(1)
    expect(await countOf('conditions', 'type:P id:"21051"')).toBe(2)
  })

  it('counts the one region the query names', async () => {
    expect(await countOf('regions', NARROWED)).toBe(1)
  })

  it('counts the colours the item\'s matching lots come in', async () => {
    expect(await countOf('colors', NARROWED)).toBe(1)
    expect(await countOf('colors', 'type:P id:"21051"')).toBe(2)
  })

  it('counts the countries and sellers of the item\'s matching lots', async () => {
    expect(await countOf('countries', NARROWED)).toBe(1)
    expect(await countOf('countries', 'type:P id:"21051"')).toBe(2)
    expect(await countOf('stores', NARROWED)).toBe(1)
  })

  it('counts the set lines and variants that are of the item', async () => {
    expect(await countOf('itemInventories', 'id:"21051"')).toBe(1)
    expect(await countOf('itemVariants', 'id:"21051"')).toBe(1)
  })

  it('still counts the item itself by its id', async () => {
    expect(await countOf('items', NARROWED)).toBe(1)
    expect(await countOf('items', 'type:P id:"999999"')).toBe(0)
  })
})

/** A type's rows for a query, as the table shows them. */
async function rowsOf(entityKey: string, expr: string) {
  const entity = catalogSchema.value.entities.find((one) => one.key === entityKey)!
  return matchingRows({
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
  })
}

/*
 * The colours table over the lots — the conditions table's cross-section, on
 * the one dimension of a lot it never had.
 */
describe('the colours table, over the lots a query reaches', () => {
  it('is the colours of the item\'s lots, each counted', async () => {
    const rows = await rowsOf('colors', 'type:P id:"21051"')
    expect(rows.map((row) => [row.fields.name, row.fields.lots, row.fields.quantity])).toEqual([
      ['Blue', 1, 3],
      ['Red', 2, 6]
    ])
  })

  it('puts a condition and a region to the lots, not to the colours', async () => {
    const rows = await rowsOf('colors', 'type:P condition:N region:Europe id:"21051"')
    expect(rows.map((row) => [row.fields.name, row.fields.lots])).toEqual([['Red', 1]])
  })

  it('leaves a term a colour can answer to the colour, and counts nothing', async () => {
    const rows = await rowsOf('colors', 'name:Red')
    expect(rows.map((row) => [row.fields.name, row.fields.lots])).toEqual([['Red', undefined]])
  })

  it('is every colour when nothing asks about lots', async () => {
    expect((await rowsOf('colors', '')).map((row) => row.fields.name)).toEqual(['Blue', 'Red'])
  })

  /*
   * A bound on quantity is a bound on the lots, and the pieces then summed
   * beside a colour are the pieces of the lots that passed — not a second
   * bound on the sum, which would drop Red under `quantity<5` for its two
   * lots of three adding up to six.
   */
  it('puts a bound on quantity to the lots, and not again to their sum', async () => {
    const rows = await rowsOf('colors', 'type:P id:"21051" quantity<5')
    expect(rows.map((row) => [row.fields.name, row.fields.lots, row.fields.quantity])).toEqual([
      ['Blue', 1, 3],
      ['Red', 2, 6]
    ])
    expect((await rowsOf('colors', 'type:P id:"21051" quantity>3')).map((row) => row.fields.name)).toEqual([])
  })

  it('leaves a bound on lots to the colour, no lot carrying one', async () => {
    const rows = await rowsOf('colors', 'type:P id:"21051" lots>1')
    expect(rows.map((row) => [row.fields.name, row.fields.lots])).toEqual([['Red', 2]])
  })

  it('leaves a quantity of the row\'s own alone', async () => {
    // A set's inventory line has its own quantity — how many of the part the
    // set holds — which a lot's bound is not about, and the join's sum must
    // not write over.
    const rows = await rowsOf('itemInventories', 'condition:N')
    expect(rows.map((row) => [row.fields.part, row.fields.quantity, row.fields.lots])).toEqual([
      ['P-2465', 2, 2]
    ])
    expect(await rowsOf('itemInventories', 'condition:N quantity>3')).toEqual([])
  })
})

/** The rows of a type as the source streams them, settled: the last page set before it closed. */
async function settledRowsOf(entityKey: string, expr: string): Promise<Record<string, unknown>[]> {
  const entity = catalogSchema.value.entities.find((one) => one.key === entityKey)!
  const request: QueryRequest = {
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
  return await new Promise((resolve, reject) => {
    let last: { fields: Record<string, unknown> }[] = []
    catalogSource.stream!(request, {
      get open() {
        return true
      },
      insert() {},
      set(next) {
        last = (next as { rows: { fields: Record<string, unknown> }[] }).rows
      },
      close() {
        resolve(last.map((row) => row.fields))
      },
      fail(thrown) {
        reject(thrown)
      }
    })
  })
}

/*
 * The conditions table over an item in a region counts both conditions off
 * the region's own ask — not the un-narrowed page, which is a sample of the
 * whole market and not of Europe — and runs the same fill over it, so a
 * count is of the whole answer once the pages are in. The page narrowed to
 * Europe would say one of each; the region's ask says one used and no new.
 */
describe('the conditions table, over an item\'s lots in a region', () => {
  it('counts both conditions off the region\'s ask', async () => {
    const rows = await settledRowsOf('conditions', 'type:P region:Europe id:"21051"')
    const byCode = new Map(rows.map((row) => [row.condition, row.lots]))
    expect(byCode.get('N')).toBe(0)
    expect(byCode.get('U')).toBe(1)
  })

  it('keeps both conditions under a bound on quantity no lot meets', async () => {
    const rows = await settledRowsOf('conditions', 'type:P id:"21051" quantity>10')
    expect(rows.map((row) => [row.condition, row.lots, row.quantity])).toEqual([
      ['N', 0, 0],
      ['U', 0, 0]
    ])
  })
})

/*
 * The same join with no item named: the lots are every one held, walked, and
 * a type is what those lots reach — the items card's reading, now the items
 * table's and the picker's too.
 */
describe('a query naming no item, joined through every lot held', () => {
  it('narrows the items to the ones with such a lot', async () => {
    expect(await countOf('items', 'condition:U')).toBe(1)
    expect(await countOf('items', 'condition:U country:US')).toBe(0)
  })

  it('narrows the countries the same way', async () => {
    expect((await rowsOf('countries', 'condition:U')).map((row) => row.id)).toEqual(['DE'])
  })

  it('leaves a type alone under a term it answers itself', async () => {
    expect((await rowsOf('countries', 'region:Europe')).map((row) => row.id)).toEqual(['DE'])
    expect(await countOf('countries', 'name:United')).toBe(1)
  })
})
