/**
 * The tables brickzuke fills by browsing rather than by downloading: the store
 * directory, the lots on offer and the two cross-sections over them.
 *
 * These are the half of the catalogue that has no bulk download behind it, so
 * what is asserted here is mostly about where the rows come from — an indexed
 * lookup per country rather than a filter over every seller, the pinia maps
 * for what is only ever in memory, and no scrape at all from a table that is
 * already stored. Getting that wrong is not a wrong number on screen but a
 * request to BrickLink that should never have been made.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'
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
  catalogSource
} = await import('../catalogSource')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  readStores
} = await import('../storesFetch')
const {
  readStoreLots, storeScopeVersion
} = await import('../storeLotsFetch')
const {
  storeIds
} = await import('../../stores/bricklink/store-front-page')
const {
  useCatalogItemPageStore
} = await import('../../stores/bricklink/catalog-item-page')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  put, putAll
} = await import('../../../idb/db')
const STORES = (await import('../../../idb/stores')).default

const entity = (key: string) => catalogSchema.value.entities.find((e) => e.key === key)!

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
      regionId: 'Europe',
      countryCode: 'DE',
      groupState: 'N',
      image: 'https://img.example/de.gif',
      countryName: 'Germany',
      storeCount: 900
    },
    {
      regionId: 'Europe',
      countryCode: 'NL',
      groupState: 'N',
      image: 'https://img.example/nl.gif',
      countryName: 'Netherlands',
      storeCount: 400
    },
    {
      regionId: 'North America',
      countryCode: 'US',
      groupState: 'Y',
      image: 'https://img.example/us.gif',
      countryName: 'United States',
      storeCount: 1_200
    }
  ])
  await putAll(db, STORES.BRICK_LINK_STORES, [
    {
      id: 'brickmeister',
      name: 'Brickmeister',
      countryID: 'DE',
      stateName: undefined,
      items: 12_000,
      instantCheckout: true
    },
    {
      id: 'steinehaus',
      name: 'Steinehaus',
      countryID: 'DE',
      stateName: 'Bayern',
      items: 3_000,
      instantCheckout: false
    },
    {
      id: 'bricksusa',
      name: 'Bricks USA',
      countryID: 'US',
      stateName: 'Ohio',
      items: 40_000,
      instantCheckout: false
    }
  ])
  db.close()
})

/** The shell's own reader, so what is asserted is the contract it implements. */
function runStream(overrides: Partial<ShellQuery> & { entity: string }) {
  const query = ref<ShellQuery>({
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
      entity: computed(() => entity(overrides.entity)),
      limit: computed(() => 50),
    })
  })
  return {
    state,
    scope
  }
}

