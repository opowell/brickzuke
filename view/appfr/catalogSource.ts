/**
 * The catalogue, as a data source.
 *
 * `stream` is what model.ts's `tableRef.value?.addRow(item, index)` was doing
 * by hand: rows pushed in as the scan finds them, at the position they sort to.
 * The difference is that the sink closes when the query changes, so a slow scan
 * cannot write the query someone just left over the one they are looking at.
 */
import { matchesExpression, parseExpression } from 'header-content-layout'
import type {DataSource,
  QueryRequest,
  QueryResult,
  QuerySink,
  ShellRow} from 'header-content-layout'
import type { IDBPDatabase } from 'idb'
import { getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import { inventoryFields, rowsFor } from './catalogRows'
import type { StoredItemInventory } from '../stores/bricklink/catalog-item-inv-page'
import { inventoryFor, readInventory } from './inventoryFetch'
import { colorItemsFor, readColorItems } from './colorItemsFetch'
import { colorScope } from '../stores/bricklink/catalog-list-color-page'
import type { StoredColorItem } from '../stores/bricklink/catalog-list-color-page'
import type { BrickLinkItem } from '../stores/bricklink/catalog-download-page'
import {countriesFor,
  readCountries,
  readRegions,
  readStores,
  regionsFor,
  storesFor} from './storesFetch'
import type { Country, Region, Store } from '../stores/bricklink/stores-page'
import {imagesFor,
  readImages,
  readStoreInventories,
  storeInventoriesFor} from './itemPageFetch'
import { readStoreLots, storeLotsFor } from './storeLotsFetch'
import type { StoredStoreLot } from '../stores/bricklink/store-front-page'
import type { ItemImage } from './itemPageFetch'
import {useCatalogItemPageStore} from '../stores/bricklink/catalog-item-page'
import type { StoreInventory } from '../stores/bricklink/catalog-item-page'

/**
 * `bzItemId` is the key path of BRICK_LINK_ITEMS_BY_ITEM_ID and is on the
 * stored records, but not yet on the BrickLinkItem interface — the same gap
 * model.ts:232 reads through.
 */
type JoinedItem = BrickLinkItem & { bzItemId: number }

/** The stored weight as a number, or nothing when there is not one. */
function toWeight(value: string | undefined): number | undefined {
  const weight = Number.parseFloat(String(value))
  return Number.isFinite(weight) ? weight : undefined
}

/**
 * One BrickLink item, flattened the way `processItem` flattens it. Every field
 * a column reads goes in `fields` under the name that column names — the shell
 * reads nothing here itself.
 */
function toRow(itemId: number, brickLinkItems: JoinedItem[]): ShellRow {
  const first = brickLinkItems[0]
  // `Year Released` and `Dimensions` are on the stored records but not yet on
  // the BrickLinkItem interface — the same gap model.ts:177 reads through.
  const raw = first as unknown as Record<string, string>
  return {
    id: String(itemId),
    entityKey: 'items',
    entityLabel: 'Items',
    fields: {
      // Also in `fields`, not only on the row: a term resolves against `fields`
      // and nothing else, so narrowing to one item needs the id stated here.
      id: String(itemId),
      name: brickLinkItems.map((bi) => bi.Name + ' (' + bi.id + ')').join(', '),
      // Lowercase, because only an all-lowercase key is addressable from the
      // expression field: the parser lowercases a term's field and looks it up
      // in `fields` verbatim, so `itemType` would never resolve — and an
      // unresolvable field matches every row rather than none.
      type: brickLinkItems.map((bi) => bi.itemType).join(', '),
      typeId: first.itemType,
      // The id takes the plain name, because that is what an expression term
      // addresses: `parseExpression` lowercases a field, so `categoryId` never
      // resolves, and an unresolvable field in this language matches every row.
      category: first['Category ID'],
      categoryName: brickLinkItems.map((bi) => bi['Category Name']).join(', '),
      image: brickLinkItems.find((bi) => bi.image)?.image,
      year: raw['Year Released'],
      // A number, not the stored string: sorting a column of weights
      // lexicographically puts 10g before 9g. Absent rather than NaN when there
      // is no weight, so it sorts as an empty cell instead of a broken compare.
      weight: toWeight(first.weight),
      dimensions: raw.Dimensions
    }
  }
}

/**
 * The query's expression, compiled once per scan.
 *
 * appfr parses and evaluates its own language, so a term resolves against the
 * fields the row actually carries — `category:"5"` against `fields.category` —
 * rather than against a substring check that only ever knew about the name.
 */
function matcherFor(request: QueryRequest): (row: ShellRow) => boolean {
  const expr = request.query.expr.trim()
  if (!expr) {
    return () => true
  }
  const parsed = parseExpression(expr)
  const entity = request.entity ?? request.schema.entities[0]
  return (row) => matchesExpression(parsed, row, entity)
}

function sortValue(row: ShellRow, key: string): string | number {
  const value = row.fields[key]
  return typeof value === 'number' ? value : String(value ?? '').toLowerCase()
}

/**
 * Where the row belongs among the ones already on screen — the binary search
 * `findIndex` does for `addRow`, against whatever the query is sorted by.
 */
function positionFor(rows: readonly ShellRow[], row: ShellRow, sort: string, desc: boolean) {
  const value = sortValue(row, sort)
  let low = 0
  let high = rows.length
  while (low < high) {
    const mid = (low + high) >>> 1
    const other = sortValue(rows[mid], sort)
    const before = desc ? other > value : other < value
    if (before) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * Records pulled per round trip.
 *
 * The join used to be one indexed lookup per item, which is one IndexedDB
 * transaction per row and the reason a 50,000-item catalogue took ~53s to
 * finish. The index is ordered by the join key, so the same rows come back in
 * batches of a thousand — the groups are already adjacent, and a row is one
 * run of equal keys.
 */
const BATCH = 1_000

/** The BrickLink records sharing `bzItemId`, as one run within a batch. */
function groupAt(batch: JoinedItem[], start: number): number {
  const key = batch[start].bzItemId
  let end = start
  while (end < batch.length && batch[end].bzItemId === key) end++
  return end
}

async function scan(
  db: IDBPDatabase,
  request: QueryRequest,
  emit: (row: ShellRow) => boolean
): Promise<void> {
  const index = indices.BRICK_LINK_ITEMS_BY_ITEM_ID
  const matches = matcherFor(request)
  // Records with no `bzItemId` are not in the index at all, which is the same
  // exclusion model.ts makes by hand.
  let range: IDBKeyRange | null = null
  let scanned = 0

  for (;;) {
    const batch = (await getAllFromIndex<JoinedItem>(db, index, range, BATCH)) ?? []
    if (!batch.length) return

    // A short batch is the end of the index, so every group in it is whole.
    const complete = batch.length < BATCH
    const lastKey = batch[batch.length - 1].bzItemId

    let at = 0
    let emitted = 0
    while (at < batch.length) {
      const end = groupAt(batch, at)
      const key = batch[at].bzItemId
      // The final group of a full batch may continue into the next one, so it
      // is left for the next pass to read whole.
      if (!complete && key === lastKey) break
      const row = toRow(key, batch.slice(at, end))
      if (matches(row) && !emit(row)) return
      emitted++
      at = end
      if (++scanned % BATCH === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    }

    if (complete) return

    if (emitted === 0) {
      // One key filled the whole batch. Read that group on its own rather than
      // asking for the same thousand records again forever.
      const whole = (await getAllFromIndex<JoinedItem>(db, index, lastKey)) ?? []
      const row = toRow(lastKey, whole)
      if (matches(row) && !emit(row)) return
      range = IDBKeyRange.lowerBound(lastKey, true)
    } else {
      // Inclusive: the group held back above is re-read whole next time.
      range = IDBKeyRange.lowerBound(lastKey)
    }
  }
}

/**
 * Which type a request is for. The home screen scopes each card's request to
 * its own entity; the result list carries whichever type is selected, and
 * `null` is the mixed set.
 */
/**
 * One BrickLink record, as its own row.
 *
 * `toRow` above collapses every record of an item into one line, which is the
 * items table. This is the other half: opening an item shows what it collapsed,
 * one row per record, under the same field names so the same columns draw it.
 */
function toRecordRow(itemId: number, brickLinkItem: JoinedItem): ShellRow {
  const raw = brickLinkItem as unknown as Record<string, string>
  return {
    id: String(brickLinkItem.id),
    entityKey: 'itemRecords',
    entityLabel: 'Item records',
    fields: {
      // The item these records belong to, which is what the term addresses.
      item: String(itemId),
      id: String(brickLinkItem.id),
      name: brickLinkItem.Name + ' (' + brickLinkItem.id + ')',
      type: brickLinkItem.itemType,
      typeId: brickLinkItem.itemType,
      category: brickLinkItem['Category ID'],
      categoryName: brickLinkItem['Category Name'],
      image: brickLinkItem.image,
      year: raw['Year Released'],
      weight: toWeight(brickLinkItem.weight),
      dimensions: raw.Dimensions
    }
  }
}

/**
 * What a `field:"…"` term names, read straight off the parsed expression.
 *
 * Opening a record is one indexed lookup, not a scan — the index is keyed by
 * exactly this — so these sources read the term as an address rather than
 * filtering the whole catalogue down to it.
 */
function termValue(request: QueryRequest, field: string): string | undefined {
  for (const group of parseExpression(request.query.expr)) {
    for (const term of group) {
      if (term.kind === 'field' && term.field === field && term.comparator === ':') {
        return term.value
      }
    }
  }
  return undefined
}

/**
 * The query, with the term that says which record this table is showing taken
 * out of it.
 *
 * `record:` and `item:` are an address rather than a filter — the rows came
 * back because of them — but everything else in the expression still narrows.
 * Without this a colour press inside an open set would write a term the source
 * then ignored, which is a filter that does nothing.
 *
 * A group left with no terms constrains nothing, so it matches every row, and
 * the whole expression with it.
 */
function matcherBesides(
  request: QueryRequest,
  ...addresses: string[]
): (row: ShellRow) => boolean {
  const groups = parseExpression(request.query.expr).map((group) =>
    group.filter((term) => !(term.kind === 'field' && addresses.includes(term.field)))
  )
  if (!groups.length || groups.some((group) => !group.length)) {
    return () => true
  }
  const entity = request.entity ?? request.schema.entities[0]
  return (row) => matchesExpression(groups, row, entity)
}

function openItemId(request: QueryRequest): number | undefined {
  const value = termValue(request, 'item')
  const id = Number(value)
  return value !== undefined && Number.isFinite(id) ? id : undefined
}

/**
 * One part of a set, as a row.
 *
 * The fields are `inventoryFields`, shared with the `itemInventories` table:
 * the same stored records answer both, one set at a time here and all of them
 * at once there, so the same columns have to find the same names.
 */
function toInventoryRow(stored: StoredItemInventory): ShellRow {
  return {
    id: stored.id,
    entityKey: 'inventory',
    entityLabel: 'Inventory',
    fields: inventoryFields(stored)
  }
}

/** One item of one colour, as a row. */
function toColorItemRow(stored: StoredColorItem): ShellRow {
  return {
    id: stored.id,
    entityKey: 'colorItems',
    entityLabel: 'Color items',
    fields: {
      id: stored.id,
      scope: stored.scope,
      // The two terms that address this table, under the names a term can be
      // written against: lowercase, and the colour a number so `:` compares it
      // exactly rather than finding 2 inside 12.
      colorid: Number(stored.colorId),
      type: stored.catType,
      // `itemId` and `type` together are what narrows back into the items
      // table, which is the same pair an inventory row carries.
      itemId: stored.itemNumber,
      number: stored.itemNumber,
      name: stored.itemName,
      image: stored.image
    }
  }
}

/**
 * The items of one colour.
 *
 * Addressed by two terms rather than one, because "colour 2" is not a question
 * on its own — the colour guide counts the parts made in a colour separately
 * from the sets containing it, and they are two different pages.
 */
async function colorItemRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const colorId = termValue(request, 'colorid')
  const catType = termValue(request, 'type') ?? 'P'
  if (!colorId) {
    return []
  }
  const stored = fetching
    ? await colorItemsFor(catType, colorId)
    : await readColorItems(colorScope(catType, colorId))
  return stored.map(toColorItemRow)
}

/**
 * The name of an open item, for the lots listed under it.
 *
 * A lot off an item's page states everything about the offer and nothing about
 * the item — the page it came from is the item, so BrickLink has no reason to
 * repeat it. The name is on that same page's own record, which is where the
 * Item column gets what it links to.
 */
function itemNameFor(record: string): string | undefined {
  return useCatalogItemPageStore().itemsMap.get(record)?.itemName
}

/** One lot a seller has on offer, as a row. */
function toStoreInventoryRow(lot: StoreInventory): ShellRow {
  return {
    // Stringified here as well as at the parse. The shell trims a row's id, so
    // a number reaches it as a render-time TypeError that empties the table
    // without emptying the count — too quiet a failure to leave to one caller
    // remembering.
    id: String(lot.invId),
    entityKey: 'inventories',
    entityLabel: 'Store inventories',
    fields: {
      id: lot.invId,
      // The item this lot is for, under the same name the inventory and the
      // pictures use — one address for the three tables an open item has.
      record: `${lot.itemType}-${lot.itemNumber}`,
      image: lot.image,
      price: lot.price,
      // The price as a number, because that is the one question a column of
      // prices is asked and sorting it as text answers a different one:
      // `US $10.00` sorts before `US $9.00` on every character that matters.
      priceValue: toPrice(lot.price),
      // What the seller charges, in their own currency. `price` above is that
      // converted for the viewer, which is the figure worth comparing across
      // sellers and the one the column shows.
      nativePrice: lot.nativePrice,
      // The item's page knows its own name; the lots on it do not repeat it.
      itemName: itemNameFor(`${lot.itemType}-${lot.itemNumber}`),
      colorName: lot.colorName,
      description: lot.description,
      country: lot.sellerCountryCode,
      countryName: lot.sellerCountryName,
      store: lot.strSellerUsername,
      storeName: lot.sellerStoreName,
      // BrickLink's own code, `N` or `U`, which is what the conditions table
      // is keyed by and so what a `condition:` term compares against.
      condition: lot.condition,
      conditionName: conditionName(lot.condition),
      quantity: lot.quantity,
      feedback: lot.sellerFeedbackScore,
      type: lot.itemType,
      itemId: lot.itemNumber,
      colorid: lot.colorId === undefined ? undefined : Number(lot.colorId)
    }
  }
}

/**
 * A displayed price as a number.
 *
 * These arrive formatted for a currency BrickLink chose — `US $1.23`, `EUR
 * 1,23` — so this takes the digits and nothing else. Two lots priced in
 * different currencies do not compare, which is a caveat of the page rather
 * than of this: BrickLink shows one seller's price beside another's the same
 * way.
 */
function toPrice(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * The lots one seller has, as rows of the same table an item's lots fill.
 *
 * They arrive from a different page and so carry different things. A store's
 * own front never repeats who the seller is — every row on it has the same one
 * — so the country and the store name are taken from the directory record
 * instead, and the feedback score, which appears on neither, is left blank
 * rather than guessed at.
 */
async function asStoreLotRows(lots: StoredStoreLot[], username: string): Promise<ShellRow[]> {
  const seller = (await readStores()).find((store) => store.id === username)
  const country = seller
    ? (await readCountries()).find((one) => one.countryCode === seller.countryID)
    : undefined
  return lots.map((lot) => ({
    id: lot.id,
    entityKey: 'inventories',
    entityLabel: 'Store inventories',
    fields: {
      id: lot.id,
      record: lot.record,
      image: lot.image,
      // The converted figure BrickLink printed, kept for the hover; the number
      // beside it is what the column draws and sorts by.
      price: lot.displayPrice,
      priceValue: lot.price,
      nativePrice: lot.nativePrice,
      itemName: lot.itemName,
      colorName: lot.colorName,
      // The seller's own note about this lot, and only that. The item it is a
      // lot of has a column of its own.
      description: lot.description,
      country: seller?.countryID,
      countryName: country?.countryName,
      store: lot.store,
      // The trading name where the directory has it, and the username where it
      // does not: a blank cell in the column that says whose lot this is would
      // be the one thing this table cannot leave unanswered.
      storeName: seller?.name ?? lot.store,
      condition: lot.condition,
      conditionName: conditionName(lot.condition),
      quantity: lot.quantity,
      type: lot.itemType,
      itemId: lot.itemNumber,
      colorid: lot.colorId === undefined ? undefined : Number(lot.colorId)
    }
  }))
}

/** The two conditions BrickLink sells in, under the codes a lot carries. */
const CONDITIONS: Record<string, string> = {
  N: 'New',
  U: 'Used'
}

function conditionName(code: string | undefined): string | undefined {
  return code === undefined ? undefined : (CONDITIONS[code] ?? code)
}

/** One picture of an item, as a row. */
function toImageRow(record: string, image: ItemImage): ShellRow {
  return {
    id: image.id,
    entityKey: 'images',
    entityLabel: 'Images',
    fields: {
      id: image.id,
      record,
      image: image.image,
      // The record, split the way every other table addresses an item, so the
      // picture leads back to the catalogue entry it is of.
      type: record.slice(0, record.indexOf('-')),
      itemId: record.slice(record.indexOf('-') + 1),
      name: record
    }
  }
}

/** One region of the world, as a row. */
function toRegionRow(region: Region): ShellRow {
  return {
    id: region.name,
    entityKey: 'regions',
    entityLabel: 'Regions',
    fields: {
      id: region.name,
      // The field a country carries its region in, which is this type's scope.
      region: region.name,
      name: region.name,
      countries: region.countryCount
    }
  }
}

/** One country with sellers in it, as a row. */
function toCountryRow(country: Country): ShellRow {
  return {
    id: country.countryCode,
    entityKey: 'countries',
    entityLabel: 'Countries',
    fields: {
      id: country.countryCode,
      // The code a store and a lot both carry, and this type's scope — so
      // `country:"DE"` reads as Germany wherever it is written.
      country: country.countryCode,
      name: country.countryName,
      image: country.image,
      region: country.regionId,
      stores: country.storeCount
    }
  }
}

/** One seller, as a row. */
function toStoreRow(store: Store): ShellRow {
  return {
    id: store.id,
    entityKey: 'stores',
    entityLabel: 'Stores',
    fields: {
      id: store.id,
      store: store.id,
      name: store.name,
      country: store.countryID,
      province: store.stateName,
      items: store.items,
      // A flag rather than a number, and drawn as the word or nothing: the
      // original prints the raw boolean, which puts `false` in every other row.
      instantCheckout: store.instantCheckout === true ? 'Instant' : ''
    }
  }
}

/**
 * What one set is made of.
 *
 * `fetching` is the difference between this and every other type here: a set
 * nobody has opened before is not in IndexedDB at all, so the rows come over
 * the network the first time. The sink stays open across that, which is what
 * puts the shell in its "Running query…" state rather than showing an empty
 * table that is about to fill.
 */
async function inventoryRows(
  request: QueryRequest,
  fetching = true
): Promise<ShellRow[]> {
  const record = termValue(request, 'record')
  if (!record) {
    return []
  }
  const stored = fetching ? await inventoryFor(record) : await readInventory(record)
  return stored.map(toInventoryRow)
}

/** The records behind one item, ordered the way the query asks. */
async function recordRows(request: QueryRequest): Promise<ShellRow[]> {
  const itemId = openItemId(request)
  // No item named is not an error: it is the address of nothing, and the shell
  // draws an empty table rather than the whole catalogue.
  if (itemId === undefined) {
    return []
  }
  const db = await getDbConnection()
  try {
    const records = (await getAllFromIndex<JoinedItem>(
      db,
      indices.BRICK_LINK_ITEMS_BY_ITEM_ID,
      itemId
    )) ?? []
    return records.map((record) => toRecordRow(itemId, record))
  } finally {
    db.close()
  }
}

/**
 * The lots on offer for the item a query names, or the ones a seller has, or
 * every lot loaded so far.
 *
 * Two pages answer this table, and which one is asked follows from what the
 * query names. A record is an item, and BrickLink states its lots on the
 * item's own page. A store on its own is the seller's front, which is a
 * different fetch and a much longer one — a hundred lots to the request.
 *
 * Named together, the item wins and the store narrows what came back: "who
 * sells this brick, and of those, this seller" is one request where the other
 * way round is sixty.
 *
 * Un-narrowed this fetches nothing and shows what browsing has already
 * gathered — see `storeInventoriesFor` for why there is no "all of them" to
 * ask BrickLink for.
 */
async function storeInventoryRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const record = termValue(request, 'record')
  const store = termValue(request, 'store')
  if (!record && store) {
    const lots = fetching ? await storeLotsFor(store) : await readStoreLots(store)
    return await asStoreLotRows(lots, store)
  }
  const lots = fetching ? await storeInventoriesFor(record) : readStoreInventories(record)
  return lots.map(toStoreInventoryRow)
}

/** The pictures of the item a query names, or every one loaded so far. */
async function imageRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const record = termValue(request, 'record')
  if (record) {
    const images = fetching ? await imagesFor(record) : readImages(record)
    return images.map((image) => toImageRow(record, image))
  }
  const store = useCatalogItemPageStore()
  const rows: ShellRow[] = []
  for (const [key, images] of store.imagesMap) {
    for (const image of images as ItemImage[]) {
      rows.push(toImageRow(key, image))
    }
  }
  return rows
}

/**
 * New and Used, with how much of each is on offer.
 *
 * A fixed pair rather than a scan of anything: BrickLink sells in exactly
 * these two, and a lot states which as a one-letter code. The counts are over
 * whatever lots are loaded, so the table is two named rows before anyone has
 * opened an item and two counted ones after.
 */
async function conditionRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const lots = await storeInventoryRows(request, fetching)
  return Object.entries(CONDITIONS).map(([code, name]) => {
    const mine = lots.filter((lot) => lot.fields.condition === code)
    return {
      id: code,
      entityKey: 'conditions',
      entityLabel: 'Conditions',
      fields: {
        id: code,
        condition: code,
        name,
        // Blank rather than nought where nothing is loaded: no lots read is
        // not the same claim as no lots on offer, which is the distinction
        // `total` in catalogRows exists to keep.
        lots: lots.length ? mine.length : undefined,
        quantity: lots.length
          ? mine.reduce((sum, lot) => sum + Number(lot.fields.quantity ?? 0), 0)
          : undefined
      }
    }
  })
}

/** Every region BrickLink groups its sellers into. */
async function regionRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const regions = fetching ? await regionsFor() : await readRegions()
  return regions.map(toRegionRow)
}

