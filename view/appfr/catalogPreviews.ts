/**
 * What is inside each type, for the home screen's cards.
 *
 * A card was a label and a count: true, and not a look at anything. These are
 * the first few records of the table the card leads to, in the order that
 * table opens in, drawn the way the type is worth looking at — pictures where
 * the records have them, and the head of the table itself where they do not.
 *
 * Read through whatever the query says, which is the whole of what a card
 * means: a home screen under `region:"Europe"` that lists Canada among its
 * countries and counts every seller in the world is not a summary of anything
 * anyone asked for. So each card is the head of its own table *as that table
 * would open* — the same rows, the same order, the same count.
 *
 * Bounded reads only. The home screen is reached between every other screen,
 * so nothing here fetches: `storedRows` reads what is already held, the small
 * types are already in memory, and the pictures that are not — the items' — are
 * an indexed read with a count on it, never a pass over the catalogue.
 * Narrowed, the items card is the one exception, and says why at
 * [narrowedItems].
 */
import {addTerm,
  cellText,
  cellValue,
  parseExpression,
  roleColumn,
  scopeTermFor} from 'header-content-layout'
import type { ColumnDef, EntitySchema, ShellRow } from 'header-content-layout'
import { getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import type { BrickLinkItem } from '../stores/bricklink/catalog-download-page'
import { catalogSchema, counted, narrowTo, narrowToColor, narrowingTo } from './catalogSchema'
import { catalogSource, sorted, storedRows } from './catalogSource'
import { forgetReach, matching, reachFor, reaches } from './reach'
import { awaitedStores } from './homeFill'
import { openingOrderFor } from './openingOrder'

/** One record, as a card shows it: a picture of it, or its name. */
export interface PreviewTile {
  /** The record's id — unique within a card, and the key the list is drawn by. */
  key: string
  /** What the record is called. The hover on a picture, the pill where not. */
  label: string
  /** The number the record leads with, formatted; empty where there is none. */
  detail: string
  /** The record's picture, where it has one. */
  image?: string
  /** Where the record leads — the press its own row makes. */
  press?: () => void
}

/**
 * A card's look inside, which is one of two things: the records as pictures
 * where they have them, and as their names where they do not. Nothing is
 * written over a picture — what a record is called is on the hover, which is
 * where a wall of small pictures can say it without burying itself.
 */
export interface Preview {
  kind: 'pictures' | 'pills'
  tiles: PreviewTile[]
  /**
   * How many records of the type the query matched.
   *
   * The card's own number, and only where the read saw the whole type to be
   * able to say it: absent under an untouched query, where the population the
   * schema publishes is the answer already, and absent for a type nothing can
   * list — the part and colour codes, which are a count and no rows at all.
   */
  count?: number
  /**
   * Whether that count is a projection rather than a tally.
   *
   * Set only by the types [homeFill] is still fetching, and written with a `~`
   * in front of it wherever it is shown. A card under `region:"Americas"` is
   * the case this exists for: two of that region's countries are in the
   * directory, neither has been fetched, and the sellers in them are a number
   * BrickLink has already stated — so the card can say roughly how many there
   * are long before it can list one.
   */
  estimated?: boolean
  /**
   * Whether the whole of what the type matched is the one record the query
   * already names — see {@link pinnedBy}. The card is left off the wall.
   */
  pinned?: boolean
}

/**
 * How much of a type a card shows. The pictures are two whole rows of the five
 * the stylesheet lays them out in, so that a card ends on a full row rather
 * than with a hole in the corner of it.
 *
 * A pill is a line to itself, so its number is a card's height rather than its
 * width: four of them stands beside two rows of pictures, where a dozen made
 * the categories card three times the height of everything on the wall beside
 * it. A card is a look inside a type, and the type's own table is one press
 * away for anyone who wants the rest.
 */
const PICTURES_SHOWN = 10
const PILLS_SHOWN = 4

/**
 * Brick 2 x 2 — the piece a colour is worth seeing, and the one BrickLink has
 * a picture of in more colours than any other.
 */
const COLOUR_BRICK = '3003'

/**
 * That brick moulded in one colour.
 *
 * BrickLink's own colour id, not brickzuke's: this is BrickLink being asked
 * for a picture, and its colour 2 is Tan where brickzuke's is Aqua. `PT` is
 * the thumbnail of a part in a colour, which is what the item page already
 * addresses pictures by.
 */
function brickIn(colorId: number): string {
  return `https://img.bricklink.com/ItemImage/PT/${colorId}/${COLOUR_BRICK}.t1.png`
}

/** What a card is drawn from: the head of the type, and the whole match. */
interface Read {
  rows: ShellRow[]
  /** As {@link Preview.count} — absent where the read cannot say. */
  count?: number
  /**
   * How many stored records matched, said whether or not it is worth
   * publishing — the projection adds what has not been fetched to this, and
   * needs the number even where a card on its own would keep quiet about it.
   */
  matched: number
  /**
   * Whether the count is still a floor rather than a tally.
   *
   * A joined answer is read from the fact table brickzuke holds, which is a
   * fraction of the one BrickLink has — so what the lots reach is what is known
   * and not what is so, and the card says `~` over it. See [reach].
   *
   * Unless the floor has met the ceiling. The join only ever takes rows out of
   * what the type's own terms match, and more lots only ever reach more, so a
   * joined count climbs towards that number and stops there. Reach it and the
   * `~` is promising a rise that cannot happen: the conditions card sat at `~2`
   * with both conditions drawn on it, the item types at `~9` with the whole
   * vocabulary listed. There is nothing left for another seller's lots to add,
   * so the number is said plainly.
   */
  floor: boolean
}

/**
 * Whether a card would say nothing but what the query already says.
 *
 * Under `region:"Europe" country:"DE"` the countries card is one flag and the
 * regions card is one name, and both are the terms in the header, drawn again
 * a little lower down. A card is a look inside a type, and a type the reader
 * has already picked the one record of has nothing left inside it to look at.
 *
 * Both halves are needed. One match is not enough on its own — `name:"Belgium"`
 * also leaves one country, and that country is the answer to the question
 * rather than a restatement of it — so what is asked here is whether the record
 * is the one the query named: its own term, the one a press on it would add,
 * already in the expression. `addTerm` is what decides that, and it is the same
 * `addTerm` the press goes through, so the two agree about `category:5` and
 * `category:"5"` being one term.
 */
function pinnedBy(expr: string, rows: ShellRow[], count: number | undefined): boolean {
  if (count !== 1 || rows.length !== 1) {
    return false
  }
  const term = scopeTermFor(catalogSchema.value, rows[0])
  const written = expr.trim()
  return Boolean(term) && Boolean(written) && addTerm(written, term) === written
}

/**
 * The head of a type's table, in the order that table opens in and under the
 * query in force — so a card is the top of the list it leads to rather than a
 * sample of it.
 *
 * `keep` is applied before the head is taken, so a record a card has no place
 * for costs the card nothing rather than one of its places. It does not touch
 * the count: what a card has no room to draw is still a record of the type,
 * and the number has to be the one its table would report.
 */
async function opening(
  entity: string,
  shown: number,
  expr: string,
  keep: (row: ShellRow) => boolean = () => true
): Promise<Read> {
  const held = storedRows(entity, expr)
  if (!held) {
    return {
      rows: [],
      matched: 0,
      floor: false
    }
  }
  const all = await held
  /*
   * The two filters a card is read through, and they answer different halves of
   * the query. `matching` is the type asked on its own terms — `year>=1988` of a
   * year, `name:` of a country. The reach is the rest: the terms this type
   * carries no field for, resolved through the lots that do. Without it those
   * terms matched every row, and the years card sat at eighty-one under a query
   * that had narrowed everything beside it.
   */
  const reach = await reachFor(entity, expr, all)
  const match = matching(entity, expr)
  // Kept apart, because the first of the two is also the ceiling the second is
  // climbing towards — and reaching it is what retires the `~`. See
  // {@link Read.floor}.
  const own = all.filter(match)
  const matched = own.filter((row) => reaches(reach, row))
  const order = openingOrderFor(entity)
  return {
    rows: sorted(matched.filter(keep), order.sort, order.dir).slice(0, shown),
    // An untouched query leaves the count to the schema, which has counted the
    // catalogue already and did not have to read it to do so.
    //
    // So does a read that came back with nothing at all, and that is the
    // distinction the whole number turns on: `storedRows` answers a card
    // without fetching, so a type nobody has opened yet reads as no rows —
    // the years before their pass has run, a seller's lots before one is
    // asked for. None of that is "the query matched none of them", and
    // reporting it as such put `Years 0` over a catalogue covering eighty-one
    // of them. Nought is only ever said about records brickzuke has actually
    // read.
    count: expr.trim() && all.length ? matched.length : undefined,
    matched: matched.length,
    floor: Boolean(reach.values) && matched.length < own.length
  }
}

/**
 * BrickLink's colour 0, which is not a colour.
 *
 * It is what the catalogue says about an item that has none — it lists as
 * "(Not Applicable)" — and being the answer for every colourless item it
 * carries a parts count that puts it near the front of a list ordered by one.
 * There is no brick moulded in it either, so on a wall of colours it was a
 * missing picture standing in for a colour that does not exist.
 */
const NO_COLOUR = 0

/**
 * Colours, as bricks. The picture is the whole of what a colour is, and the
 * name is on the hover where a name is worth reading.
 *
 * Pressing one narrows the wall to that colour, as every other tile does — see
 * [pressFor]. What it used to make was its Parts column's press, the parts
 * catalogued in that colour, and that is still the fallback: a colour BrickLink
 * has an id for is a record every other type can name, so in practice the
 * narrowing is what happens.
 */
async function colorTiles(shown: number, expr: string): Promise<Preview> {
  const read = await opening(
    'colors',
    shown,
    expr,
    (row) => Number(row.fields.colorid) !== NO_COLOUR
  )
  return {
    kind: 'pictures',
    count: read.count,
    estimated: read.floor || undefined,
    pinned: pinnedBy(expr, read.rows, read.count),
    tiles: read.rows.flatMap((row) => {
      const colorId = Number(row.fields.colorid)
      // A colour BrickLink has no id for is a colour it has no picture of.
      if (!Number.isFinite(colorId)) {
        return []
      }
      return [
        {
          key: row.id,
          label: String(row.fields.name ?? ''),
          detail: counted(row.fields.items),
          image: brickIn(colorId),
          press: narrowingTo(row) ?? (() => narrowToColor('P', row))
        }
      ]
    })
  }
}

/**
 * One item, as a tile: the same four things `itemTiles` reads off the records
 * themselves, off a row the source has already flattened them into.
 */
function itemTile(row: ShellRow): PreviewTile {
  return {
    key: row.id,
    label: String(row.fields.name ?? ''),
    detail: String(row.fields.record ?? ''),
    image: String(row.fields.image ?? '') || undefined,
    press: () => narrowTo('itemRecords', 'item', row.id)
  }
}

/**
 * The items a query reaches through the lots, where it reaches them at all.
 *
 * The items card is the one that cannot go through [opening] — it is a scan
 * rather than a list of stored rows, so the join has to be applied here instead
 * of around it. Without this the card sat at the whole catalogue under a term no
 * item carries: `region:"Europe"` matched all two hundred thousand of them while
 * every card beside it had narrowed.
 *
 * It is also the cheaper answer by a wide margin. The scan below reads the whole
 * catalogue to count what matches; the reach is bounded by the distinct records
 * in the lots the query left standing, and the tiles are that many point
 * lookups. So this runs first, and the scan is what happens when there is no
 * join to do — a term the items table *can* answer, like a year or a name.
 *
 * Undefined where the query needs no join, which is the caller's signal to scan.
 */
async function reachedItems(shown: number, expr: string): Promise<Preview | undefined> {
  // No rows to read a vocabulary off — the items card is a scan rather than a
  // list — so the join reads the schema instead. See [vocabularyOf].
  const reach = await reachFor('items', expr, [])
  if (!reach.values) {
    return undefined
  }
  const wanted = [...reach.values]
  const db = await getDbConnection()
  try {
    const rows: ShellRow[] = []
    for (const id of wanted.slice(0, shown)) {
      const records =
        (await getAllFromIndex<BrickLinkItem>(
          db,
          indices.BRICK_LINK_ITEMS_BY_ITEM_ID,
          Number(id)
        )) ?? []
      if (!records.length) {
        continue
      }
      rows.push({
        id: String(id),
        entityKey: 'items',
        entityLabel: 'Items',
        fields: {
          id: String(id),
          name: records[0].Name,
          record: records[0].id,
          image: records.find((record) => record.image)?.image
        }
      })
    }
    return {
      kind: 'pictures',
      count: reach.values.size,
      // A floor like every other joined card: more lots reach more items.
      estimated: true,
      tiles: rows.map(itemTile)
    }
  } finally {
    db.close()
  }
}

/**
 * The items a narrowed query matches, and how many there are.
 *
 * The one read here that is a pass over the catalogue, and the only honest
 * answer available: nothing counts a filtered items table but the filter, and
 * no index answers `year:"1958"`. It is the same scan the table itself makes
 * and the same one the shell is already making beside this card — an
 * expression on the home screen puts a count against `Everything`, and that
 * count is this pass — so it is a scan the screen was paying for either way,
 * and `previewFor` holds the result per expression so it is paid once.
 *
 * Un-narrowed there is nothing to scan for: see [itemTiles], which is what
 * every other visit to the home screen runs.
 */
async function narrowedItems(shown: number, expr: string): Promise<Preview> {
  const schema = catalogSchema.value
  const entity = schema.entities.find((one) => one.key === 'items')
  if (!entity) {
    return {
      kind: 'pictures',
      tiles: []
    }
  }
  const order = openingOrderFor('items')
  const result = await catalogSource.query({
    query: {
      entity: 'items',
      view: 'table',
      sort: order.sort,
      dir: order.dir,
      expr,
      facets: {},
      page: 1
    },
    schema,
    entity,
    limit: shown,
    offset: 0
  })
  return {
    kind: 'pictures',
    count: result.total,
    pinned: pinnedBy(expr, result.rows, result.total),
    tiles: result.rows.map(itemTile)
  }
}

/**
 * A few items, with their pictures.
 *
 * Not the head of the items table: that opens by name, and putting a name
 * order on two hundred thousand items is the scan the table itself pays for
 * and the home screen must not. This is the first few the index hands back —
 * a look inside rather than a first page — and pressing one opens that item's
 * records, which is what pressing its picture in the table does.
 */
async function itemTiles(shown: number, expr: string): Promise<Preview> {
  if (expr.trim()) {
    const reached = await reachedItems(shown, expr)
    return reached ?? (await narrowedItems(shown, expr))
  }
  const db = await getDbConnection()
  try {
    // Every BrickLink record of an item is a record of its own here and they
    // are adjacent in this index, so more are read than are shown.
    const records =
      (await getAllFromIndex<BrickLinkItem>(
        db,
        indices.BRICK_LINK_ITEMS_BY_ITEM_ID,
        null,
        shown * 4
      )) ?? []
    const items = new Map<number, BrickLinkItem[]>()
    for (const record of records) {
      const id = record.bzItemId
      if (id === undefined) {
        continue
      }
      const group = items.get(id)
      if (group) {
        group.push(record)
      } else if (items.size < shown) {
        items.set(id, [record])
      }
    }
    return {
      kind: 'pictures',
      tiles: [...items].map(([id, group]) => ({
        key: String(id),
        label: group[0].Name,
        // The record id an item states after its name in the table — `P-3001`
        // — which is the one thing about an item shorter than its name.
        detail: String(group[0].id ?? ''),
        image: group.find((record) => record.image)?.image,
        press: () => narrowTo('itemRecords', 'item', String(id))
      }))
    }
  } finally {
    // An open connection blocks the next version change, and IndexedDB does not
    // time out waiting for one.
    db.close()
  }
}

/**
 * The columns a card reads a record through, which is not every column the
 * table has.
 *
 * The ordinal is a position in a list this is not, and a column with no label
 * is a picture — that being the one thing brickzuke's tables leave unlabelled,
 * a column of pictures saying what it is. The identity goes first whatever
 * order the table draws it in: a store directory that leads with the country
 * has not said who anyone is.
 */
function shownColumns(entity: EntitySchema | undefined): ColumnDef[] {
  const columns = (entity?.columns ?? []).filter(
    (column) => column.kind !== 'ordinal' && column.label
  )
  const identity = roleColumn(columns, 'identity')
  return identity ? [identity, ...columns.filter((column) => column !== identity)] : columns
}

/**
 * Where a record leads, which is wherever its own row leads.
 *
 * Which is now the record itself: appfr 0.21.0 made a press on a row narrow the
 * screen to it rather than open anything, so a tile — a row drawn brickzuke's
 * own way — narrows too, and the home screen stays the home screen with one
 * more term over it. Pressing `Europe` had been a trip to the countries table,
 * which is the one card on this wall the reader could already see.
 *
 * The old rule is the fallback, for the types nothing carries the id of: the
 * press on the identity column, and failing that the first press the row offers
 * at all.
 */
function pressFor(columns: ColumnDef[], row: ShellRow): (() => void) | undefined {
  const narrow = narrowingTo(row)
  if (narrow) {
    return narrow
  }
  const click = roleColumn(columns, 'identity')?.click ?? columns.find((one) => one.click)?.click
  return click ? () => click(row) : undefined
}

/**
 * A record: what it is called, the first number said about it, and the picture
 * it carries where it has one.
 */
function tileFor(row: ShellRow, columns: ColumnDef[]): PreviewTile {
  const identity = roleColumn(columns, 'identity') ?? columns[0]
  const number = columns.find(
    (column) => column !== identity && typeof cellValue(column, row) === 'number'
  )
  return {
    key: row.id,
    label: identity ? cellText(identity, row) : row.id,
    detail: number ? cellText(number, row) : '',
    image: String(row.fields.image ?? '') || undefined,
    press: pressFor(columns, row)
  }
}

/**
 * The types whose picture is the record rather than a picture of it.
 *
 * A flag is a country the way a brick moulded in a colour is that colour:
 * there is nothing to say about it that the picture does not already say, and
 * a name and a number over every one would bury a wall of them. Everything
 * else is a picture of something, and the something has a name worth reading.
 */
/**
 * Every other type, off the rows it already holds.
 *
 * Which of the two a card is follows from the records rather than from a list
 * kept here: a type whose rows carry pictures is shown as pictures, and one
 * whose rows do not is shown as its records' names, each with whatever number
 * the type counts them by.
 *
 * Read whichever of the two is the more — which of them a card is is not known
 * until the rows are in hand — and cut back to the dozen a card of names has
 * room for.
 */
async function fromRows(entityKey: string, expr: string): Promise<Preview> {
  return asPreview(entityKey, await opening(entityKey, ROWS_READ, expr), expr)
}

/** As many rows as either look could want, which of the two not yet being known. */
const ROWS_READ = Math.max(PICTURES_SHOWN, PILLS_SHOWN)

/** The rows read, as the card drawn from them. */
function asPreview(entityKey: string, read: Read, expr: string): Preview {
  const columns = shownColumns(
    catalogSchema.value.entities.find((entity) => entity.key === entityKey)
  )
  const pictures = read.rows.some((row) => row.fields.image)
  const shown = read.rows.slice(0, pictures ? PICTURES_SHOWN : PILLS_SHOWN)
  return {
    kind: pictures ? 'pictures' : 'pills',
    count: read.count,
    // A joined count is what the stored lots reach, and more lots reach more —
    // so it is written as the projection it is, in the same `~` the store fill
    // uses for the same admission. Until it reaches everything the type's own
    // terms match, at which point there is no more to reach and it is a tally.
    estimated: read.floor || undefined,
    pinned: pinnedBy(expr, read.rows, read.count),
    tiles: shown.map((row) => tileFor(row, columns))
  }
}

/**
 * The two fields a country can answer, and so the two a projection can survive.
 *
 * `region:` and `country:` narrow the sellers by narrowing the countries they
 * are in, which is exactly what the directory is a list of — so the sellers
 * waiting in the countries the query names can be added up without fetching
 * one of them. Any other term is about the sellers themselves: `Instant`, a
 * province, a name. The directory says nothing about those, so a projection
 * over them would be the whole world's sellers offered as an answer to a
 * question that will match three, and the card keeps to what it has read.
 */
const COUNTRY_TERMS = ['region', 'country']

function onlyCountryTerms(expr: string): boolean {
  return parseExpression(expr).every((group) =>
    group.every((term) => term.kind === 'field' && COUNTRY_TERMS.includes(term.field))
  )
}

/**
 * The sellers: the ones stored, and how many more the directory is still
 * holding.
 *
 * The one card whose number is worth stating before the records behind it
 * exist. Sellers arrive a country at a time and there are two hundred
 * countries — see [homeFill] — so for most of a fill this card is a handful of
 * real rows over a total nobody has reached yet, and the total is the thing
 * being asked for.
 */
async function storeTiles(shown: number, expr: string): Promise<Preview> {
  const read = await opening('stores', shown, expr)
  const preview = asPreview('stores', read, expr)
  if (!onlyCountryTerms(expr)) {
    return preview
  }
  const held = storedRows('countries', expr)
  const countries = held ? (await held).filter(matching('countries', expr)) : []
  const waiting = awaitedStores(
    countries.map((row) => ({
      code: String(row.fields.country ?? ''),
      stores: Number(row.fields.stores)
    }))
  )
  if (!waiting) {
    return preview
  }
  return {
    ...preview,
    count: read.matched + waiting,
    estimated: true,
    // The projection is what the card is headed with now, and it is more than
    // one: whatever the stored rows came to, there are sellers in the
    // countries the query names that nobody has fetched yet.
    pinned: false
  }
}

/**
 * The two types whose pictures are not on their rows.
 *
 * A colour has no picture stored at all, so it is addressed rather than read;
 * and the items table is a scan, which a card makes only when a query has
 * asked something no index answers. Everything else falls to `fromRows`,
 * categories included — a category has no picture of its own, and the one
 * borrowed off a part in it said less about the category than its name does.
 */
const specs: Record<
  string,
  { shown: number; read: (shown: number, expr: string) => Promise<Preview> }
> = {
  colors: {
    shown: PICTURES_SHOWN,
    read: colorTiles
  },
  items: {
    shown: PICTURES_SHOWN,
    read: itemTiles
  },
  stores: {
    shown: ROWS_READ,
    read: storeTiles
  }
}

/**
 * One card's preview, read once and held — the home screen is drawn every time
 * someone comes back out of a table, and the catalogue behind it only changes
 * when an update run rewrites it.
 *
 * Held per query as well as per type, a card being an answer to both: coming
 * back out of a table to the same expression redraws what was already read,
 * and lifting a term reads the wider answer once.
 */
const cache = new Map<string, Promise<Preview>>()

/** A newline, which no expression the URL can carry contains. */
function cacheKey(entity: string, expr: string): string {
  return entity + '\n' + expr
}

export function previewFor(entity: string, expr = ''): Promise<Preview> {
  const key = cacheKey(entity, expr)
  let held = cache.get(key)
  if (!held) {
    const spec = specs[entity]
    held = (spec ? spec.read(spec.shown, expr) : fromRows(entity, expr))
      .then((preview) => {
        // A card with nothing in it is not an answer worth keeping. The
        // browse-filled types are written while someone is looking around, and
        // the years are counted by a pass that may still have been running
        // when this read them — both are empty now and something later.
        //
        // A count is an answer even so: a query that matched none of a type
        // brickzuke has read is a nought worth stating, and unlike an empty
        // read it does not go stale on the next thing fetched.
        if (!preview.tiles.length && preview.count === undefined) {
          cache.delete(key)
        }
        return preview
      })
      .catch((thrown) => {
        // A failed read must not be the answer forever either.
        cache.delete(key)
        throw thrown
      })
    cache.set(key, held)
  }
  return held
}

/** Drops the held previews, for when an update run has rewritten the catalogue. */
export function forgetPreviews() {
  cache.clear()
  // And the walks under them: a preview read again against a stale join would
  // be a fresh card drawn from a stale answer.
  forgetReach()
}

/**
 * Drops one type's, for when a background fill has just added to it.
 *
 * One type rather than all of them: a country landing changes the sellers and
 * nothing else, and clearing the wall would have every other card re-read
 * itself two hundred times over on the way to the same answer.
 */
export function forgetPreview(entity: string) {
  const prefix = entity + '\n'
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}