/** Waits for a stream that reads IndexedDB and nothing else. */
async function rowsOf(overrides: Partial<ShellQuery> & { entity: string }) {
  const {
    state, scope
  } = runStream(overrides)
  for (let i = 0; i < 50 && state.pending.value; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const rows = state.rows.value.slice()
  scope.stop()
  return rows
}

describe('countries', () => {
  it('states BrickLink\'s own store count, which is known before any seller is', async () => {
    const rows = await rowsOf({
      entity: 'countries'
    })
    const germany = rows.find((row) => row.fields.country === 'DE')!
    expect(germany.fields.name).toBe('Germany')
    // Off the directory page rather than off the sellers: nobody has fetched a
    // German store here, and the count is still 900.
    expect(germany.fields.stores).toBe(900)
    expect(germany.fields.region).toBe('Europe')
  })

  it('narrows to one region, the region being a field and not an address', async () => {
    const rows = await rowsOf({
      entity: 'countries',
      expr: 'region:"Europe"'
    })
    expect(rows.map((row) => row.fields.country).sort()).toEqual(['DE', 'NL'])
  })
})

describe('regions', () => {
  it('counts the countries under it', async () => {
    const rows = await rowsOf({
      entity: 'regions'
    })
    expect(rows.find((row) => row.fields.name === 'Europe')!.fields.countries).toBe(2)
  })
})

describe('stores', () => {
  it('reads one country through the index rather than filtering all of them', async () => {
    // The same answer either way, which is why this asserts the read as well:
    // a country's page is fetched when that country has no sellers stored, so
    // an address that quietly matched everything would never fetch anything.
    expect((await readStores('DE')).map((store) => store.id).sort()).toEqual([
      'brickmeister',
      'steinehaus'
    ])
    const rows = await rowsOf({
      entity: 'stores',
      expr: 'country:"DE"'
    })
    expect(rows.map((row) => row.fields.id).sort()).toEqual(['brickmeister', 'steinehaus'])
  })

  it('carries the directory\'s count under `items`, not under `lots`', async () => {
    const rows = await rowsOf({
      entity: 'stores',
      expr: 'country:"DE"'
    })
    // What BrickLink prints after the name is every brick the seller has for
    // sale, counted one by one — not how many listings they are spread over.
    // The two are far apart: the biggest German seller states 23,489,659 of
    // them, more than there are part-and-colour pairs to make lots out of.
    expect(rows.find((row) => row.fields.id === 'brickmeister')!.fields.items).toBe(12_000)
    expect(rows.find((row) => row.fields.id === 'brickmeister')!.fields.lots).toBeUndefined()
  })

  it('draws instant checkout as a word rather than as a boolean', async () => {
    const rows = await rowsOf({
      entity: 'stores',
      expr: 'country:"DE"'
    })
    // The original prints the raw flag, which puts `false` in every row that
    // has not got it. A blank cell is what "not this one" looks like.
    expect(rows.find((row) => row.fields.id === 'brickmeister')!.fields.instantCheckout)
      .toBe('Instant')
    expect(rows.find((row) => row.fields.id === 'steinehaus')!.fields.instantCheckout).toBe('')
  })

  it('carries the region its country is in, so a region term narrows sellers', async () => {
    // A seller states its country and never its region — and an unresolvable
    // field in this language matches every row rather than none, so without
    // the region on the row `region:"Europe"` listed every store on BrickLink
    // under a heading saying Europe.
    const rows = await rowsOf({
      entity: 'stores',
      expr: 'region:"Europe"'
    })
    expect(rows.map((row) => row.fields.id).sort()).toEqual(['brickmeister', 'steinehaus'])
    expect(rows.every((row) => row.fields.region === 'Europe')).toBe(true)
  })

  it('shows what is stored when no country is named, and asks for nothing', async () => {
    // There is no page stating every seller on BrickLink, so the un-narrowed
    // table is the countries someone has already asked about — not two hundred
    // requests fired off because a table was opened.
    const rows = await rowsOf({
      entity: 'stores'
    })
    expect(rows.length).toBe(3)
  })
})

describe('store inventories', () => {
  const lots = [
    {
      // A number, which is how BrickLink sends `idInv` — the rest of that
      // response quotes its ids and this one does not.
      invId: 552481250 as unknown as string,
      description: 'Red brick, mint',
      price: 'US $1.20',
      sellerCountryCode: 'DE',
      sellerCountryName: 'Germany',
      sellerStoreName: 'Brickmeister',
      strSellerUsername: 'brickmeister',
      condition: 'N',
      quantity: 40,
      sellerFeedbackScore: 900,
      image: 'https://img.example/lot-1.png',
      itemType: 'P',
      itemNumber: '3001',
      colorId: '5'
    },
    {
      invId: 'lot-2',
      description: 'Red brick, played with',
      price: 'US $9.00',
      sellerCountryCode: 'US',
      sellerCountryName: 'United States',
      sellerStoreName: 'Bricks USA',
      strSellerUsername: 'bricksusa',
      condition: 'U',
      quantity: 2,
      sellerFeedbackScore: 40,
      image: 'https://img.example/lot-2.png',
      itemType: 'P',
      itemNumber: '3001',
      colorId: '5'
    },
    {
      invId: 'lot-3',
      description: 'Red brick, bulk',
      price: 'US $10.00',
      sellerCountryCode: 'DE',
      sellerCountryName: 'Germany',
      sellerStoreName: 'Steinehaus',
      strSellerUsername: 'steinehaus',
      condition: 'N',
      quantity: 500,
      sellerFeedbackScore: 120,
      image: 'https://img.example/lot-3.png',
      itemType: 'P',
      itemNumber: '3001',
      colorId: '5'
    }
  ]

  beforeAll(() => {
    // Where the original keeps them, and the only place they are: a price is
    // true while the lot is there and not after, so nothing writes these to
    // IndexedDB.
    useCatalogItemPageStore().inventoriesMap.set('P-3001', lots)
  })

  it('gives the shell a row id it can handle, BrickLink quoting everything but that', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'record:"P-3001"'
    })
    // `idInv` arrives as a number where the rest of the response is strings.
    // The shell trims a row's id, so one left as a number throws inside the
    // render and the table draws nothing at all — no rows and no header —
    // while the count above it goes on reporting them.
    expect(rows.every((row) => typeof row.id === 'string')).toBe(true)
  })

  it('sorts by the number behind the price, not by the string', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      sort: 'priceValue',
      dir: 'asc'
    })
    // As text, `US $10.00` sorts before `US $9.00` — every character matches
    // until the `1`. As money it does not.
    expect(rows.map((row) => row.fields.price)).toEqual([
      'US $1.20',
      'US $9.00',
      'US $10.00'
    ])
  })

  it('carries the item it is a lot of, under the address the other tables use', async () => {
    const rows = await rowsOf({
      entity: 'inventories'
    })
    expect(rows.every((row) => row.fields.record === 'P-3001')).toBe(true)
  })

  it('narrows to a region, which a lot knows only through its country', async () => {
    // As on the stores table: the lot states the seller's country, and the
    // directory is the only thing that says which region that country is in.
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'record:"P-3001" region:"Europe"'
    })
    expect(rows.map((row) => row.id).sort()).toEqual(['552481250', 'lot-3'])
  })

  it('narrows an item\'s lots to one seller, the store being a field beside the item', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'record:"P-3001" store:"steinehaus"'
    })
    // The record is the address — it is what fetched these — and the store
    // narrows what came back. Named the other way round, with no item at all,
    // the store becomes the address instead and a different page answers.
    expect(rows.map((row) => row.fields.id)).toEqual(['lot-3'])
  })
})