/** Every country BrickLink lists sellers in. */
async function countryRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const countries = fetching ? await countriesFor() : await readCountries()
  return countries.map(toCountryRow)
}

/** The sellers in the country a query names, or every one stored. */
async function storeRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const country = termValue(request, 'country')
  const stores = fetching ? await storesFor(country) : await readStores(country)
  return stores.map(toStoreRow)
}

/**
 * The years the catalogue covers, and how many items came out in each.
 *
 * The only type here derived from the items table rather than read from a
 * store of its own, which makes it the only one that costs a full pass. It is
 * the same pass the items table makes, over the same grouping — a year is the
 * one an item's first record states, which is exactly what the items table
 * shows in that column, so pressing a year lands on the number beside it.
 *
 * Held once. The catalogue changes when an update run rewrites it and not
 * while anyone is looking at it, so this is paid on the first press of Years
 * and never again.
 */
let years: Promise<ShellRow[]> | undefined

function scanYears(): Promise<ShellRow[]> {
  return (async () => {
    const db = await getDbConnection()
    const counts = new Map<string, number>()
    try {
      // Every item, whatever the query says: the query narrows the years, not
      // the catalogue they are counted from — a year stating how many items it
      // holds must not restate the filter that is already on screen.
      await scan(db, everything, (row) => {
        const year = String(row.fields.year ?? '').trim()
        if (year) {
          counts.set(year, (counts.get(year) ?? 0) + 1)
        }
        return true
      })
    } finally {
      db.close()
    }
    return Array.from(counts.entries()).map(([year, items]) => ({
      id: year,
      entityKey: 'years',
      entityLabel: 'Years',
      fields: {
        id: year,
        // A number, so the column sorts as years rather than as text and so a
        // `year:` term compares exactly — the same two reasons every other
        // addressable field here is one.
        year: Number(year),
        name: year,
        items
      }
    }))
  })().catch((thrown) => {
    // A failed pass must not be the answer forever.
    years = undefined
    throw thrown
  })
}

