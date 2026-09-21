/**
 * The catalogue, as a data source.
 *
 * `stream` is what model.ts's `tableRef.value?.addRow(item, index)` was doing
 * by hand: rows pushed in as the scan finds them, at the position they sort to.
 * The difference is that the sink closes when the query changes, so a slow scan
 * cannot write the query someone just left over the one they are looking at.
 */
import { ref, watch } from 'vue'
import { matchesExpression, parseExpression } from 'header-content-layout'
import type {DataSource,
  EntitySchema,
  FacetValue,
  FieldTerm,
  QueryRequest,
  QueryResult,
  QuerySink,
  ShellRow,
  Term} from 'header-content-layout'
import type { IDBPDatabase } from 'idb'
import { fillPages } from './pageFill'
import type { Fill } from './pageFill'
import { count, get, getAll, getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
// `dbStores` rather than `stores`, that name being taken here by a seller.
import dbStores from '../../idb/stores'
import { inventoryFields, rowsFor } from './catalogRows'
import type { StoredItemInventory } from '../stores/bricklink/catalog-item-inv-page'
import { hasInventory, inventoryFor, readInventory } from './inventoryFetch'
import { ensurePartCounts, partsOf } from './partCounts'
import { ensureStoreInventories, storeInventoryOf } from './storeInventoryCounts'
import { conditionCounts, conditionCountsVersion, ensureConditionCounts } from './conditionCounts'
import { colorItemsFill, colorItemsFor, readColorItems } from './colorItemsFetch'
import { notePriceCurrency, priceSign } from './priceCurrency'
import { colorScope } from '../stores/bricklink/catalog-list-color-page'
import type { StoredColorItem } from '../stores/bricklink/catalog-list-color-page'
import type { BrickLinkItem } from '../stores/bricklink/catalog-download-page'
import {countriesFor,
  readCountries,
  readRegions,
  readStores,
  regionsFor,
  provinceId,
  storesFor} from './storesFetch'
import type { Country, Region, Store } from '../stores/bricklink/stores-page'
import {hasPage,
  imagedRecords,
  imagesFor,
  readAllImages,
  readImages,
  narrowedLotsFill,
  narrowedLotsVersion,
  narrowedStoreInventoriesFor,
  readStoreInventories,
  storeInventoriesFor} from './itemPageFetch'
import {readAllStoreLots,
  readStoreLots,
  readStoreLotsOf,
  storeLotsFill,
  storeLotsFor} from './storeLotsFetch'
import type { StoredStoreLot } from '../stores/bricklink/store-front-page'
import { readStorePolicies, storePoliciesFor, storePolicyFor } from './storePolicyFetch'
import type { StoredShippingMethod, StoredStorePolicy } from '../stores/bricklink/store-policy-page'
import { ratesApplying, termsOf, withPostage } from './shopPostage'
import type { ItemImage, LotNarrowing } from './itemPageFetch'
import {cartLineRows,
  shopListItemRows,
  shopPlanRows,
  shopStoreRows,
  userInventoryLineRows,
  userItemRows} from './userRows'
import { cartQuantityOf } from './activeCart'
import { provideLots, reachFor, reaches, type Tally } from './reach'
import { modifiedPrice, priceModifierOf } from './priceModifiers'
import { userItemIdOf } from '../../idb/userItem'
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
function toRow(itemId: number, brickLinkItems: JoinedItem[], expr: string): ShellRow {
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
      // A number, not the string BrickLink's own field holds it as — `:`
      // compares a number exactly and only substring-matches a string, so
      // `category:5` against a string id also answered for 15, 51 and 205.
      category: Number(first['Category ID']),
      categoryName: brickLinkItems.map((bi) => bi['Category Name']).join(', '),
      image: brickLinkItems.find((bi) => bi.image)?.image,
      // The BrickLink id an inventory is keyed by — `S-10511-1`. An item is
      // one line over however many records, and the first is the one the
      // other single-record fields above already read, so it is the one a
      // Parts cell counts and opens.
      record: first.id,
      // And every one of them, for a table read off the items the query
      // matches — the pictures, which are of a record and not of an item.
      records: brickLinkItems.map((bi) => bi.id),
      // The count for that record as the scan found it, which is what sorting
      // by Parts compares. The cell reads the live map instead, so a set
      // opened after the scan shows its number without another scan — see
      // [partCounts].
      parts: partsOf(first.id)?.parts,
      // As with `parts`: what the fold knew when the scan ran, which is what
      // sorting by this column compares. The cell reads the live fold
      // instead, so a seller fetched after the scan shows its number without
      // another scan — see [storeInventoryCounts].
      storeInventory: storeInventoryOf(first.id, expr),
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
  return matcherBesides(request, ...itemAddress(request))
}

/**
 * The term that names an item, on every table where it is an address and not
 * a filter — which is every table but the items table's own.
 *
 * `id:` is the items table's scope: what a press on an item writes, and what
 * the header reads back as `item: Plate 6 x 6` whichever table is in force.
 * Every other row has an `id` of its own, and none of them is the item's —
 * so matched as a filter the term failed on all of them, and the picker read
 * `Categories · 0` and `Conditions · 0` beside a query naming one category
 * and one condition. The lots read it as what to fetch (see [namesItem]);
 * everything else reads it as nothing to narrow by, and the rest of the
 * expression still does.
 *
 * A `type:` beside the `id:` is part of the address: it says which of the
 * item's records is meant — see [itemRecords] — and the join reads the type
 * off those. Left in as a filter it was put to rows that carry a type of
 * their own: a line of the set `type:S id:979` names is a part, so
 * `type:S` matched no line of it. On its own `type:` stays a filter.
 */
function itemAddress(request: QueryRequest): string[] {
  if (entityKey(request) === 'items' || entityKey(request) === null) {
    return []
  }
  return termValue(request, 'id') === undefined ? ['id'] : ['id', 'type']
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
 * One page of a scan, in the query's order.
 *
 * A scan reads the index by item id, so rows arrive in no order the query
 * asked for: the row that sorts first may be the last one found, and the page
 * is not known until the whole catalogue has been looked at. What is *not*
 * needed is the whole catalogue kept — only the rows that could still make the
 * page, which is `offset + limit` of them. Anything sorting past that end is
 * counted and dropped, so a scan of 199,000 items holds fifty.
 *
 * Both halves of the source build one of these, which is the point of it.
 * `query` and `stream` answer the same request and have to answer it the same
 * way: they used to disagree twice over — `query` paged the scan order rather
 * than the sorted order, and `stream` did not page at all — and a page's
 * contents should not depend on which method the shell happened to call.
 */
interface Page {
  /** Takes one matching row. True when the page itself changed. */
  take(row: ShellRow): boolean
  /** The page as it now stands, at most `limit` long. */
  rows(): ShellRow[]
  /** How many rows have matched, whether or not they made the page. */
  total(): number
}

function pageOf(request: QueryRequest): Page {
  const sort = request.query.sort
  const desc = request.query.dir === 'desc'
  const from = request.offset
  const keep = request.offset + request.limit
  const held: ShellRow[] = []
  let total = 0
  return {
    take(row) {
      total++
      const at = positionFor(held, row, sort, desc)
      // Past the end of what the page could hold: it counts, and nothing else.
      if (at >= keep) {
        return false
      }
      held.splice(at, 0, row)
      if (held.length > keep) {
        held.pop()
      }
      // A row landing before the page moves the window along by one, so this
      // is a change to what is shown even when the row itself is not shown.
      return true
    },
    rows: () => held.slice(from),
    total: () => total
  }
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

/** Whether a parsed expression names `field` at all, however it compares. */
function references(expr: string, field: string): boolean {
  return parseExpression(expr).some((group) =>
    group.some((term) => term.kind === 'field' && term.field === field)
  )
}

async function scan(
  db: IDBPDatabase,
  request: QueryRequest,
  emit: (row: ShellRow) => boolean
): Promise<void> {
  const index = indices.BRICK_LINK_ITEMS_BY_ITEM_ID
  const expr = request.query.expr
  // The items the rest of the query reaches through the lots — the ones
  // with a New lot in Europe, say — which a scan cannot read off any row:
  // see [joined]. Nothing is walked for a query the items answer alone.
  // `everything` names no entity and no schema: it is the un-narrowed pass,
  // which the join has nothing to say to.
  const reach = await reachFor('items', expr, [], request.entity ?? request.schema?.entities[0])
  const own = matcherFor(request)
  const matches = (row: ShellRow) => own(row) && reaches(reach, row)
  /*
   * Both folds are one pass over a table that only grows — the sets already
   * opened, and every lot any seller's front has given up — so kicking them
   * off is cheap, but every row on screen already reads them live rather than
   * off what a row was baked with (see [CellParts], [CellStoreInventory]).
   * Waiting for either here buys nothing for the common query, which sorts
   * and filters by neither, and it is the wait that used to sit in front of
   * the very first row a scan found. What still needs it: sorting by the
   * column the fold fills, or a term that reads it directly — either puts a
   * row exactly where the fold says to, which a row inserted ahead of it
   * cannot be moved to afterwards.
   */
  const partsFold = ensurePartCounts()
  const storesFold = ensureStoreInventories()
  if (request.query.sort === 'parts' || references(expr, 'parts')) {
    await partsFold
  }
  if (request.query.sort === 'storeInventory' || references(expr, 'storeInventory')) {
    await storesFold
  }
  /*
   * Somebody's own items first, then the catalogue's. They are rows of this
   * one table — an item of theirs is an item — and the page places each row
   * where it sorts, so first is only the order they are read in and not where
   * they land. First because they are tens of records against two hundred
   * thousand: a set of theirs on page one should not wait behind a scan of
   * everything to be found.
   */
  for (const row of await userItemRows(db)) {
    if (matches(row) && !emit(row)) return
  }
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
      const row = toRow(key, batch.slice(at, end), expr)
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
      const row = toRow(lastKey, whole, expr)
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
      // The same id again, under the name the Parts column reads it by on
      // both tables: a record *is* what an inventory is keyed by. It is also
      // what the Record column states, this table having one where the items
      // table has a Type — see [catalogSchema].
      record: String(brickLinkItem.id),
      parts: partsOf(String(brickLinkItem.id))?.parts,
      // The name and nothing else, where the items table writes the id after
      // it. That table collapses every record of an item into one line and the
      // id is what tells them apart in it; here each record has a line and a
      // column of its own. It is also the name the header puts to
      // `record:"S-75884-1"`, and the header states the id itself — see the
      // `scope` on `itemRecords`.
      name: brickLinkItem.Name,
      type: brickLinkItem.itemType,
      typeId: brickLinkItem.itemType,
      // A number, not the string BrickLink's own field holds it as — see the
      // same fix on `toRow` above.
      category: Number(brickLinkItem['Category ID']),
      categoryName: brickLinkItem['Category Name'],
      image: brickLinkItem.image,
      year: raw['Year Released'],
      weight: toWeight(brickLinkItem.weight),
      dimensions: raw.Dimensions
    }
  }
}

/**
 * Whether a term is an address: a plain `field:"…"`, naming one record.
 *
 * The same term with a `-` in front of it is the opposite of an address — it
 * says which record the rows are *not* — so it is left to the matcher with
 * every other filter, and a source that reads `record:` as where to look reads
 * `-record:` as nowhere in particular.
 */
function addresses(term: Term, field: string): term is FieldTerm {
  return term.kind === 'field' && term.field === field && term.comparator === ':' && !term.negated
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
      if (addresses(term, field)) {
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
  ...addressed: string[]
): (row: ShellRow) => boolean {
  return matcherWithout(request, (term) => addressed.some((field) => addresses(term, field)))
}

/**
 * The same, on a type read through the lots, with the terms the lots have
 * already answered taken out as well.
 *
 * `answered` are the figures the join writes beside a row that a lot also
 * carries of its own — `quantity`, on a colour or a condition. A term on one
 * of those, `quantity>10`, was put to the lots (see [foreignTerms] in reach,
 * and [lotTerms]), and the number then summed beside a colour is the pieces
 * in the lots that passed. Compared against the same term a second time, the
 * sum would drop a colour whose small lots add up past a `quantity<5`, and
 * take a condition no lot is in off the table under any bound at all — the
 * nought [joined] is at pains to keep. `lots` is the join's alone, no lot
 * carrying one, so `lots>3` stays a question about the row.
 */
function matcherOverLots(
  request: QueryRequest,
  addressed: readonly string[],
  answered: readonly string[]
): (row: ShellRow) => boolean {
  return matcherWithout(
    request,
    (term) =>
      addressed.some((field) => addresses(term, field)) ||
      (term.kind === 'field' && answered.includes(term.field))
  )
}

/** The query's expression, with the terms `dropped` picks out left to whoever answers them. */
function matcherWithout(
  request: QueryRequest,
  dropped: (term: Term) => boolean
): (row: ShellRow) => boolean {
  const groups = parseExpression(request.query.expr).map((group) =>
    group.filter((term) => !dropped(term))
  )
  if (!groups.length || groups.some((group) => !group.length)) {
    return () => true
  }
  const entity = request.entity ?? request.schema.entities[0]
  return (row) => matchesExpression(groups, row, entity)
}

function openItemId(request: QueryRequest): number | undefined {
  return openItemIdOf(termValue(request, 'item'))
}

/** An item's id as the index holds it, or nothing where the term is not one. */
function openItemIdOf(value: string | undefined): number | undefined {
  const id = Number(value)
  return value !== undefined && Number.isFinite(id) ? id : undefined
}

/**
 * Whether an inventories query names an item to fetch the lots of — as a
 * `record:` spelling the BrickLink record, or as the `id:` every other table
 * calls an item by.
 *
 * `id`, on every other table, is the row's own identity, but on inventories
 * that is `invId` — BrickLink's internal lot id, not a thing anyone typing a
 * query would know, and not what a press on the items table writes. The
 * items table's `id:"21051"` is brickzuke's own item id, the one its records
 * hang off — see [itemRecords] for the records it stands for.
 */
function namesItem(request: QueryRequest): boolean {
  return termValue(request, 'record') !== undefined || termValue(request, 'id') !== undefined
}

/**
 * The BrickLink records an inventories query means to fetch: the `record:`
 * itself where the query spells one, or the records behind the item `id:`
 * names — narrowed to the `type:` beside it, where there is one.
 *
 * The item's id is not its BrickLink number: item 21051 is `Brick 1 x 16`,
 * whose page is `P=2465`. Composing `P-21051` out of the two terms asked
 * BrickLink for a part it has no page for, and the lots never landed. The
 * index by item id is the same one lookup opening the item's records is.
 */
async function itemRecords(request: QueryRequest): Promise<string[]> {
  const record = termValue(request, 'record')
  if (record) {
    return [record]
  }
  const itemId = openItemIdOf(termValue(request, 'id'))
  if (itemId === undefined) {
    return []
  }
  const type = termValue(request, 'type')
  const db = await getDbConnection()
  try {
    const records =
      (await getAllFromIndex<JoinedItem>(db, indices.BRICK_LINK_ITEMS_BY_ITEM_ID, itemId)) ?? []
    return records
      .filter((one) => !type || one.itemType === type)
      .map((one) => String(one.id))
  } finally {
    db.close()
  }
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
function toStoreInventoryRow(lot: StoreInventory, directory: LotDirectory): ShellRow {
  const seller = directory.sellers.get(lot.strSellerUsername)
  // The one place the viewer's currency is written down — see [priceCurrency].
  notePriceCurrency(lot.price)
  const row: ShellRow = {
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
      priceValue: lotPrice(lot.price, lot.nativePrice),
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
      // The part of the world that country is in, which a lot never states
      // and the directory does — see [lotDirectory].
      region: directory.countries.get(lot.sellerCountryCode ?? '')?.regionId,
      // Nor the province, which is on the seller's directory record where
      // that seller has been fetched, and nowhere at all where they have not.
      province: seller ? provinceId(seller) : undefined,
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
      colorid: lot.colorId === undefined ? undefined : Number(lot.colorId),
      // How many of this lot are in the active cart — the one field on a lot
      // that is somebody's own, read off the held lines: see [activeCart].
      cartQuantity: cartQuantityOf(lot.invId)
    }
  }
  return priced(row, directory)
}

/**
 * A lot's row with the fields the directory looked up rather than the lot
 * stating itself — the item's category, both for `category:` and the
 * Category column, and what the price comes to with every factor applied.
 * See [modifiedPrice] for the figure.
 */
function priced(row: ShellRow, directory: LotDirectory): ShellRow {
  const category = directory.categories.get(String(row.fields.record ?? ''))
  if (category !== undefined) {
    row.fields.category = category.id
    row.fields.categoryName = category.name
  }
  row.fields.modPrice = modifiedPrice(row.fields)
  return row
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
 * The number a lot is drawn and sorted by.
 *
 * BrickLink prints the converted price to two places, so a seller in the
 * viewer's own currency asking `EUR 0.002` is printed as `EUR 0.00` — a
 * rounding rather than a price, and a lot at a fifth of a cent drawn and
 * sorted as though it were free. Where the seller's own figure is in the same
 * currency there was nothing to convert, and theirs is the exact one; it is
 * taken over the printed figure, and over the raw number a store's page
 * carries beside it — which, if it was not rounded, is the same figure.
 */
function lotPrice(converted: string | undefined, native: string | undefined, raw?: number): number | undefined {
  const sign = priceSign(converted)
  if (sign && sign === priceSign(native)) {
    return toPrice(native) ?? raw ?? toPrice(converted)
  }
  return raw ?? toPrice(converted)
}

/**
 * Lots off a seller's own front, as rows of the same table an item's lots fill.
 *
 * They arrive from a different page and so carry different things. A store's
 * own front never repeats who the seller is — every row on it has the same one
 * — so the country and the store name are taken from the directory record
 * instead, and the feedback score, which appears on neither, is left blank
 * rather than guessed at.
 */
/**
 * Has the directory in hand where a lots query asks after a region.
 *
 * A lot states its seller's country and nothing above it; the region is
 * looked up in the store directory — see [lotDirectory] — and a lot with no
 * directory to look it up in has no region at all. The matcher reads a field
 * a row cannot resolve as asking nothing, so `region:Europe` over lots with
 * no directory behind them kept every lot, sellers in the USA included. The
 * directory is one page, held for a year, and this is what fetches it the
 * first time a region is asked of the lots. Not allowed to fail the table:
 * the lots are what it is drawn from, and they are in hand either way.
 */
async function directoryForRegion(request: QueryRequest): Promise<void> {
  if (termValue(request, 'region') !== undefined) {
    await countriesFor().catch(() => undefined)
  }
}

/**
 * The directory as the two lookups a lot needs.
 *
 * Read whole rather than streamed, and the one place here that is: these are
 * lookup tables bounded by the sellers there are in the world, and a lot cannot
 * say what part of the world it is from without them. What must never be read
 * whole is the lots themselves, which is what [eachLot] is for.
 */
async function lotDirectory(records: Iterable<string> = []): Promise<LotDirectory> {
  const directory: LotDirectory = {
    sellers: new Map((await readStores()).map((store) => [store.id, store])),
    countries: new Map((await readCountries()).map((one) => [one.countryCode, one])),
    categories: new Map(),
    asked: new Set()
  }
  const wanted = new Set(records)
  if (wanted.size) {
    const db = await getDbConnection()
    try {
      await categoriesBehind(db, directory, wanted)
    } finally {
      db.close()
    }
  }
  return directory
}

interface LotDirectory {
  sellers: Map<string, Store>
  countries: Map<string, Country>
  /**
   * BrickLink's category id and name behind each record the lots are of — for
   * the `category:` term and the Category column, neither of which a lot
   * states on its own fields, and for the category price factors besides. See
   * [categoriesBehind].
   */
  categories: Map<string, { id: number; name: string }>
  /**
   * The records looked up so far, whether or not one was on file — a record
   * with no category is not asked about again on the next chunk of lots.
   */
  asked: Set<string>
}

/**
 * The category behind each of these records, where one is on file, added to
 * the directory.
 *
 * One point lookup per distinct record not already looked up, the way [reach]
 * reads the same store for its cards: a seller stocks the same part in nine
 * colours, so the set is far smaller than the lots. The lookups of one call
 * go out together in one transaction rather than one awaited after another —
 * thirty thousand records is under a second that way and nearly two the
 * other. Filled a chunk of lots at a time by [eachLotRows], which is what lets
 * a walk over every lot start handing rows over before it has seen the last
 * of them.
 */
async function categoriesBehind(
  db: IDBPDatabase,
  directory: LotDirectory,
  records: Iterable<string>
): Promise<void> {
  const wanted: string[] = []
  for (const record of records) {
    if (!directory.asked.has(record)) {
      directory.asked.add(record)
      wanted.push(record)
    }
  }
  if (!wanted.length) {
    return
  }
  const store = db.transaction(dbStores.BRICK_LINK_ITEMS.name).store
  const items = await Promise.all(
    wanted.map((record) => store.get(record) as Promise<BrickLinkItem | undefined>)
  )
  items.forEach((item, at) => {
    const id = item?.categoryId ?? item?.['Category ID']
    const numericId = Number(id)
    // A number, not the string BrickLink's own field holds it as: `:`
    // compares a number exactly and only substring-matches a string, so
    // `category:5` against a string id was finding every id with a `5` in
    // it anywhere — 15, 51, 205 — not just category 5.
    if (id !== undefined && id !== '' && Number.isFinite(numericId)) {
      directory.categories.set(wanted[at], {
        id: numericId,
        name: item?.['Category Name'] ?? ''
      })
    }
  })
}

/** One stored lot, as a row. */
function toStoreLotRow(lot: StoredStoreLot, directory: LotDirectory): ShellRow {
  {
    const sellers = directory.sellers
    const countries = directory.countries
    const seller = sellers.get(lot.store)
    const country = seller ? countries.get(seller.countryID) : undefined
    // As on an item's own lots: the printed figure is where the currency is.
    notePriceCurrency(lot.displayPrice)
    const row: ShellRow = {
      id: lot.id,
      entityKey: 'inventories',
      entityLabel: 'Store inventories',
      fields: {
        id: lot.id,
        record: lot.record,
        image: lot.image,
        // The converted figure BrickLink printed, kept for the hover; the
        // number beside it is what the column draws and sorts by.
        price: lot.displayPrice,
        priceValue: lotPrice(lot.displayPrice, lot.nativePrice, lot.price),
        nativePrice: lot.nativePrice,
        itemName: lot.itemName,
        colorName: lot.colorName,
        // The seller's own note about this lot, and only that. The item it is
        // a lot of has a column of its own.
        description: lot.description,
        country: seller?.countryID,
        countryName: country?.countryName,
        // As on the item's own lots: the region is the directory's, not the
        // lot's, and here the country record it comes off is already in hand.
        region: country?.regionId,
        province: seller ? provinceId(seller) : undefined,
        store: lot.store,
        // The trading name where the directory has it, and the username where
        // it does not: a blank cell in the column that says whose lot this is
        // would be the one thing this table cannot leave unanswered.
        storeName: seller?.name ?? lot.store,
        condition: lot.condition,
        conditionName: conditionName(lot.condition),
        quantity: lot.quantity,
        type: lot.itemType,
        itemId: lot.itemNumber,
        colorid: lot.colorId === undefined ? undefined : Number(lot.colorId),
        cartQuantity: cartQuantityOf(lot.id)
      }
    }
    return priced(row, directory)
  }
}

async function asStoreLotRows(lots: StoredStoreLot[]): Promise<ShellRow[]> {
  const directory = await lotDirectory(lots.map((lot) => lot.record))
  return lots.map((lot) => toStoreLotRow(lot, directory))
}

/**
 * Every lot brickzuke holds, handed over one at a time.
 *
 * The fact table the home screen's cards are joined through — see [reach] — and
 * the one store here that has no bound on it: a seller runs to thousands of
 * lots and a region to thousands of sellers, so reading them into an array to
 * filter it is a way of running out of memory on somebody's laptop. This walks
 * a cursor instead: one row read, one row given to the caller, one row
 * forgotten, then the next.
 *
 * Both halves of the table, in the order they cost: the lots this session has
 * opened are already in memory, and the stored ones come off the cursor behind
 * them. Returns how many were seen, which is the one number a caller cannot
 * count for itself without keeping them.
 */
export async function eachLot(visit: (lot: ShellRow) => void): Promise<number> {
  return eachLotRows((rows) => {
    rows.forEach(visit)
    return true
  })
}

/**
 * Stored lots pulled per round trip.
 *
 * Every other read of the database waits behind whichever chunk is in hand,
 * so this is a latency put on everything else for as long as a walk runs —
 * and the walk itself holds only this many at once. Five thousand is a dozen
 * milliseconds or so at the sizes a stored lot runs to.
 */
const LOT_CHUNK = 5_000

/**
 * The same walk, a chunk at a time: the lots in memory first, as one chunk,
 * then the stored ones in key order. The category behind each record is
 * looked up as the chunk holding it arrives, so the first chunk's rows are in
 * hand a few round trips in rather than after a pass over the whole store —
 * which is what lets a table drawn from this show its first page while the
 * rest is still being read. The visitor answers whether to go on; a table
 * whose query has moved on says no. Returns how many were handed over.
 */
async function eachLotRows(visit: (rows: ShellRow[]) => boolean): Promise<number> {
  let seen = 0
  const directory = await lotDirectory()
  const db = await getDbConnection()
  try {
    const held = readStoreInventories()
    if (held.length) {
      await categoriesBehind(db, directory, held.map((lot) => `${lot.itemType}-${lot.itemNumber}`))
      const rows = held.map((lot) => toStoreInventoryRow(lot, directory))
      seen += rows.length
      if (!visit(rows)) {
        return seen
      }
    }
    let range: IDBKeyRange | null = null
    for (;;) {
      const batch = (await getAll<StoredStoreLot>(db, dbStores.STORE_LOTS, range, LOT_CHUNK)) ?? []
      if (!batch.length) {
        return seen
      }
      await categoriesBehind(db, directory, batch.map((lot) => lot.record))
      const rows = batch.map((lot) => toStoreLotRow(lot, directory))
      seen += rows.length
      if (!visit(rows) || batch.length < LOT_CHUNK) {
        return seen
      }
      range = IDBKeyRange.lowerBound(batch[batch.length - 1].id, true)
    }
  } finally {
    db.close()
  }
}

/**
 * The lots a cross-section over them should count, which is the ones the query
 * matches rather than every one loaded.
 *
 * Without this the conditions table read `New 3.0k` beside a lots table
 * showing none: a region nobody sells from narrowed the lots and left the
 * summary of them standing.
 *
 * Four fields are not filters here. `record`, `id` and `store` are what
 * fetched the lots — `id` being the item, as on the lots table itself, see
 * [namesItem] — and `condition` is what these rows partition by: the table
 * states both conditions whichever one is asked about, each saying how much
 * of it there is. Everything else narrows: a region, a country, a colour.
 *
 * Matched against the lot's own fields and no columns, which is the whole
 * vocabulary a lot has: these are lots being counted, not the rows of the
 * table whose request this is.
 */
const LOT_FIELDS = {
  facets: [],
  columns: []
} as unknown as EntitySchema

/**
 * The terms of a query that narrow the lots a cross-section counts, or nothing
 * where none does — a group left with no terms constrains nothing, so it
 * matches every lot, and the whole expression with it.
 */
function lotTerms(request: QueryRequest): Term[][] | undefined {
  const groups = parseExpression(request.query.expr).map((group) =>
    group.filter(
      (term) => !['record', 'id', 'store', 'condition'].some((field) => addresses(term, field))
    )
  )
  return !groups.length || groups.some((group) => !group.length) ? undefined : groups
}

function lotsMatching(request: QueryRequest, lots: ShellRow[]): ShellRow[] {
  const groups = lotTerms(request)
  return groups ? lots.filter((lot) => matchesExpression(groups, lot, LOT_FIELDS)) : lots
}

/** The two conditions BrickLink sells in, under the codes a lot carries. */
const CONDITIONS: Record<string, string> = {
  N: 'New',
  U: 'Used'
}

function conditionName(code: string | undefined): string | undefined {
  return code === undefined ? undefined : (CONDITIONS[code] ?? code)
}

/**
 * One picture of an item, as a row — carrying what the catalogue says of the
 * item, where it has a record of it.
 *
 * The name, category and year are the item's, under the field names the
 * items table carries them in, so a term about the item narrows its
 * pictures the way it narrows the item: `name:brick year:2010` reads the
 * same on both tables. Without them a picture was a record code and a URL,
 * and `name:brick` matched no picture of any brick. What a picture cannot
 * say — who sells the item, where — the join answers, as on every other
 * table; see [joined].
 */
function toImageRow(record: string, image: ItemImage, item?: BrickLinkItem): ShellRow {
  const raw = item as unknown as Record<string, string> | undefined
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
      // The record where the catalogue has no name for it — one of theirs,
      // or a record the update run has not reached — so the column is never
      // blank and the picture still says what it is of.
      name: item?.Name ?? record,
      // A number, as on the items table: `:` compares a number exactly and
      // only substring-matches a string.
      category: item ? Number(item['Category ID']) : undefined,
      categoryName: item?.['Category Name'],
      year: raw?.['Year Released']
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
      countries: region.countryCount,
      // The factor somebody has put on every lot from this part of the
      // world, if any — see [priceModifiers].
      priceModifier: priceModifierOf('regions', region.name)
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
      stores: country.storeCount,
      // The factor somebody has put on every lot from this country, if any
      // — see [priceModifiers].
      priceModifier: priceModifierOf('countries', country.countryCode)
    }
  }
}

/** One seller, as a row. */
function toStoreRow(store: Store, regions: Map<string, string>): ShellRow {
  return {
    id: store.id,
    entityKey: 'stores',
    entityLabel: 'Stores',
    fields: {
      id: store.id,
      store: store.id,
      name: store.name,
      country: store.countryID,
      // A seller states the country it is in and never the region, so
      // `region:"Europe"` would have matched every store there is — an
      // unresolvable field matching every row, which is the one way this
      // language fails quietly. Carried here so the term narrows sellers the
      // same way it narrows the countries they are in.
      region: regions.get(store.countryID),
      // The key the provinces table is scoped by, and the name that key
      // stands for: `province:"US-Ohio"` narrows the sellers, and the column
      // reads Ohio.
      province: provinceId(store),
      provinceName: store.stateName,
      items: store.items,
      // A flag rather than a number, and drawn as the word or nothing: the
      // original prints the raw boolean, which puts `false` in every other row.
      instantCheckout: store.instantCheckout === true ? 'Instant' : '',
      // As on a country: the factor on every lot of this seller's.
      priceModifier: priceModifierOf('stores', store.id)
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
  // A set of theirs is read and never fetched: there is no page of BrickLink's
  // to ask, and `inventoryFor` would go and ask it.
  if (userItemIdOf(record) !== undefined) {
    return reading((db) => userInventoryLineRows(db, record))
  }
  const stored = fetching ? await inventoryFor(record) : await readInventory(record)
  return stored.map(toInventoryRow)
}

/**
 * One record, addressed by its own BrickLink id.
 *
 * `item:` is how anyone reaches this table — an item opened shows the records
 * it collapsed. This is the same type asked the other question, and it is the
 * header that asks it: `record:"S-75884-1"` is the address of a set's parts,
 * its lots and its pictures, and none of those three tables holds the record
 * itself, so nothing on screen says which set it is. The header reads the term
 * back against the type that declares the field and shows what that record is
 * called — see the `scope` on `itemRecords` in [catalogSchema].
 *
 * One lookup and no index, `S-75884-1` being the key path of the store itself.
 */
async function namedRecordRows(request: QueryRequest): Promise<ShellRow[]> {
  const record = termValue(request, 'record')
  if (!record) {
    return []
  }
  // One of theirs: the header names `record:"U-3"` through this type as it
  // names a BrickLink set, so the row it finds has to be here to be found.
  if (userItemIdOf(record) !== undefined) {
    return reading(async (db) =>
      (await userItemRows(db))
        .filter((row) => row.id === record)
        .map((row) => ({
          ...row,
          entityKey: 'itemRecords',
          entityLabel: 'Item records',
          fields: {
            ...row.fields,
            // The name alone, as a BrickLink record's row carries it: the
            // header states the record after it, and the items table's row
            // already has it there — see [userItemRows].
            name: row.fields.ownName
          }
        }))
    )
  }
  const db = await getDbConnection()
  try {
    const stored = await get<JoinedItem>(db, dbStores.BRICK_LINK_ITEMS, record)
    return stored ? [toRecordRow(stored.bzItemId, stored)] : []
  } finally {
    db.close()
  }
}

/** The records behind one item, ordered the way the query asks. */
async function recordRows(request: QueryRequest): Promise<ShellRow[]> {
  const itemId = openItemId(request)
  // No item named is not an error: a record named on its own is the other way
  // in, and neither named is the address of nothing — the shell draws an empty
  // table rather than the whole catalogue.
  if (itemId === undefined) {
    return namedRecordRows(request)
  }
  await ensurePartCounts()
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
 * What a lots query narrows by that BrickLink's own list can be asked to
 * leave out: the condition, and the seller's region.
 *
 * Its list is one page of five hundred, cheapest first, out of tens of
 * thousands, and a condition or a region taken out of that page afterwards
 * leaves a couple of dozen rows of a market with ten thousand in it. A
 * table that partitions by one of these asks without it — the conditions
 * table states both conditions whichever one the query names.
 */
function lotNarrowingOf(request: QueryRequest): LotNarrowing {
  return {
    condition: termValue(request, 'condition'),
    region: termValue(request, 'region')
  }
}

/**
 * The rest of an item's narrowed lots, fetched while the table is up.
 *
 * One [narrowedLotsFill] per record the query stands for, run one after the
 * other. The records are looked up in the run rather than before it — a
 * fill is made in the same breath as the query, and the lookup is a read of
 * the catalogue — so the fill for an id with nothing behind it is a run
 * that ends at once. A query narrowing by nothing the list takes is the
 * bare ask — the whole list, paged — see [lotAsksFor].
 */
function itemLotsFill(
  request: QueryRequest,
  narrowing = lotNarrowingOf(request)
): Fill {
  let stopped = false
  let running: Fill | undefined
  return {
    version: narrowedLotsVersion,
    stop() {
      stopped = true
      running?.stop()
    },
    async run() {
      for (const record of await itemRecords(request)) {
        if (stopped) {
          return
        }
        running = narrowedLotsFill(record, narrowing)
        await running.run()
      }
    }
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
async function storeInventoryRows(
  request: QueryRequest,
  fetching = true,
  narrowing = lotNarrowingOf(request)
): Promise<ShellRow[]> {
  const named = namesItem(request)
  const store = termValue(request, 'store')
  if (!named && store) {
    const lots = fetching ? await storeLotsFor(store) : await readStoreLots(store)
    if (fetching) {
      // And the seller's terms, behind the lots rather than before them: a
      // seller whose lots somebody is pricing is a seller whose postage they
      // are about to ask after, and it is one request, held for a week. Not
      // awaited — the table is drawn from the lots — and not allowed to fail
      // it either.
      void storePolicyFor(store).catch(() => undefined)
    }
    return await asStoreLotRows(lots)
  }
  // One item's lots are every record's the query stands for — usually one,
  // and none at all for an id the catalogue has no record of, which is an
  // empty table rather than every lot stored.
  const records = named ? await itemRecords(request) : [undefined]
  // The narrowing is put to BrickLink where it can be — see [lotNarrowingOf]
  // — and what it cannot take is narrowed here as before, off the page.
  const lots = (
    await Promise.all(
      records.map(async (record) => {
        const narrowed = record && (await narrowedStoreInventoriesFor(record, narrowing, fetching))
        if (narrowed) {
          return narrowed
        }
        return fetching ? storeInventoriesFor(record) : readStoreInventories(record)
      })
    )
  ).flat()
  if (fetching) {
    await directoryForRegion(request)
  }
  const directory = await lotDirectory(lots.map((lot) => `${lot.itemType}-${lot.itemNumber}`))
  const rows = lots.map((lot) => toStoreInventoryRow(lot, directory))
  if (named) {
    /*
     * And the item's lots off the sellers' own fronts, behind the page's.
     *
     * An item's page is the cheapest five hundred of its lots, read this
     * session or not at all; a seller's front is every lot they have, kept.
     * Between them the fronts opened so far hold lots of this item the page
     * does not — the dearer ones, and every one of them after a reload, when
     * the page has not been asked for yet. Both are lots on offer for the
     * item, so both are the table, and both are what a card is joined
     * through: without the second half the home screen under `id:` had no
     * lot to read a seller off, and every card stood at its population.
     *
     * The page's copy wins where the two name the same lot, being the
     * fresher price.
     */
    const held = new Set(rows.map((row) => row.id))
    const stored = (
      await Promise.all(records.map((record) => (record ? readStoreLotsOf(record) : [])))
    )
      .flat()
      .filter((lot) => !held.has(lot.id))
    return [...rows, ...(await asStoreLotRows(stored))]
  }
  /*
   * Un-narrowed, which is both pages at once.
   *
   * An item's lots are held in the item page store and go stale with the
   * prices on them, so they are what this session has read; a seller's own
   * lots cost a request per hundred and are kept. The table said only the
   * first of those while its count said both — the card read `3,002` over a
   * screen that was empty after a reload, and a query over it narrowed a set
   * that was not there. [catalogCounts] counts the two together, so the table
   * shows the two together.
   */
  return [...rows, ...(await asStoreLotRows(await readAllStoreLots()))]
}

/**
 * The pictures of the item a query names, or of every item stored so far.
 *
 * Named — `record:` or `id:` — the item's records are fetched, and the
 * table is their pictures. Un-narrowed, the rows are every picture stored,
 * and the query narrows them as it narrows any table: a picture carries its
 * item's name, category and year (see [toImageRow]) and the join answers
 * for the sellers. What is *not* stored yet is [imagesFill]'s to fetch —
 * the items the query matches, one page at a time while the table is up —
 * and each one landing is read here again.
 */
async function imageRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  let pictures: Map<string, ItemImage[]>
  if (namesItem(request)) {
    pictures = new Map()
    for (const record of await itemRecords(request)) {
      pictures.set(record, fetching ? await imagesFor(record) : await readImages(record))
    }
  } else {
    pictures = await readAllImages()
  }
  const records = Array.from(pictures.keys())
  const items = await recordsBehind(records)
  return records.flatMap((record) =>
    pictures.get(record)!.map((image) => toImageRow(record, image, items.get(record)))
  )
}

/**
 * The catalogue's record of each of these, where it has one — one point
 * lookup per record in one transaction, as [categoriesBehind] reads the
 * same store.
 */
async function recordsBehind(records: readonly string[]): Promise<Map<string, BrickLinkItem>> {
  const behind = new Map<string, BrickLinkItem>()
  if (!records.length) {
    return behind
  }
  const db = await getDbConnection()
  try {
    const store = db.transaction(dbStores.BRICK_LINK_ITEMS.name).store
    const items = await Promise.all(
      records.map((record) => store.get(record) as Promise<BrickLinkItem | undefined>)
    )
    items.forEach((item, at) => {
      if (item) {
        behind.set(records[at], item)
      }
    })
  } finally {
    db.close()
  }
  return behind
}

/** Bumped as each item's pictures land, for the table drawn from them — see [imagesFill]. */
const imagesVersion = ref(0)

/**
 * The records of every item the query matches — the items table's own
 * answer to it, read for its records rather than its rows.
 *
 * The same scan the items table makes, under the same expression and the
 * same join, so the pictures fetched are of exactly the items that table
 * would list: `type:P region:Europe` is the parts a European seller has a
 * lot of, and `name:brick` the bricks. A `type:` term narrows an item's
 * records the way [itemRecords] narrows them, an item of several types
 * being one row of the scan and one record of each type. `stopped` ends
 * the scan early — it is two hundred thousand items, and a table that has
 * been left is no reason to finish reading them.
 */
async function matchedRecords(request: QueryRequest, stopped: () => boolean): Promise<string[]> {
  const items = request.schema?.entities.find((entity) => entity.key === 'items')
  if (!items) {
    return []
  }
  const type = termValue(request, 'type')
  const records: string[] = []
  const db = await getDbConnection()
  try {
    await scan(
      db,
      {
        ...request,
        entity: items
      },
      (row) => {
        const own = row.fields.records
        for (const record of Array.isArray(own) ? own : [row.fields.record]) {
          if (typeof record === 'string' && (!type || record.startsWith(type + '-'))) {
            records.push(record)
          }
        }
        return !stopped()
      }
    )
  } finally {
    db.close()
  }
  return records
}

/**
 * The pictures of the items the query matches, fetched while the table is up.
 *
 * An item's pictures are on its page, and nothing lists them for more than
 * one item at a time — so a query matching a thousand parts is a thousand
 * pages, and this is what asks for them: one at a time, at the pace every
 * fill shares, stopping when the table is left (see [pageFill]). The list
 * worked down is [matchedRecords], read once when the first page is asked
 * for, against the records whose pictures are stored already, read once
 * beside it; the "page" is a position in the list, and what moves as one
 * lands is the number of records stored. A record no page can be read for
 * is passed over rather than waited on — see [hasPage].
 *
 * Nothing where the query names an item: its records are fetched before the
 * first push, there being one or two of them — see [imageRows].
 */
function imagesFill(request: QueryRequest): Fill | undefined {
  if (namesItem(request)) {
    return undefined
  }
  let stopped = false
  let records: string[] | undefined
  let held: Set<string> | undefined
  const fill = fillPages(
    {
      async next() {
        records ??= await matchedRecords(request, () => stopped)
        held ??= await imagedRecords()
        const at = records.findIndex((record) => hasPage(record) && !held!.has(record))
        return at === -1 ? undefined : at
      },
      async fetch(at: number) {
        // Resolves once the pictures are stored, or fails when nothing
        // answers — and a failure ends the run, as on every fill.
        await imagesFor(records![at])
        held!.add(records![at])
      },
      async reach() {
        return held?.size ?? 0
      }
    },
    imagesVersion
  )
  return {
    version: imagesVersion,
    stop() {
      stopped = true
      fill.stop()
    },
    run: () => fill.run()
  }
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
  /*
   * Over the lots themselves only where the query says which: an item's or a
   * seller's, or the ones some other term reaches — a region, a colour. Those
   * are bounded by what one page holds, or are a question only the lots can
   * answer. Un-narrowed, the lots are every one stored, and the two numbers
   * this table wants of them come off the fold instead — see
   * [conditionCounts] — with the ones an item's page put in memory this
   * session counted live beside them, there being few and already in hand.
   */
  if (namesItem(request) || termValue(request, 'store') || lotTerms(request)) {
    const lots = await storeInventoryRows(request, fetching, conditionNarrowingOf(request))
    const narrowed = lotsMatching(request, lots)
    return conditionRowsOf(lots.length > 0, (code) => {
      const mine = narrowed.filter((lot) => lot.fields.condition === code)
      return {
        lots: mine.length,
        quantity: mine.reduce((sum, lot) => sum + Number(lot.fields.quantity ?? 0), 0)
      }
    })
  }
  const held = readStoreInventories()
  const stored = conditionCounts()
  const storedLots = [...(stored?.values() ?? [])].reduce((sum, count) => sum + count.lots, 0)
  return conditionRowsOf(held.length + storedLots > 0, (code) => {
    const mine = held.filter((lot) => lot.condition === code)
    const folded = stored?.get(code)
    return {
      lots: mine.length + (folded?.lots ?? 0),
      quantity: mine.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0) + (folded?.quantity ?? 0)
    }
  })
}

/**
 * Both rows, each counted by `count`.
 *
 * Blank rather than nought where nothing is loaded: no lots read is not the
 * same claim as no lots on offer, which is the distinction `total` in
 * catalogRows exists to keep. Gated on what was read rather than on what
 * matched, those being the two different questions — a query that matches
 * none of the lots brickzuke holds is a nought, and holding none at all is
 * still a blank.
 */
function conditionRowsOf(
  read: boolean,
  count: (code: string) => { lots: number; quantity: number }
): ShellRow[] {
  return Object.entries(CONDITIONS).map(([code, name]) => {
    const mine = read ? count(code) : undefined
    return {
      id: code,
      entityKey: 'conditions',
      entityLabel: 'Conditions',
      fields: {
        id: code,
        condition: code,
        name,
        lots: mine?.lots,
        quantity: mine?.quantity,
        // As on a country: the factor on every lot in this condition.
        priceModifier: priceModifierOf('conditions', code)
      }
    }
  })
}

/**
 * The rest of the un-narrowed conditions table: the fold over the stored lots,
 * which the first push does without where it has not landed. Its version
 * moves as the fold lands and again as a seller's pages refold it, and the
 * table is redrawn on each — see `stream`. Nothing to stop: the fold is one
 * pass, held for whoever asks next.
 */
/**
 * What the conditions table asks BrickLink to narrow an item's lots by: the
 * region and not the condition, the table stating both conditions whichever
 * one the query names — see [lotNarrowingOf].
 */
function conditionNarrowingOf(request: QueryRequest): LotNarrowing {
  return {
    region: termValue(request, 'region')
  }
}

function conditionCountsFill(request: QueryRequest): Fill | undefined {
  // An item's lots under a region are pages of an answer, and this table
  // counted the first of them as if it were all of them — `New 9` beside
  // `Used 491` for a part with thousands of each in Europe. The same fill
  // the lots table runs, over the same ask, redraws the two counts as each
  // page lands.
  if (namesItem(request)) {
    return itemLotsFill(request, conditionNarrowingOf(request))
  }
  if (termValue(request, 'store') || lotTerms(request)) {
    return undefined
  }
  return {
    version: conditionCountsVersion,
    run: ensureConditionCounts,
    stop() {}
  }
}

/**
 * Which region each country is in, as one map.
 *
 * The directory is the only place that says so: a region lists its countries,
 * a country carries its region, and everything below a country — a seller, a
 * lot — states the country alone. So a `region:` term reaches the sellers
 * through this, and reaches them at all; the lots read the same thing off
 * [lotDirectory], which they need for the seller record as well.
 *
 * Held for the session once there is something to hold. A directory that has
 * not been fetched is an empty map and is not kept, an empty answer here being
 * "nobody has asked for the countries yet" rather than "there are none".
 */
let regionByCountry: Promise<Map<string, string>> | undefined

function countryRegions(): Promise<Map<string, string>> {
  regionByCountry ??= readCountries()
    .then((countries) => {
      const held = new Map(countries.map((country) => [country.countryCode, country.regionId]))
      if (!held.size) {
        regionByCountry = undefined
      }
      return held
    })
    .catch((thrown) => {
      // A failed read must not be the answer forever.
      regionByCountry = undefined
      throw thrown
    })
  return regionByCountry
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
  const regions = await countryRegions()
  return stores.map((store) => toStoreRow(store, regions))
}

/** What the sellers of one province add up to, before it is a row. */
interface ProvinceTally {
  country: string
  name: string
  stores: number
  items: number
}

/**
 * The provinces a country's sellers are grouped under, as the sellers state
 * them.
 *
 * Derived rather than stored, like the years: BrickLink has no page that lists
 * the provinces of the world, only a country's sellers grouped under theirs —
 * so a province exists here exactly when a seller in it does, and this is one
 * fold over the sellers rather than a store of its own that could disagree
 * with them. Where a country's directory page does not group at all — most of
 * them — its sellers carry no province, and they fold into nothing.
 *
 * Addressed by country for the reason the sellers are: naming one is what
 * fetches its page, and un-narrowed this is whatever the fill has gathered.
 */
export function provincesOf(stores: readonly Store[]): Map<string, ProvinceTally> {
  const provinces = new Map<string, ProvinceTally>()
  for (const store of stores) {
    const id = provinceId(store)
    if (!id) {
      continue
    }
    const tally = provinces.get(id) ?? {
      country: store.countryID,
      name: store.stateName ?? '',
      stores: 0,
      items: 0
    }
    tally.stores++
    tally.items += Number.isFinite(store.items) ? Number(store.items) : 0
    provinces.set(id, tally)
  }
  return provinces
}

async function provinceRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const country = termValue(request, 'country')
  const stores = fetching ? await storesFor(country) : await readStores(country)
  const countries = new Map((await readCountries()).map((one) => [one.countryCode, one]))
  return [...provincesOf(stores)].map(([id, province]) => ({
    id,
    entityKey: 'provinces',
    entityLabel: 'Provinces',
    fields: {
      id,
      // The key a seller and a lot both carry, and this type's scope.
      province: id,
      name: province.name,
      country: province.country,
      countryName: countries.get(province.country)?.countryName,
      region: countries.get(province.country)?.regionId,
      stores: province.stores,
      // Every piece for sale in the province, summed over its sellers from the
      // directory's own per-seller figure — see the stores table's `items`.
      items: province.items,
      // As on a region: the factor on every lot from this province.
      priceModifier: priceModifierOf('provinces', id)
    }
  }))
}

/** BrickLink's reach as the word the table shows. */
const REACH_LABEL: Record<StoredShippingMethod['reach'], string> = {
  domestic: 'Domestic',
  international: 'International',
  both: 'Both'
}

/** What every row of a seller's terms says about the seller, before it says its own thing. */
function policyFields(policy: StoredStorePolicy, directory: LotDirectory): Record<string, unknown> {
  const seller = directory.sellers.get(policy.store)
  const country = seller ? directory.countries.get(seller.countryID) : undefined
  return {
    store: policy.store,
    // The trading name where the directory has it, and the username where it
    // does not — as on the lots.
    storeName: seller?.name ?? policy.store,
    country: seller?.countryID,
    countryName: country?.countryName,
    region: country?.regionId,
    province: seller ? provinceId(seller) : undefined,
    // How many countries the seller ships to, or blank where they declared
    // none — which BrickLink draws as a store that ships everywhere.
    shipsTo: policy.shipsTo.length || undefined
  }
}

/** One way a seller sends an order, as a row. */
function toShippingMethodRow(
  policy: StoredStorePolicy,
  method: StoredShippingMethod,
  directory: LotDirectory
): ShellRow {
  return {
    id: String(method.id),
    entityKey: 'shippingMethods',
    entityLabel: 'Shipping methods',
    fields: {
      id: method.id,
      ...policyFields(policy, directory),
      name: method.name,
      note: method.note,
      reach: REACH_LABEL[method.reach]
    }
  }
}

/**
 * One rate read off a seller's shipping terms, as a row.
 *
 * Read at the table rather than stored: the terms are prose, the reading of
 * them is a heuristic — see [shipping-terms] — and a better reading should
 * reach every seller already fetched without anything being cleared. The
 * rates for the country the "Ship to" setting names are marked as such —
 * see [shipping-match] — which is the other half of the guess laid out for
 * checking.
 */
function toShippingCostRows(policy: StoredStorePolicy, directory: LotDirectory): ShellRow[] {
  const seller = policyFields(policy, directory)
  const rates = termsOf(policy).rates
  const applying = ratesApplying(policy, rates, directory)
  return rates.map((rate, index) => ({
    id: `${policy.store}:${index}`,
    entityKey: 'shippingCosts',
    entityLabel: 'Shipping costs',
    fields: {
      id: `${policy.store}:${index}`,
      ...seller,
      applies: applying.has(rate) ? 'Yes' : undefined,
      destination: rate.destination,
      label: rate.label,
      minWeight: rate.minWeight,
      maxWeight: rate.maxWeight,
      cost: rate.cost,
      currency: rate.currency,
      minValue: rate.minValue,
      maxValue: rate.maxValue,
      source: rate.source
    }
  }))
}

/** The sellers' terms a query is about: one seller's, or every one stored. */
async function policiesFor(request: QueryRequest, fetching: boolean): Promise<StoredStorePolicy[]> {
  const store = termValue(request, 'store')
  return fetching ? await storePoliciesFor(store) : await readStorePolicies().then((all) =>
    store ? all.filter((policy) => policy.store === store) : all
  )
}

/** The ways the sellers a query names will send an order. */
async function shippingMethodRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const policies = await policiesFor(request, fetching)
  const directory = await lotDirectory()
  return policies.flatMap((policy) =>
    policy.methods.map((method) => toShippingMethodRow(policy, method, directory))
  )
}

/** What those sellers say they charge, as far as it can be read. */
async function shippingCostRows(request: QueryRequest, fetching = true): Promise<ShellRow[]> {
  const policies = await policiesFor(request, fetching)
  const directory = await lotDirectory()
  return policies.flatMap((policy) => toShippingCostRows(policy, directory))
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

/**
 * How often the pass says how far it has got, in items.
 *
 * The pass is the one thing on the home screen that takes a visible moment,
 * and the card over it read nothing at all until it finished. A count every
 * five thousand items is a number that moves while somebody is watching it and
 * costs one call per twenty batches.
 */
const YEARS_REPORTED_EVERY = 5_000

/**
 * Told how many distinct years the pass has seen, while it is still running.
 *
 * A floor rather than a projection, and the caller says so — see [fillYears]
 * in homeFill, which is what puts the `~` on it.
 */
export type YearProgress = (seen: number) => void

function scanYears(report?: YearProgress): Promise<ShellRow[]> {
  return (async () => {
    const db = await getDbConnection()
    const counts = new Map<string, number>()
    try {
      let seen = 0
      // Every item, whatever the query says: the query narrows the years, not
      // the catalogue they are counted from — a year stating how many items it
      // holds must not restate the filter that is already on screen.
      await scan(db, everything, (row) => {
        const year = String(row.fields.year ?? '').trim()
        if (year) {
          counts.set(year, (counts.get(year) ?? 0) + 1)
        }
        if (report && ++seen % YEARS_REPORTED_EVERY === 0) {
          report(counts.size)
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

function yearRows(
  request: QueryRequest,
  fetching = true,
  report?: YearProgress
): Promise<ShellRow[]> {
  // The home screen runs one query per type every time it is drawn, and a
  // summary card is no reason to walk two hundred thousand items. Once the
  // table itself has been opened the answer is held, and the card is free.
  if (!fetching && !years) {
    return Promise.resolve([])
  }
  // The progress goes to whoever starts the pass and nobody else: it is one
  // pass however many asked for it, so a second caller arriving halfway
  // through is handed the held promise and hears nothing until it resolves.
  years ??= scanYears(report)
  return years
}

/**
 * How many years the catalogue covers, for the home screen card.
 *
 * This does ask for the pass, unlike the un-narrowed query above — a card with
 * no number on it is the thing being fixed. It is the same held promise, so the
 * pass happens once a session whether it was the card or the table that asked.
 */
export async function yearCount(report?: YearProgress): Promise<number> {
  return (await yearRows(everything, true, report)).length
}

/** Drops the held years, for when an update run has rewritten the catalogue. */
export function forgetScannedRows() {
  years = undefined
  regionByCountry = undefined
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
  /**
   * The rest of an answer that arrives a page at a time, for the queries that
   * have one — see [pageFill]. `stream` runs it behind the rows it already
   * has and stops it on the way out; nothing else here asks for it, a card
   * counting a type being no reason to fetch sixty pages of BrickLink.
   */
  fill?: (request: QueryRequest) => Fill | undefined
}

function addressesOf(source: Fetched, request: QueryRequest): string[] {
  const own =
    typeof source.addresses === 'function' ? source.addresses(request) : source.addresses
  // And the item's, on every one of these — see [itemAddress].
  return [...own, ...itemAddress(request)]
}

const fetched: Record<string, Fetched> = {
  inventory: {
    addresses: ['record'],
    rows: inventoryRows
  },
  itemRecords: {
    // The item is what fetched the rows, so it does not filter them again. A
    // record on its own fetched the one record instead, and is then the
    // address — which is the lookup the header's names are made of.
    addresses: (request) => (termValue(request, 'item') ? ['item'] : ['item', 'record']),
    rows: recordRows
  },
  colorItems: {
    addresses: ['colorid', 'type'],
    rows: colorItemRows,
    fill: (request) => {
      const colorId = termValue(request, 'colorid')
      // The same pair `colorItemRows` reads, and the same default: the press
      // that opens this table writes `type` and a hand-typed query need not.
      return colorId ? colorItemsFill(termValue(request, 'type') ?? 'P', colorId) : undefined
    }
  },
  inventories: {
    // A record is what fetched the rows, so it does not filter them again — and
    // a `store:` term written beside one still does, being an ordinary
    // narrowing of an item's sellers. A store on its own is what fetched them
    // instead, and then it is the address. An item named by `id:` is the
    // address the same way `record:` is — the lots are one row's `record`
    // and no row's `id` — see [namesItem].
    addresses: (request) =>
      termValue(request, 'record')
        ? ['record']
        : namesItem(request)
          ? ['record', 'id']
          : ['record', 'store'],
    rows: storeInventoryRows,
    fill: (request) => {
      const store = termValue(request, 'store')
      // The seller's own front is paged, and so is an item's answer, narrowed
      // or not — see [itemLotsFill]. The un-narrowed table naming no item is
      // what browsing has gathered rather than an answer with more of it to
      // come.
      if (store && !namesItem(request)) {
        return storeLotsFill(store)
      }
      return namesItem(request) ? itemLotsFill(request) : undefined
    }
  },
  images: {
    addresses: ['record'],
    rows: imageRows,
    fill: imagesFill
  },
  conditions: {
    addresses: ['record'],
    rows: conditionRows,
    fill: conditionCountsFill
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
  provinces: {
    addresses: ['country'],
    rows: provinceRows
  },
  /*
   * A seller's terms, two ways. Both are addressed by the seller — a `store:`
   * term is what fetches them — and un-narrowed both show whatever sellers
   * have been looked at, as the lots do.
   */
  shippingMethods: {
    addresses: ['store'],
    rows: shippingMethodRows
  },
  shippingCosts: {
    addresses: ['store'],
    rows: shippingCostRows
  },
  years: {
    addresses: [],
    rows: yearRows
  },
  /*
   * The three detail types over somebody's own records. Each is addressed by
   * the list it belongs to and fetches nothing — everything they read is
   * already stored, these being the one part of brickzuke that was never
   * scraped — so none of them takes the `fetching` flag the catalogue's own
   * types turn on. A set of theirs has no such type: its parts are the
   * `inventory` above, addressed by its record like any set's.
   */
  shopListItems: {
    addresses: ['shoplist'],
    rows: (request) => reading((db) => shopListItemRows(db, openedUserId(request, 'shoplist')))
  },
  /* The lots in one cart, addressed by the cart the same way. */
  cartLines: {
    addresses: ['cart'],
    rows: (request) => reading((db) => cartLineRows(db, openedUserId(request, 'cart')))
  },
  /*
   * And the two the planner draws. Both are worked out from the one walk over
   * every lot held, which is why they share a held answer rather than each
   * making their own — see [shopPlan].
   */
  shopPlan: {
    addresses: ['shoplist'],
    rows: (request) => shopPlanRows(openedUserId(request, 'shoplist'))
  },
  shopStores: {
    addresses: ['shoplist'],
    // With what each would charge to post the order to the ship-to country,
    // off whatever terms are stored — see [shopPostage].
    rows: async (request) =>
      withPostage(await shopStoreRows(openedUserId(request, 'shoplist')), await lotDirectory())
  }
}

/**
 * The record of somebody's own that a detail table is showing.
 *
 * The same read `openItemId` makes of `item:`, over the term that opens one of
 * these instead — the id of the inventory whose parts are up, or of the list
 * whose wanted parts are. An address rather than a filter, for the reason
 * stated on [Fetched]: these rows came back *because* of the term.
 */
function openedUserId(request: QueryRequest, field: string): number | undefined {
  const value = termValue(request, field)
  const id = Number(value)
  return value !== undefined && Number.isFinite(id) && id > 0 ? id : undefined
}

/** One connection, opened for the read and closed after it. */
async function reading(read: (db: IDBPDatabase) => Promise<ShellRow[]>): Promise<ShellRow[]> {
  const db = await getDbConnection()
  try {
    return await read(db)
  } finally {
    db.close()
  }
}

function entityKey(request: QueryRequest): string | null {
  return request.entity?.key ?? null
}

/**
 * Every row a type has, read from what is already stored and asked of nothing.
 *
 * `query` and `stream` answer a question someone asked, with an expression, an
 * address and a page. This answers the home screen's, which is "what is in
 * here": no narrowing, and `fetching` false throughout, so a card never sends
 * brickzuke to BrickLink. `undefined` where the type has no rows to read
 * without one — the codes, and the items table, which is a scan.
 */
export function storedRows(entityKey: string, expr = ''): Promise<ShellRow[]> | undefined {
  const source = fetched[entityKey]
  if (source) {
    // The expression goes in so a type whose rows are *derived* is derived
    // under it: the conditions are a count over the lots, and filtering the
    // two rows that come back cannot narrow the numbers written on them.
    // Every other type here is filtered by the caller either way.
    return source.rows(expr ? {
      query: {
        expr
      }
    } as unknown as QueryRequest : everything, false)
  }
  return rowsFor(entityKey, getDbConnection)
}

/**
 * Rows in the order a query asks for, as a copy — the held rows are shared
 * with whatever else is reading them and are not a caller's to reorder.
 *
 * Exported because the home screen's cards ask the same question of the same
 * rows: the first few of a type, in the order that type opens in.
 */
export function sorted(
  rows: readonly ShellRow[],
  sort: string,
  dir: string | undefined
): ShellRow[] {
  const desc = dir === 'desc'
  return rows.slice().sort((a, b) => {
    const left = sortValue(a, sort)
    const right = sortValue(b, sort)
    if (left === right) return 0
    const before = left < right ? -1 : 1
    return desc ? -before : before
  })
}

/**
 * The min/max window a range facet narrowed a field to, read straight off the
 * query — a store's own inventory has a quantity and a price to bound, and an
 * item's has a quantity, so both are told by the same window rather than by a
 * term the query language would have to grow a new syntax for.
 */
function activeRanges(request: QueryRequest): [string, Extract<FacetValue, { kind: 'range' }>][] {
  return Object.entries(request.query.facets ?? {}).filter(
    (entry): entry is [string, Extract<FacetValue, { kind: 'range' }>] =>
      entry[1].kind === 'range' && (entry[1].min !== null || entry[1].max !== null)
  )
}

function facetMatcher(request: QueryRequest): (row: ShellRow) => boolean {
  const ranges = activeRanges(request)
  if (!ranges.length) {
    return () => true
  }
  return (row) =>
    ranges.every(([key, range]) => {
      const value = row.fields[key]
      if (typeof value !== 'number') return true
      if (range.min !== null && value < range.min) return false
      if (range.max !== null && value > range.max) return false
      return true
    })
}

/** The small types, filtered and ordered the way the shell asked for them. */
function present(
  rows: readonly ShellRow[],
  request: QueryRequest,
  matches: (row: ShellRow) => boolean = matcherFor(request)
): ShellRow[] {
  const inRange = facetMatcher(request)
  return sorted(rows.filter((row) => matches(row) && inRange(row)), request.query.sort, request.query.dir)
}

/**
 * The same, with the rest of the query put to the lots first.
 *
 * A term a type carries no field for matches every row of it — the
 * language's rule — so a colours table under `condition:N region:Europe`
 * was every colour there is, and the picker said `Colors · 213` beside
 * `Stores · 5.9k` over a query that had narrowed both to a handful. The
 * home screen's cards answer that with the join in [reach]: a lot names
 * the seller, the seller's country and region, the condition, the colour,
 * the type and the item, so the terms a type cannot answer are put to the
 * lots and the type is read off what survives. The tables and the picker
 * read the same join here, so the number beside a type is the number of
 * rows choosing it shows.
 *
 * Where the join counts — a colour is so many lots, so many pieces — the
 * count goes on the row, which is what the colours table's Lots and Quantity
 * draw. On before the sort, so the table can be ordered by it.
 *
 * The conditions table is the one joined type left to its own reading:
 * it states both conditions whichever the query names, each with its count
 * over the same lots (see [conditionRows]), and a join that dropped the
 * condition no lot is in would take the nought off the table.
 *
 * `addressed` are the fields whose terms fetched these rows rather than
 * filter them — see [matcherBesides]; the item's, on every table but its own.
 */
async function joined(
  rows: readonly ShellRow[],
  request: QueryRequest,
  addressed: readonly string[] = itemAddress(request)
): Promise<ShellRow[]> {
  const key = entityKey(request)
  if (!key) {
    return present(rows, request, matcherBesides(request, ...addressed))
  }
  if (key === 'conditions') {
    // Counted before it got here, over the lots the query's terms reach —
    // so the lots have answered what a lot can, as they have below.
    return present(rows, request, matcherOverLots(request, addressed, LOT_TALLIES))
  }
  const reach = await reachFor(key, request.query.expr, rows, request.entity ?? undefined)
  if (!reach.values) {
    return present(rows, request, matcherBesides(request, ...addressed))
  }
  const tallied = talliedOn(rows)
  const counted = rows.flatMap((row) => {
    if (!reaches(reach, row)) {
      return []
    }
    const mine = reach.counts?.get(String(row.fields[reach.field!] ?? '').trim())
    return [
      mine ? {
        ...row,
        fields: {
          ...row.fields,
          ...Object.fromEntries(tallied.map((field) => [field, mine[field]]))
        }
      } : row
    ]
  })
  return present(
    counted,
    request,
    matcherOverLots(request, addressed, tallied.filter((field) => LOT_TALLIES.includes(field)))
  )
}

/** The two figures the join writes beside a row it reaches — see [joined]. */
const TALLIES: readonly (keyof Tally)[] = ['lots', 'quantity']

/**
 * The one of them a lot carries of its own, and so the one a term about it
 * is put to the lots by — see [matcherOverLots].
 */
const LOT_TALLIES: readonly (keyof Tally)[] = ['quantity']

/**
 * Which of the join's figures these rows have none of their own, and so take
 * from it. A colour has no quantity until the lots give it one; a line of a
 * set's inventory has its own — how many of the part the set holds — and
 * keeps it, as the term `quantity>10` on that table keeps meaning the line
 * and not the lots: the rows carry the field, so it is never foreign, see
 * [foreignTerms] in reach.
 */
function talliedOn(rows: readonly ShellRow[]): (keyof Tally)[] {
  const carried = new Set<string>()
  for (const row of rows) {
    for (const field of Object.keys(row.fields)) {
      carried.add(field)
    }
  }
  return TALLIES.filter((field) => !carried.has(field))
}

/**
 * Every row the query matches, across every page — for an operation on the
 * whole table rather than on the page of it the shell has in hand: the cart
 * header's "all rows", say.
 *
 * `query` above, without the page taken out of it and without its shortcut for
 * an un-narrowed query: the home screen has no use for the whole of a store,
 * but a button over a column of it does. Reads only, as `query` does — a press
 * on a header is no reason to fetch — and answers only for the types that are
 * read whole; the items scan is not one of them, and is empty here.
 */
export async function matchingRows(request: QueryRequest): Promise<ShellRow[]> {
  const key = entityKey(request)
  const source = key ? fetched[key] : undefined
  if (source) {
    return joined(await source.rows(request, false), request, addressesOf(source, request))
  }
  const held = key ? rowsFor(key, getDbConnection) : undefined
  return held ? joined(await held, request) : []
}

/**
 * Every lot brickzuke holds, as the page the query asks for, pushed as the
 * walk finds them.
 *
 * Un-narrowed, the lots table is every stored lot — a few hundred thousand
 * once a handful of sellers have been opened — and the one push the other
 * fetched types make read the whole of it into rows, sorted them all and cut
 * fifty out: three and a half seconds before the first row. This is the items
 * scan's shape instead. The page keeps only the rows that could still be on
 * it (see [pageOf]), the walk hands over a chunk at a time (see
 * [eachLotRows]), and the table is told the page as it stands after each — so
 * the first rows are up a few round trips in, and the order settles as the
 * rest arrives. What is on the page is only ever rows the query matches; what
 * changes as the walk goes on is which of them sort into it.
 */
function streamLots(request: QueryRequest, sink: QuerySink): () => void {
  let cancelled = false
  const matches = matcherBesides(request, 'record', 'store')
  const inRange = facetMatcher(request)
  const page = pageOf(request)
  void (async () => {
    try {
      await directoryForRegion(request)
      await eachLotRows((rows) => {
        if (cancelled || !sink.open) {
          return false
        }
        let changed = false
        for (const row of rows) {
          if (matches(row) && inRange(row) && page.take(row)) {
            changed = true
          }
        }
        // A chunk sorting wholly past the end of the page changes the count
        // and nothing that is on screen.
        sink.set(
          changed
            ? {
              rows: page.rows(),
              total: page.total()
            }
            : {
              total: page.total()
            }
        )
        return true
      })
      sink.close()
    } catch (thrown) {
      sink.fail(thrown)
    }
  })()
  return () => {
    cancelled = true
  }
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
    const unfiltered = !request.query.expr.trim() && !activeRanges(request).length
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
      const rows = await joined(await source.rows(request, false), request, addressesOf(source, request))
      return {
        rows: rows.slice(request.offset, request.offset + request.limit),
        total: rows.length,
        unfiltered
      }
    }

    const held = key ? rowsFor(key, getDbConnection) : undefined
    if (held) {
      const rows = await joined(await held, request)
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
    const page = pageOf(request)
    try {
      await scan(db, request, (row) => {
        page.take(row)
        return true
      })
    } finally {
      // An open connection blocks the next version change, and IndexedDB does
      // not time out waiting for one — a leak here is an upgrade that never
      // runs and an app that shows nothing.
      db.close()
    }
    return {
      rows: page.rows(),
      total: page.total(),
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

    // The lots table naming no item and no seller is every lot stored, and is
    // walked rather than read whole — see [streamLots].
    if (key === 'inventories' && !namesItem(request) && !termValue(request, 'store')) {
      return streamLots(request, sink)
    }

    const source = key ? fetched[key] : undefined
    if (source) {
      /** Everything stored for this query, as the page the shell asked for. */
      const push = async () => {
        const all = await source.rows(request, true)
        if (cancelled || !sink.open) return
        // The address terms are this table's address rather than a filter
        // over it, so the rows they fetched are not filtered by them again —
        // but whatever else the query carries does narrow them.
        const rows = await joined(all, request, addressesOf(source, request))
        if (cancelled || !sink.open) return
        sink.set({
          rows: rows.slice(request.offset, request.offset + request.limit),
          total: rows.length
        })
      }

      /*
       * A table that arrives over a minute rather than in one go.
       *
       * The first push is what is stored, which for a seller nobody has opened
       * is the one page `storeLotsFor` fetched to have anything at all. The
       * fill then works through the rest, and every page it lands bumps the
       * version this watches — so the rows are read again and the shell is
       * told the page as it now stands, count and pager included.
       *
       * The sink stays open for the whole of it, that being what the shell
       * draws as pending, and the last push is made after the run rather than
       * left to a watcher that would fire after the close.
       */
      const fill = source.fill?.(request)
      const unwatch = fill && watch(fill.version, () => void push())
      void (async () => {
        try {
          await push()
          if (fill && !cancelled && sink.open) {
            await fill.run()
            await push()
          }
          sink.close()
        } catch (thrown) {
          sink.fail(thrown)
        } finally {
          unwatch?.()
        }
      })()
      return () => {
        cancelled = true
        // The query changed or the shell went away, and page forty-one is now
        // a request on nobody's behalf. What was fetched is stored, and the
        // next visit picks up from it.
        fill?.stop()
        unwatch?.()
      }
    }

    const held = key ? rowsFor(key, getDbConnection) : undefined
    if (held) {
      void held
        .then(async (all) => {
          if (cancelled || !sink.open) return
          const rows = await joined(all, request)
          if (cancelled || !sink.open) return
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

    /*
     * No type named is the home screen, and the home screen is HomeCards: the
     * shell's results area is replaced there, so every row this pushes is
     * thrown away and the one thing read off the stream is the number beside
     * `Everything`. Un-narrowed, that number is how many items the catalogue
     * holds, which the items store already knows — one count, against a pass
     * over every BrickLink record there is.
     *
     * That pass is what this is really for. It ran on the main thread, held a
     * connection open for the whole of it, and sorted two hundred thousand
     * rows into an array nobody was going to look at — on the one screen where
     * every card has its own read to get through first. The category pictures
     * are an indexed read each, and they were queued behind all of it, so they
     * landed when `Everything` finished counting rather than when they were
     * ready.
     *
     * A narrowed query still scans, because a filtered count is a question
     * nothing else here can answer.
     */
    if (key === null && !request.query.expr.trim()) {
      void (async () => {
        const db = await getDbConnection()
        try {
          // Theirs as well: they are rows of the items table now.
          const total =
            (await count(db, dbStores.ITEMS)) + (await count(db, dbStores.USER_ITEMS))
          if (cancelled || !sink.open) return
          sink.set({
            rows: [],
            total
          })
          sink.close()
        } catch (thrown) {
          sink.fail(thrown)
        } finally {
          db.close()
        }
      })()
      return () => {
        cancelled = true
      }
    }

    /*
     * The same page `query` builds, filled by the same scan — see [pageOf].
     *
     * What this cannot do is `insert`. That method puts a row into the *page*,
     * not into the result — "the way it would never have been returned by a
     * `query` for this page", as the shell says — so a position in the whole
     * match is not a position it can be given. On page two every row found
     * sorts somewhere in the first fifty of a list the page does not start at,
     * and inserting them there filled page two with page one. Which is exactly
     * what it showed: the same seven sets, under ordinals 51 to 57.
     *
     * So it says the page as it now stands instead, which is what `set` is for.
     */
    const page = pageOf(request)

    void (async () => {
      const db = await getDbConnection()
      try {
        await scan(db, request, (row) => {
          if (cancelled || !sink.open) return false
          // A row sorting past the end of the page changes the count and
          // nothing that is on screen.
          sink.set(
            page.take(row)
              ? {
                rows: page.rows(),
                total: page.total()
              }
              : {
                total: page.total()
              }
          )
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

/** An expression as the request the readers here take, naming no type. */
function requestOf(expr: string): QueryRequest {
  return {
    query: {
      expr
    }
  } as unknown as QueryRequest
}

/**
 * The lots a query names, as the lots table shows them: an item's lots by
 * `id:` or `record:`, a seller's stored front by `store:` — or nothing,
 * where it names neither and the lots are every one held. Read and never
 * fetched: a count in the picker is no reason to ask BrickLink.
 */
function namedLots(expr: string): Promise<ShellRow[]> | undefined {
  const request = requestOf(expr)
  return namesItem(request) || termValue(request, 'store')
    ? storeInventoryRows(request, false)
    : undefined
}

/**
 * The records the query's item stands for — see [itemRecords] — or nothing
 * where it names no item. What the join reads a type off when the type is
 * about the item itself rather than about who sells it.
 */
function namedRecords(expr: string): Promise<string[]> | undefined {
  const request = requestOf(expr)
  return namesItem(request) ? itemRecords(request) : undefined
}

/**
 * The item's lots, fetched — for the home screen under a query naming one.
 *
 * What the lots table does when it opens on the item, done for the wall
 * instead: the page's own lots first, which is what the cards are joined
 * through, and then the rest of them a page at a time through the fill this
 * hands back — see [itemLotsFill]. Nothing where the query names no item;
 * the wall under any other query deepens through the sellers instead.
 */
export async function fetchNamedLots(expr: string): Promise<Fill | undefined> {
  const request = requestOf(expr)
  if (!namesItem(request)) {
    return undefined
  }
  await storeInventoryRows(request, true)
  return withNamedInventories(request, itemLotsFill(request))
}

/**
 * The fill of an item's lots, with what the item is made of fetched beside
 * them.
 *
 * A set's parts are the one thing about it that is not a bulk download: they
 * are written when somebody opens the set, and a wall under `type:S id:979`
 * is somebody opening it. Without this the Item inventories card stayed blank
 * until the set's own Inventory table had been visited once. The parts go
 * behind the lots rather than in front of them — a set BrickLink lists as
 * empty, gear mostly, answers only by the deadline in [inventoryFetch], and
 * the lots landing should not wait on that — so the fill is what carries
 * them: its version ticks when they land, as it does when a page does, and
 * the wall re-reads on either. Nothing for a part, which is made of nothing
 * — see [hasInventory] — and nothing where the extension does not answer.
 */
function withNamedInventories(request: QueryRequest, lots: Fill): Fill {
  const version = ref(0)
  const unwatch = watch(lots.version, () => {
    version.value++
  })
  return {
    version,
    stop() {
      unwatch()
      lots.stop()
    },
    async run() {
      const parts = (async () => {
        const records = (await itemRecords(request)).filter(hasInventory)
        await Promise.all(
          records.map(async (record) => {
            try {
              await inventoryFor(record)
              version.value++
            } catch {
              // Asked, and nothing came: the card says what is stored.
            }
          })
        )
      })()
      await Promise.all([lots.run(), parts])
    }
  }
}

/*
 * The join reads its lots from here, and this source applies the join to its
 * tables — handed over rather than imported both ways. See [LotSource].
 */
provideLots({
  each: eachLot,
  named: namedLots,
  records: namedRecords
})