/**
 * A seller's own inventory, which is the other page this table is filled from.
 *
 * Addressed by the store and nothing else: `record:"P-3001"` is one request to
 * an item's page, and `store:"steinehaus"` is a walk through the seller's own
 * front, a hundred lots at a time. Stored rows are the answer here, so these
 * assert the read rather than the fetch — which is also how the app avoids
 * scraping a store twice.
 */
describe('a seller\'s own lots', () => {
  beforeAll(async () => {
    const db = await getDbConnection()
    await putAll(db, STORES.STORE_LOTS, [
      {
        id: '901',
        store: 'steinehaus',
        record: 'P-3001',
        itemType: 'P',
        itemNumber: '3001',
        itemName: 'Brick 2 x 4',
        description: 'Heavy playwear.',
        condition: 'U',
        colorId: '5',
        colorName: 'Red',
        quantity: 12,
        price: 0.1,
        displayPrice: 'EUR 0.10',
        nativePrice: 'US $0.12',
        image: 'https://img.example/901.png'
      },
      {
        id: '902',
        store: 'steinehaus',
        record: 'S-10511-1',
        itemType: 'S',
        itemNumber: '10511-1',
        itemName: 'Sky Police Jet Patrol',
        description: '',
        condition: 'N',
        colorId: '0',
        colorName: '',
        quantity: 1,
        price: 24,
        displayPrice: 'EUR 24.00',
        nativePrice: 'EUR 24.00'
      }
    ])
    db.close()
  })

  it('reads the seller through the index rather than filtering every lot', async () => {
    expect((await readStoreLots('steinehaus')).map((lot) => lot.id).sort()).toEqual(['901', '902'])
    expect(await readStoreLots('brickmeister')).toEqual([])
  })

  it('names the item apart from the seller\'s remark on it', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'store:"steinehaus"'
    })
    const byId = new Map(rows.map((row) => [row.fields.id, row]))
    // Two columns and two questions: what is for sale, and what this seller
    // says about their copy of it. Most lots answer only the first.
    expect(byId.get('901')!.fields.itemName).toBe('Brick 2 x 4')
    expect(byId.get('901')!.fields.description).toBe('Heavy playwear.')
    expect(byId.get('902')!.fields.itemName).toBe('Sky Police Jet Patrol')
    expect(byId.get('902')!.fields.description).toBe('')
  })

  it('shows the converted price and keeps the seller\'s own for the hover', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'store:"steinehaus"'
    })
    const lot = rows.find((row) => row.fields.id === '901')!
    // The column draws and sorts by the converted number; the two strings are
    // what the cell says on hover, and neither belongs in a column read down.
    expect(lot.fields.priceValue).toBe(0.1)
    expect(lot.fields.price).toBe('EUR 0.10')
    expect(lot.fields.nativePrice).toBe('US $0.12')
  })

  it('carries the colour name, which the lot states and the item never did', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'store:"steinehaus"'
    })
    expect(rows.find((row) => row.fields.id === '901')!.fields.colorName).toBe('Red')
  })

  it('takes the seller and the country off the directory, the front page having neither', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'store:"steinehaus"'
    })
    const lot = rows.find((row) => row.fields.id === '901')!
    expect(lot.fields.storeName).toBe('Steinehaus')
    expect(lot.fields.country).toBe('DE')
    expect(lot.fields.countryName).toBe('Germany')
    // Neither page states it, and a guess would be worse than a blank.
    expect(lot.fields.feedback).toBeUndefined()
  })

  it('carries the address every other table uses for an item', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'store:"steinehaus"'
    })
    expect(rows.map((row) => row.fields.record).sort()).toEqual(['P-3001', 'S-10511-1'])
  })

  it('still narrows on everything the query names besides the seller', async () => {
    const rows = await rowsOf({
      entity: 'inventories',
      expr: 'store:"steinehaus" condition:"N"'
    })
    expect(rows.map((row) => row.fields.id)).toEqual(['902'])
  })

  it('is in the table when nothing narrows it, which is what the card counts', async () => {
    // An item's lots are held for the session and a seller's are kept, and the
    // card counts the two together — so a table reading only the first said
    // `3,002` over a screen that was empty after a reload, and a query over it
    // narrowed a set that was not there.
    const rows = await rowsOf({
      entity: 'inventories'
    })
    expect(rows.map((row) => row.id).sort()).toEqual([
      '552481250',
      '901',
      '902',
      'lot-2',
      'lot-3'
    ])
  })
})