/**
 * A request that narrows nothing, for a pass that has to see the whole
 * catalogue regardless of what is on screen.
 */
const everything = {
  query: {
    expr: ''
  }
} as unknown as QueryRequest

function yearRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  // The home screen runs one query per type every time it is drawn, and a
  // summary card is no reason to walk two hundred thousand items. Once the
  // table itself has been opened the answer is held, and the card is free.
  if (!fetching && !years) {
    return Promise.resolve([])
  }
  years ??= scanYears()
  return years
}

/**
 * How many years the catalogue covers, for the home screen card.
 *
 * This does ask for the pass, unlike the un-narrowed query above — a card with
 * no number on it is the thing being fixed. It is the same held promise, so the
 * pass happens once a session whether it was the card or the table that asked.
 */
export async function yearCount(): Promise<number> {
  return (await yearRows(everything, true)).length
}

/** Drops the held years, for when an update run has rewritten the catalogue. */
export function forgetScannedRows() {
  years = undefined
}

/**
 * A type whose rows are fetched or derived rather than read from a store of
 * its own, and the terms that address it.
 *
 * An address is the reason the rows came back rather than a filter over them —
 * `record:"S-10511-1"` says which set, and re-testing every row against it
 * would be asking a question the answer already assumes. Everything else in
 * the expression still narrows.
 */
