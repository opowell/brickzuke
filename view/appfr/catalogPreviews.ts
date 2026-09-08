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
 * types are already in memory, and the two sets of pictures that are not — a
 * category's and an item's — are indexed reads with a count on them, never a
 * pass over the catalogue. Narrowed, the items card is the one exception, and
 * says why at [narrowedItems].
 */
import { cellText, cellValue, matchesExpression, parseExpression, roleColumn } from 'header-content-layout'
import type { ColumnDef, EntitySchema, ShellRow } from 'header-content-layout'
import { getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import type { BrickLinkItem } from '../stores/bricklink/catalog-download-page'
import { catalogSchema, counted, narrowTo, narrowToColor } from './catalogSchema'
import { catalogSource, sorted, storedRows } from './catalogSource'
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
}

/**
 * How much of a type a card shows. The pictures are three whole rows of the
 * eight the stylesheet lays them out in, so that a card ends on a full row
 * rather than with a hole in the corner of it; a pill is wider than a picture
 * and wraps, so it is simply a dozen.
 */
const PICTURES_SHOWN = 24
const PILLS_SHOWN = 12

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
}

/**
 * The query as a test one row at a time, against the type it is being asked
 * about.
 *
 * The same `matchesExpression` the source filters a table with, and read
 * against that type's own schema — so a term resolves through the fields and
 * columns the type actually has. A field none of them carries is ignored
 * rather than failed, which is this language's rule everywhere: `region:` on
 * the years card narrows nothing, because a year is in no region.
 *
 * No addresses are lifted out of it, unlike the table's own matcher. An
 * address is the term that *fetched* the rows, and nothing here fetches — a
 * card reads what is stored, so every term in the query is a filter over it.
 */
function matching(entityKey: string, expr: string): (row: ShellRow) => boolean {
  const entity = catalogSchema.value.entities.find((one) => one.key === entityKey)
  if (!expr.trim() || !entity) {
    return () => true
  }
  const parsed = parseExpression(expr)
  return (row) => matchesExpression(parsed, row, entity)
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
  const held = storedRows(entity)
  if (!held) {
    return {
      rows: []
    }
  }
  const matched = (await held).filter(matching(entity, expr))
  const order = openingOrderFor(entity)
  return {
    rows: sorted(matched.filter(keep), order.sort, order.dir).slice(0, shown),
    // An untouched query leaves the count to the schema, which has counted the
    // catalogue already and did not have to read it to do so.
    count: expr.trim() ? matched.length : undefined
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
 * Pressing one is the press its Parts column makes — the parts catalogued in
 * that colour — because a picture of a brick in a colour is a picture of
 * exactly those.
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
          press: () => narrowToColor('P', row)
        }
      ]
    })
  }
}

/**
 * Categories, as a part from the category. The name and the count are the
 * hover, and the press is the one the table's own name and count make, which
 * is to those items.
 */
async function categoryTiles(shown: number, expr: string): Promise<Preview> {
  const read = await opening('categories', shown, expr)
  const images = await categoryImages(read.rows)
  return {
    kind: 'pictures',
    count: read.count,
    tiles: read.rows.map((row) => ({
      key: row.id,
      label: String(row.fields.name ?? ''),
      detail: counted(row.fields.items),
      image: images.get(row.id),
      press: () => narrowTo('items', 'category', String(row.fields.category ?? ''))
    }))
  }
}

/**
 * One picture per category, read with a count of one.
 *
 * The index is by BrickLink's category id, which is what a category row
 * carries in `category` and holds as a number — the key is stored as the text
 * the download states it in, so it is asked for as text.
 *
 * Whichever item the index hands back first: a card is showing what is in the
 * category, not making a case for a particular part.
 */
async function categoryImages(rows: readonly ShellRow[]): Promise<Map<string, string>> {
  const images = new Map<string, string>()
  const db = await getDbConnection()
  try {
    for (const row of rows) {
      const category = row.fields.category
      if (category === undefined || category === null) {
        continue
      }
      const found =
        (await getAllFromIndex<BrickLinkItem>(
          db,
          indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID,
          String(category),
          1
        )) ?? []
      const image = found[0]?.image
      if (image) {
        images.set(row.id, image)
      }
    }
  } finally {
    db.close()
  }
  return images
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
    return await narrowedItems(shown, expr)
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
 * Where a record leads, which is wherever its own row leads: the press on the
 * identity column, and failing that the first press the row offers at all.
 */
function pressFor(columns: ColumnDef[], row: ShellRow): (() => void) | undefined {
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
 * Read as pictures either way — a wall of them is the more of a type — and cut
 * back to the dozen a card of names has room for.
 */
async function fromRows(entityKey: string, expr: string): Promise<Preview> {
  const read = await opening(entityKey, PICTURES_SHOWN, expr)
  const columns = shownColumns(
    catalogSchema.value.entities.find((entity) => entity.key === entityKey)
  )
  const pictures = read.rows.some((row) => row.fields.image)
  const shown = pictures ? read.rows : read.rows.slice(0, PILLS_SHOWN)
  return {
    kind: pictures ? 'pictures' : 'pills',
    count: read.count,
    tiles: shown.map((row) => tileFor(row, columns))
  }
}

/**
 * The three types whose pictures are not on their rows.
 *
 * A colour has no picture stored at all and a category has no picture of its
 * own, so both are addressed rather than read; and the items table is a scan,
 * which a card makes only when a query has asked something no index answers.
 * Everything else falls to `fromRows`.
 */
const specs: Record<
  string,
  { shown: number; read: (shown: number, expr: string) => Promise<Preview> }
> = {
  categories: {
    shown: PICTURES_SHOWN,
    read: categoryTiles
  },
  colors: {
    shown: PICTURES_SHOWN,
    read: colorTiles
  },
  items: {
    shown: PICTURES_SHOWN,
    read: itemTiles
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
}