describe('conditions', () => {
  it('names both, and counts the lots of each', async () => {
    const rows = await rowsOf({
      entity: 'conditions'
    })
    expect(rows.map((row) => row.fields.name).sort()).toEqual(['New', 'Used'])
    const asNew = rows.find((row) => row.fields.condition === 'N')!
    // Over every lot the table itself shows, which is both pages: the two New
    // ones read off an item's page this session, and the one stored off a
    // seller's own front. Counting only the first was how this table came to
    // disagree with the one it is a cross-section of.
    expect(asNew.fields.lots).toBe(3)
    // The quantities behind those lots, which is a different question from how
    // many lots there are: 40, 500 and 1.
    expect(asNew.fields.quantity).toBe(541)
  })

  it('counts the lots the query matches, not every lot loaded', async () => {
    // A cross-section over the lots has to narrow with them. Without this the
    // card read `New 3.0k` beside a lots table showing none, the region having
    // narrowed the lots and left the summary of them standing.
    const rows = await rowsOf({
      entity: 'conditions',
      expr: 'region:"North America"'
    })
    const asNew = rows.find((row) => row.fields.condition === 'N')!
    expect(asNew.fields.lots).toBe(0)
    expect(rows.find((row) => row.fields.condition === 'U')!.fields.lots).toBe(1)
  })

  it('keeps its own count whole when the query names the condition itself', async () => {
    // `condition:` picks which of the two rows is listed. It is not a second
    // filter over the lots underneath — each row already counts its own code,
    // so a New row under `condition:"N"` still states every New lot there is.
    const rows = await rowsOf({
      entity: 'conditions',
      expr: 'condition:"N"'
    })
    expect(rows.map((row) => row.fields.name)).toEqual(['New'])
    expect(rows[0].fields.lots).toBe(3)
  })
})