interface Fetched {
  /**
   * A function where what addresses a type depends on what the query names —
   * see `inventories`, which is fetched two different ways.
   */
  addresses: string[] | ((request: QueryRequest) => string[])
  rows: (request: QueryRequest, fetching: boolean) => Promise<ShellRow[]>
}

function addressesOf(source: Fetched, request: QueryRequest): string[] {
  return typeof source.addresses === 'function' ? source.addresses(request) : source.addresses
}

const fetched: Record<string, Fetched> = {
  inventory: {
    addresses: ['record'],
    rows: inventoryRows
  },
  itemRecords: {
    addresses: ['item'],
    rows: recordRows
  },
  colorItems: {
    addresses: ['colorid', 'type'],
    rows: colorItemRows
  },
  inventories: {
    // A record is what fetched the rows, so it does not filter them again — and
    // a `store:` term written beside one still does, being an ordinary
    // narrowing of an item's sellers. A store on its own is what fetched them
    // instead, and then it is the address.
    addresses: (request) => (termValue(request, 'record') ? ['record'] : ['record', 'store']),
    rows: storeInventoryRows
  },
  images: {
    addresses: ['record'],
    rows: imageRows
  },
  conditions: {
    addresses: ['record'],
    rows: conditionRows
  },
  regions: {
    addresses: [],
    rows: regionRows
  },
  countries: {
    addresses: [],
    rows: countryRows
  },
  stores: {
    addresses: ['country'],
    rows: storeRows
  },
  years: {
    addresses: [],
    rows: yearRows
  }
}

