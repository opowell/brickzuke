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
import { rowsFor } from './catalogRows'
import type { StoredItemInventory } from '../stores/bricklink/catalog-item-inv-page'
import { inventoryFor, readInventory } from './inventoryFetch'
import { colorItemsFor, readColorItems } from './colorItemsFetch'
import { colorScope } from '../stores/bricklink/catalog-list-color-page'
import type { StoredColorItem } from '../stores/bricklink/catalog-list-color-page'
import type { BrickLinkItem } from '../stores/bricklink/catalog-download-page'

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
 * fields the row actually carries — `categoryId:"5"` against `fields.categoryId`
 * — rather than against a substring check that only ever knew about the name.
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

/** One part of a set, as a row. */
function toInventoryRow(stored: StoredItemInventory): ShellRow {
  const variant = stored.itemVariant
  return {
    id: stored.id,
    entityKey: 'inventory',
    entityLabel: 'Inventory',
    fields: {
      id: stored.id,
      record: stored.record,
      quantity: stored.quantity,
      image: variant.thumbnail,
      type: variant.itemType,
      name: variant.name,
      itemId: variant.itemId,
      color: variant.colorName,
      // Lowercase because the parser lowercases a term's field, and a number
      // because `:` compares numbers exactly where it substring-matches
      // strings — `colorid:"85"` must not also answer for colour 185.
      colorid: variant.colorId === undefined ? undefined : Number(variant.colorId),
      category: variant.catString,
      categoryName: variant.categoryName
    }
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

    if (key === 'colorItems') {
      // Reads only, as for inventories below: the home screen runs one of
      // these per type every time it is drawn, and a summary card is no reason
      // to scrape twenty pages of BrickLink.
      const rows = present(
        await colorItemRows(request, false),
        request,
        matcherBesides(request, 'colorid', 'type')
      )
      return {
        rows: rows.slice(request.offset, request.offset + request.limit),
        total: rows.length,
        unfiltered
      }
    }

    if (key === 'inventory') {
      // Reads only. `query` is the home screen's, which runs one per type every
      // time it is drawn, and a summary card is no reason to scrape BrickLink.
      const rows = present(await inventoryRows(request, false), request, matcherBesides(request, 'record'))
      return {
        rows: rows.slice(request.offset, request.offset + request.limit),
        total: rows.length,
        unfiltered
      }
    }

    if (key === 'itemRecords') {
      const rows = present(await recordRows(request), request, matcherBesides(request, 'item'))
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

    if (key === 'inventory' || key === 'itemRecords' || key === 'colorItems') {
      const addresses =
        key === 'inventory' ? ['record'] : key === 'itemRecords' ? ['item'] : ['colorid', 'type']
      const fetched =
        key === 'inventory'
          ? inventoryRows(request)
          : key === 'itemRecords'
            ? recordRows(request)
            : colorItemRows(request)
      void fetched
        .then((all) => {
          if (cancelled || !sink.open) return
          // The address terms are this table's address rather than a filter
          // over it, so the rows they fetched are not filtered by them again —
          // but whatever else the query carries does narrow them.
          const rows = present(all, request, matcherBesides(request, ...addresses))
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
