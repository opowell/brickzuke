/**
 * The pictures of every item the query matches.
 *
 * The images table used to be whatever this session had loaded and no more:
 * after a reload, `type:P region:Europe` was an empty table under a card
 * saying `Images · 0`, and nothing about the query could change that. These
 * pin the two halves of the answer — that a picture carries its item's own
 * facts, so a term about the item narrows the pictures the way it narrows
 * the items; and that what is not loaded yet is fetched behind the table,
 * for exactly the items the items table would list, one page at a time —
 * and kept, so a reload does not ask for them again.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { QueryRequest, ShellRow } from 'header-content-layout'

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

/** The records whose page was asked for, in the order they were. */
const asked: string[] = []

/** What BrickLink's image list says of each record, standing in for the page. */
const PICTURES: Record<string, { id: string; image: string }[]> = {
  'P-2465': [
    {
      id: 'img-a',
      image: 'https://img.example/a.png'
    }
  ],
  'P-3001': [
    {
      id: 'img-b',
      image: 'https://img.example/b.png'
    }
  ]
}

/*
 * The page fetch, standing in for the extension: asking for a record's
 * pictures stores them the way the response handler would. Everything else
 * of the module is the real thing, `readImages` and `hasPage` included.
 */
vi.mock('../itemPageFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../itemPageFetch')>()
  return {
    ...original,
    imagesFor: async (record: string) => {
      asked.push(record)
      const {
        getDbConnection
      } = await import('../../../idb/idb')
      const {
        put
      } = await import('../../../idb/db')
      const STORES = (await import('../../../idb/stores')).default
      const db = await getDbConnection()
      try {
        if ((await db.getKey(STORES.ITEM_IMAGES.name, record)) === undefined) {
          await put(db, STORES.ITEM_IMAGES, {
            record,
            images: PICTURES[record] ?? []
          })
        }
      } finally {
        db.close()
      }
      return original.readImages(record)
    }
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

function lot(invId: string, record: string, user: string, country: string) {
  const [itemType, itemNumber] = record.split('-')
  return {
    invId,
    description: '',
    price: 'EUR 1.00',
    nativePrice: 'EUR 1.00',
    colorName: 'Red',
    sellerCountryCode: country,
    sellerCountryName: country,
    sellerStoreName: user,
    strSellerUsername: user,
    condition: 'N',
    quantity: 3,
    sellerFeedbackScore: 10,
    image: '',
    itemType,
    itemNumber,
    colorId: '5'
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
  // Two bricks, and a minifigure whose page nothing here can read.
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    {
      id: 'P-2465',
      bzItemId: 21051,
      itemType: 'P',
      Name: 'Brick 1 x 16',
      Number: '2465',
      'Category ID': '5',
      'Category Name': 'Brick',
      'Year Released': '2010'
    },
    {
      id: 'P-3001',
      bzItemId: 1,
      itemType: 'P',
      Name: 'Brick 2 x 4',
      Number: '3001',
      'Category ID': '5',
      'Category Name': 'Brick',
      'Year Released': '1958'
    },
    {
      id: 'M-fig001',
      bzItemId: 2,
      itemType: 'M',
      Name: 'Figure',
      Number: 'fig001',
      'Category ID': '9',
      'Category Name': 'Minifigure',
      'Year Released': '2010'
    }
  ])
  // The long brick sells in Germany and the short one in the States; only
  // the long one's pictures are stored.
  await putAll(db, STORES.ITEM_IMAGES, [
    {
      record: 'P-2465',
      images: PICTURES['P-2465']
    }
  ])
  db.close()
  const store = useCatalogItemPageStore()
  store.inventoriesMap.set('P-2465', [lot('1', 'P-2465', 'brickmeister', 'DE')])
  store.inventoriesMap.set('P-3001', [lot('2', 'P-3001', 'bricksusa', 'US')])
})

beforeEach(() => {
  asked.length = 0
})

/** The images table under a query, as the shell has it once the stream closes. */
async function imagesUnder(expr: string): Promise<ShellRow[]> {
  const entity = catalogSchema.value.entities.find((one) => one.key === 'images')!
  const request: QueryRequest = {
    query: {
      entity: 'images',
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
  return new Promise<ShellRow[]>((resolve, reject) => {
    let rows: ShellRow[] = []
    catalogSource.stream!(request, {
      get open() {
        return true
      },
      insert() {},
      set(next) {
        if (next.rows) {
          rows = next.rows
        }
      },
      close() {
        resolve(rows)
      },
      fail(thrown) {
        reject(thrown)
      }
    })
  })
}

describe('a picture, as a row', () => {
  it('carries what the catalogue says of its item', async () => {
    const [row] = await imagesUnder('record:"P-2465"')
    expect(row.fields).toMatchObject({
      record: 'P-2465',
      name: 'Brick 1 x 16',
      category: 5,
      categoryName: 'Brick',
      year: '2010',
      type: 'P'
    })
  })
})

describe('the pictures of the items a query matches', () => {
  it('narrows by a term about the item, as the items table would', async () => {
    const rows = await imagesUnder('name:"1 x 16"')
    expect(rows.map((row) => row.id)).toEqual(['img-a'])
    // The one item the query matches is loaded already: nothing to ask for.
    expect(asked).toEqual([])
  })

  it('fetches the pictures of a matching item nobody has opened', async () => {
    // The short brick is the one with a lot in the States, and its page has
    // not been read — so the table starts empty and the fill goes and asks.
    const rows = await imagesUnder('type:P region:"North America"')
    expect(asked).toEqual(['P-3001'])
    expect(rows.map((row) => row.id)).toEqual(['img-b'])
  }, 15_000)

  it('leaves alone the pictures of an item the query does not reach', async () => {
    const rows = await imagesUnder('year:2010')
    // Both bricks are loaded by now; the one from 1958 stays off the table,
    // and the minifigure — also from 2010 — has no page to ask for.
    expect(rows.map((row) => row.id)).toEqual(['img-a'])
    expect(asked).toEqual([])
  })

  it('reads the item the query names by its id', async () => {
    const rows = await imagesUnder('id:"21051"')
    expect(rows.map((row) => row.id)).toEqual(['img-a'])
  })
})