function entityKey(request: QueryRequest): string | null {
  return request.entity?.key ?? null
}

/** The small types, filtered and ordered the way the shell asked for them. */
function present(
  rows: readonly ShellRow[],
  request: QueryRequest,
  matches: (row: ShellRow) => boolean = matcherFor(request)
): ShellRow[] {
  const desc = request.query.dir === 'desc'
  const sort = request.query.sort
  return rows
    .filter(matches)
    .slice()
    .sort((a, b) => {
      const left = sortValue(a, sort)
      const right = sortValue(b, sort)
      if (left === right) return 0
      const before = left < right ? -1 : 1
      return desc ? -before : before
    })
}

export const catalogSource: DataSource = {
  /**
   * The home screen's summary, and its only caller: it runs one of these per
   * type to head each card.
   *
   * An un-narrowed count is one `EntitySchema.count` already carries —
   * brickzuke counts the catalogue in `setCounts`, so reading the whole of it
   * to restate a number already on screen buys nothing. A narrowed query is
   * the case the schema cannot answer, and the only one that reads anything.
   */
  async query(request: QueryRequest): Promise<QueryResult> {
    const key = entityKey(request)
    const unfiltered = !request.query.expr.trim()
    if (unfiltered) {
      return {
        rows: [],
        total: 0,
        unfiltered
      }
    }

    const source = key ? fetched[key] : undefined
    if (source) {
      // Reads only: the home screen runs one of these per type every time it
      // is drawn, and a summary card is no reason to scrape twenty pages of
      // BrickLink or to walk the whole catalogue.
      const rows = present(
        await source.rows(request, false),
        request,
        matcherBesides(request, ...addressesOf(source, request))
      )
      return {
        rows: rows.slice(request.offset, request.offset + request.limit),
        total: rows.length,
        unfiltered
      }
    }

    const held = key ? rowsFor(key, getDbConnection) : undefined
    if (held) {
      const rows = present(await held, request)
      return {
        rows: rows.slice(request.offset, request.offset + request.limit),
        total: rows.length,
        unfiltered
      }
    }

    if (key !== 'items') {
      return {
        rows: [],
        total: 0,
        unfiltered
      }
    }

    const db = await getDbConnection()
    const rows: ShellRow[] = []
    let total = 0
    try {
      await scan(db, request, (row) => {
        total++
        if (total > request.offset && rows.length < request.limit) rows.push(row)
        return true
      })
    } finally {
      // An open connection blocks the next version change, and IndexedDB does
      // not time out waiting for one — a leak here is an upgrade that never
      // runs and an app that shows nothing.
      db.close()
    }
    return {
      rows,
      total,
      unfiltered
    }
  },

  /**
   * The result list, for every type.
   *
   * Declaring this is what makes the shell read its rows from here rather than
   * from `query`, so it has to answer for the small types too — they simply
   * have every row at once and close, where `items` pushes rows in as the scan
   * finds them.
   */
  stream(request: QueryRequest, sink: QuerySink) {
    const key = entityKey(request)
    let cancelled = false

    const source = key ? fetched[key] : undefined
    if (source) {
      void source
        .rows(request, true)
        .then((all) => {
          if (cancelled || !sink.open) return
          // The address terms are this table's address rather than a filter
          // over it, so the rows they fetched are not filtered by them again —
          // but whatever else the query carries does narrow them.
          const rows = present(
            all,
            request,
            matcherBesides(request, ...addressesOf(source, request))
          )
          sink.set({
            rows: rows.slice(request.offset, request.offset + request.limit),
            total: rows.length
          })
          sink.close()
        })
        .catch((thrown) => sink.fail(thrown))
      return () => {
        cancelled = true
      }
    }

    const held = key ? rowsFor(key, getDbConnection) : undefined
    if (held) {
      void held
        .then((all) => {
          if (cancelled || !sink.open) return
          const rows = present(all, request)
          sink.set({
            rows: rows.slice(request.offset, request.offset + request.limit),
            total: rows.length
          })
          sink.close()
        })
        .catch((thrown) => sink.fail(thrown))
      return () => {
        cancelled = true
      }
    }

    // Nothing scans for a type with no rows behind it — part and colour codes
    // are a count on the home screen and no more.
    if (key !== null && key !== 'items') {
      sink.set({
        rows: [],
        total: 0
      })
      sink.close()
      return
    }

    const rows: ShellRow[] = []
    const desc = request.query.dir === 'desc'

    void (async () => {
      const db = await getDbConnection()
      try {
        await scan(db, request, (row) => {
          if (cancelled || !sink.open) return false
          const at = positionFor(rows, row, request.query.sort, desc)
          rows.splice(at, 0, row)
          // The shell drops what this pushes past the page end — that row is
          // page two's — while the total goes on counting.
          sink.insert(row, at)
          return true
        })
        sink.close()
      } catch (thrown) {
        sink.fail(thrown)
      } finally {
        // Held open for the whole scan, and every scan must give it back: a
        // live connection blocks the next version change for ever.
        db.close()
      }
    })()

    // Called when the query changes or the shell unmounts.
    return () => {
      cancelled = true
    }
  }
}