/**
 * Putting a name to an id, which is what the shell does with the terms these
 * presses write: `country:"DE"` shows as `country:Germany (DE)`.
 *
 * It works by running the term back against the type whose `scope` names the
 * field, so the name a type declares and the name its rows carry have to be
 * the same one — and nothing complains when they are not. An unresolvable
 * field is not a constraint in this language, so a scope naming a field the
 * rows do not have matches every row, and the header states the first of them
 * as confidently as it would the right one. Hence a case per type.
 */
describe.each([
  ['countries', 'country', 'DE', 'Germany'],
  ['regions', 'region', 'Europe', 'Europe'],
  ['stores', 'store', 'brickmeister', 'Brickmeister'],
  ['conditions', 'condition', 'N', 'New']
])('a %s term', (key, field, id, name) => {
  it('names the one record it points at', async () => {
    const {
      cellTextOf, matchesExpression, parseExpression, recordTerm, roleColumn, scopedEntity
    } = await import('header-content-layout')
    const type = entity(key)
    // The field the header starts from: it has the term and has to work out
    // which type that is about.
    expect(scopedEntity(catalogSchema.value, field)?.key).toBe(key)

    const rows = await rowsOf({
      entity: key
    })
    const found = rows.filter((row) =>
      matchesExpression(parseExpression(recordTerm(type, id)!), row, type)
    )
    // One, and not the whole table: the count is the half of this that a
    // misspelled scope would quietly fail.
    expect(found.length).toBe(1)
    expect(cellTextOf(roleColumn(type.columns ?? [], 'identity'), found[0]!)).toBe(name)
  })
})

/**
 * A seller too big to arrive in one go, which is most of them.
 *
 * Lots come a hundred to the request, so a table addressed to a seller is
 * drawn from the first page and filled in behind it — see [pageFill]. What
 * that asks of the stream is that it stay open and say the rows again as each
 * page lands: a stream that answered once would leave the first hundred on
 * screen under a count and a pager built for the whole store, and the rest of
 * it would appear only for somebody who thought to navigate away and back.
 *
 * Last in the file because it stores lots of its own, and the tables above
 * count every lot there is.
 */
describe('a seller still being fetched', () => {
  it('says the rows again as each page lands, rather than only at the end', async () => {
    // Four hundred lots with one page of them stored — a store as the fill
    // finds it, and the numbers the caveat under the header is made of.
    const db = await getDbConnection()
    await putAll(db, STORES.STORE_LOTS, [growingLot('801', 'Brick 2 x 4')])
    await put(db, STORES.STORE_LOT_SCOPES, {
      store: 'growing',
      lots: 400,
      fetchedLots: 100
    })
    db.close()
    // The seller's numeric id, which the front page states and nothing here is
    // going to answer for. Known, so the fill asks for a page of lots rather
    // than waiting out the front page it is addressed by.
    storeIds.set('growing', 1_801_484)

    const {
      state, scope
    } = runStream({
      entity: 'inventories',
      expr: 'store:"growing"'
    })
    await settle()
    expect(state.rows.value.map((row) => row.fields.id)).toEqual(['801'])
    // Still open: the seller is not fetched whole, and a closed stream is the
    // shell being told there is no more coming.
    expect(state.pending.value).toBe(true)

    // A page landing, which is rows stored and the version bumped — the two
    // halves of what `handleStoreItemsResponse` and the fill do between them.
    const landed = await getDbConnection()
    await putAll(landed, STORES.STORE_LOTS, [growingLot('802', 'Plate 2 x 4')])
    landed.close()
    storeScopeVersion.value++
    await settle()

    expect(state.rows.value.map((row) => row.fields.id).sort()).toEqual(['801', '802'])
    // The count above the table and the pager beside it are the same read, so
    // a page that reached the rows and not the total would page to nothing.
    expect(state.total.value).toBe(2)
    scope.stop()
  })
})

/** One of that seller's lots, as the store front stores them. */
function growingLot(id: string, itemName: string) {
  return {
    id,
    store: 'growing',
    record: 'P-3001',
    itemType: 'P',
    itemNumber: '3001',
    itemName,
    description: '',
    condition: 'U',
    colorId: '5',
    colorName: 'Red',
    quantity: 1,
    price: 0.1,
    displayPrice: 'EUR 0.10',
    nativePrice: 'EUR 0.10'
  }
}

/** Lets the stream catch up: it reads IndexedDB, so a tick is not enough. */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
