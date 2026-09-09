/**
 * What a query reaches, type by type — the join that gives a card its bite.
 *
 * A term the reader writes is about one type and the wall is about fourteen.
 * `region:"Europe"` is a question a country can answer and a year cannot, and
 * appfr's rule for a field a row does not carry is that it matches: an
 * unresolvable field is *true*, so the years card went on showing all eighty-one
 * of them under a query that had narrowed everything around it. True of the
 * language and useless on a wall, because the reader did not mean "every year";
 * they meant "the years you can get from here".
 *
 * A lot is what makes that answerable. One row of the store inventories carries
 * the seller, the seller's country, the part of the world it is in, the
 * condition, the colour, the item type and the item itself — so a lot is a fact
 * joining every dimension the wall draws a card of, and a query over the lots is
 * a query over all of them at once. Filter the lots by the terms a type cannot
 * answer for itself, read the dimension off what survives, and that is the set:
 * the years a European seller has something from, the colours they stock, the
 * categories they carry.
 *
 * Two of those need the item behind the lot rather than the lot — a lot states
 * which item it is of and never what year it came out — so the records are
 * looked up once per read and the year, the category and the item id come off
 * them together.
 *
 * What this is *not* is the whole truth, and the `~` on a joined card is that
 * admission. The answer is read from the lots brickzuke holds, which is a
 * fraction of the lots there are: a year no stored lot reaches may still be
 * reachable through a seller nobody has fetched. So a joined count is a floor
 * rather than a tally — {@link Reach.lots} is how much of the fact table it was
 * read from — and it is written in the same `~` the store fill uses for a
 * projection, the two standing in the same place on the same wall.
 */
import { formatExpression, matchesExpression, parseExpression } from 'header-content-layout'
import type { EntitySchema, ShellRow } from 'header-content-layout'
import type { Term } from 'header-content-layout'
import { get } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import STORES from '../../idb/stores'
import type { BrickLinkItem } from '../stores/bricklink/catalog-download-page'
import { catalogSchema } from './catalogSchema'
import { eachLot } from './catalogSource'

/**
 * A lot's own vocabulary and nothing else.
 *
 * The same empty schema `lotsMatching` uses in the source, and for the same
 * reason: these are lots being tested, not the rows of any table, so a term
 * resolves against `fields` and no column or facet gets a say.
 */
const LOT_FIELDS = {
  facets: [],
  columns: []
} as unknown as EntitySchema

/**
 * Where a type's records are named in a lot.
 *
 * `field` is what the type's own rows carry the value in — the field a term
 * about that type compares against — and `of` reads the same value off a lot.
 * Both sides are stringified before they are compared: a colour id is a number
 * on both rows and a country code is a string on both, but nothing here should
 * depend on that holding for the next type somebody adds.
 */
interface Through {
  field: string
  of(lot: ShellRow, item: ItemFacts | undefined): unknown
}

/** The three things a lot's item says that the lot itself does not. */
interface ItemFacts {
  id: string
  category: unknown
  year: unknown
}

/**
 * Every type a lot can speak for, and how.
 *
 * The first six are on the lot itself. The last three are on the item behind
 * it: a lot names its record — `P-3001` — and the catalogue says what year that
 * came out, what category it is in and which item it is one record of.
 *
 * A type not in here is a type no lot mentions, and it is left alone: the part
 * and colour codes, the pictures, an item's own records. A card of those under
 * a term they cannot answer goes on saying what it said before, which is the
 * language's own rule and the right one where there is no join to do instead.
 */
const THROUGH: Record<string, Through> = {
  regions: {
    field: 'region',
    of: (lot) => lot.fields.region
  },
  countries: {
    field: 'country',
    of: (lot) => lot.fields.country
  },
  stores: {
    field: 'store',
    of: (lot) => lot.fields.store
  },
  conditions: {
    field: 'condition',
    of: (lot) => lot.fields.condition
  },
  colors: {
    field: 'colorid',
    of: (lot) => lot.fields.colorid
  },
  itemTypes: {
    field: 'type',
    of: (lot) => lot.fields.type
  },
  items: {
    field: 'id',
    of: (_lot, item) => item?.id
  },
  categories: {
    field: 'category',
    of: (_lot, item) => item?.category
  },
  years: {
    field: 'year',
    of: (_lot, item) => item?.year
  }
}

/**
 * The types a lot can speak for, by key — what a fill deepening the fact table
 * has to re-read when a page of lots lands.
 */
export const JOINED: readonly string[] = Object.keys(THROUGH)

/** Whether reading this type needs the item behind each lot as well as the lot. */
function needsItems(entityKey: string): boolean {
  return ['items', 'categories', 'years'].includes(entityKey)
}

/** One value as the two sides compare it — a colour id being a number here and there. */
function same(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * The query as a test one row at a time, against the type it is being asked
 * about — the half of a card's filter the type can answer on its own.
 *
 * The same `matchesExpression` the source filters a table with, and read
 * against that type's own schema — so a term resolves through the fields and
 * columns the type actually has. A field none of them carries is ignored
 * rather than failed, which is this language's rule everywhere; the join
 * beside this is what stops that rule from being the whole answer.
 *
 * No addresses are lifted out of it, unlike the table's own matcher. An
 * address is the term that *fetched* the rows, and nothing here fetches — a
 * card reads what is stored, so every term in the query is a filter over it.
 */
export function matching(entityKey: string, expr: string): (row: ShellRow) => boolean {
  const entity = catalogSchema.value.entities.find((one) => one.key === entityKey)
  if (!expr.trim() || !entity) {
    return () => true
  }
  const parsed = parseExpression(expr)
  return (row) => matchesExpression(parsed, row, entity)
}

/**
 * What this type can be asked about.
 *
 * Read off its own records wherever there are any: a field some row carries is a
 * field the type can answer, and one no row carries is the field appfr would
 * have matched every row on — which is exactly the case the join exists for, so
 * it is exactly the test.
 *
 * The schema is the fallback, and the items card is why. That one is a scan
 * rather than a list of stored rows, so there is no record to read a vocabulary
 * off; what a column names is the next best statement of what the type answers,
 * with its `scope` and its id added because a type is addressable by those
 * whether or not it draws them.
 */
function vocabularyOf(entityKey: string, rows: readonly ShellRow[]): Set<string> {
  const carried = new Set<string>()
  for (const row of rows) {
    for (const field of Object.keys(row.fields)) {
      carried.add(field.toLowerCase())
    }
  }
  if (carried.size) {
    return carried
  }
  const entity = catalogSchema.value.entities.find((one) => one.key === entityKey)
  for (const column of entity?.columns ?? []) {
    if (column.key) {
      carried.add(column.key.toLowerCase())
    }
  }
  if (entity?.scope) {
    carried.add(entity.scope.toLowerCase())
  }
  carried.add('id')
  return carried
}

/**
 * The terms this type cannot answer for itself, which are the ones worth
 * joining through the lots.
 */
function foreignTerms(entityKey: string, rows: readonly ShellRow[], expr: string): Term[][] {
  const carried = vocabularyOf(entityKey, rows)
  return parseExpression(expr).map((group) =>
    group.filter((term) => term.kind === 'field' && !carried.has(term.field.toLowerCase()))
  )
}

/**
 * The catalogue records behind a set of lots, as the three facts a card needs.
 *
 * One point lookup per distinct record, in one connection: a lot names its
 * record by the key `brickLinkItems` is stored under, so this is a get rather
 * than a scan however many items the catalogue holds. The distinct records in a
 * page of lots are far fewer than the lots — a seller stocks the same part in
 * nine colours — so the map is built over the set rather than the list.
 */
async function itemsBehind(records: ReadonlySet<string>): Promise<Map<string, ItemFacts>> {
  const facts = new Map<string, ItemFacts>()
  if (!records.size) {
    return facts
  }
  const db = await getDbConnection()
  try {
    for (const record of records) {
      const item = await get<BrickLinkItem>(db, STORES.BRICK_LINK_ITEMS, record)
      if (!item) {
        continue
      }
      // `Year Released` is on the stored record and not on the interface — the
      // same gap `toRow` reads through in the source.
      const raw = item as unknown as Record<string, string>
      facts.set(record, {
        id: String((item as unknown as Record<string, unknown>).bzItemId ?? ''),
        category: raw['Category ID'],
        year: raw['Year Released']
      })
    }
  } finally {
    db.close()
  }
  return facts
}

/** What a query reaches of one type. */
export interface Reach {
  /**
   * The values of {@link Through.field} the query can reach, or undefined where
   * it constrains this type not at all — which is a different answer from an
   * empty set, that being "nothing".
   */
  values?: Set<string>
  /** The field those values are compared against on this type's own rows. */
  field?: string
  /** How many lots the answer was read from. Nought is "nothing is known yet". */
  lots: number
}

/** Nothing to join: the type answers the query on its own terms. */
const UNCONSTRAINED: Reach = {
  lots: 0
}

/**
 * What the query reaches of one type, read through the lots brickzuke holds.
 *
 * `rows` are that type's own stored records, which say what the type can be
 * asked about — see [foreignTerms]. The answer is a set of values rather than a
 * filtered list of rows so that the caller can use it for the count as well as
 * for the tiles, those being read at different depths.
 */
/** The types a lot answers for itself, and the ones that need the item behind it. */
const LOT_DIRECT = JOINED.filter((key) => !needsItems(key))
const ITEM_DERIVED = JOINED.filter((key) => needsItems(key))

/**
 * One walk of the fact table, answering every type that asks the same question
 * of it.
 *
 * The filter differs by type — what `years` cannot answer is not what
 * `countries` cannot answer — but the *values* do not: a lot that survives a
 * filter says which colour, condition, type and item it is, all at once. So a
 * pass is keyed by the filter and holds the answer for every type sharing it,
 * and the nine walks the wall used to make come down to the one or two distinct
 * filters its cards actually have between them.
 */
interface Pass {
  /** How many lots were walked. Nought is "nothing is known yet". */
  lots: number
  /** The values reached, by type, for the types a lot speaks for directly. */
  direct: Map<string, Set<string>>
  /** The records the surviving lots named, for the three types that need them. */
  records: Set<string>
  /** Those three resolved, once, and only if anybody asks. */
  items?: Promise<Map<string, Set<string>>>
}

/**
 * The passes in flight or done, by the query and the filter they answer.
 *
 * Held because the wall reads its cards one type at a time and they all ask
 * within a few milliseconds of each other — without this the second card pays
 * for the walk the first one just made. Dropped when the fact table grows, which
 * is [forgetReach]'s job.
 */
const passes = new Map<string, Promise<Pass>>()

/** Drops them, for when a fill has added lots and the answers are short. */
export function forgetReach(): void {
  passes.clear()
}

/** One walk, filtered, collecting every dimension it can as it goes. */
async function runPass(foreign: Term[][]): Promise<Pass> {
  const direct = new Map(LOT_DIRECT.map((key) => [key, new Set<string>()]))
  const records = new Set<string>()
  const lots = await eachLot((lot) => {
    if (!matchesExpression(foreign, lot, LOT_FIELDS)) {
      return
    }
    for (const key of LOT_DIRECT) {
      const value = same(THROUGH[key].of(lot, undefined))
      if (value) {
        direct.get(key)!.add(value)
      }
    }
    // Kept whatever was asked for: which types want it is not known here, and a
    // set of record ids is small beside the lots that named them.
    const record = same(lot.fields.record)
    if (record) {
      records.add(record)
    }
  })
  return {
    lots,
    direct,
    records
  }
}

/**
 * The three item-derived types, resolved from the records the pass collected.
 *
 * Lazy and held on the pass: a wall that draws them pays the lookups once
 * between the three, and one that draws none of them does not pay at all.
 */
function itemValues(pass: Pass): Promise<Map<string, Set<string>>> {
  pass.items ??= (async () => {
    const values = new Map(ITEM_DERIVED.map((key) => [key, new Set<string>()]))
    for (const facts of (await itemsBehind(pass.records)).values()) {
      for (const key of ITEM_DERIVED) {
        const value = same(THROUGH[key].of(EMPTY_LOT, facts))
        if (value) {
          values.get(key)!.add(value)
        }
      }
    }
    return values
  })()
  return pass.items
}

/**
 * What the query reaches of one type, read through the lots brickzuke holds.
 *
 * `rows` are that type's own stored records, which say what the type can be
 * asked about — see [vocabularyOf]. The answer is a set of values rather than a
 * filtered list of rows so that the caller can use it for the count as well as
 * for the tiles, those being read at different depths.
 *
 * The walk itself is shared with every other type asking the same question —
 * see [Pass]. One row at a time either way: a region runs to thousands of
 * sellers and a seller to thousands of lots, so the fact table is the one thing
 * here with no bound on it, and reading it into an array to filter the array is
 * how a laptop runs out of memory.
 */
export async function reachFor(
  entityKey: string,
  expr: string,
  rows: readonly ShellRow[]
): Promise<Reach> {
  const through = THROUGH[entityKey]
  if (!through || !expr.trim()) {
    return UNCONSTRAINED
  }
  const foreign = foreignTerms(entityKey, rows, expr)
  if (!foreign.length || foreign.some((group) => !group.length)) {
    return UNCONSTRAINED
  }
  /*
   * The filter written back as source, and nothing else — not the query it came
   * out of.
   *
   * A walk depends on which terms it filters by and on the fact table, and on
   * nothing about the reader's query beside that. So `region:"Europe"` and
   * `region:"Europe" name:"brick"` share one walk when the type in hand cannot
   * answer `name` either: two questions, one thing being asked of the lots.
   */
  const key = formatExpression(foreign)
  let pass = passes.get(key)
  if (!pass) {
    pass = runPass(foreign).catch((thrown) => {
      // A failed walk must not be the answer forever.
      passes.delete(key)
      throw thrown
    })
    passes.set(key, pass)
  }
  let walked: Pass
  try {
    walked = await pass
  } catch {
    // The join is an enhancement over a card that already worked, so a failure
    // to read the fact table leaves that card exactly as it was rather than
    // blanking it — the same manners as the reads around it.
    return UNCONSTRAINED
  }
  // No lots read is not the same claim as nothing on offer — the distinction
  // the conditions card already keeps. With none of the fact table in hand the
  // join would report every type as reaching nothing, and a wall of noughts is
  // a confident answer to a question brickzuke has not begun to ask.
  if (!walked.lots) {
    return UNCONSTRAINED
  }
  const values = needsItems(entityKey)
    ? (await itemValues(walked)).get(entityKey)
    : walked.direct.get(entityKey)
  return {
    values: values ?? new Set<string>(),
    field: through.field,
    lots: walked.lots
  }
}

/** A stand-in for the lot, where the value being read is the item's and not its. */
const EMPTY_LOT = {
  id: '',
  entityKey: '',
  entityLabel: '',
  fields: {}
} as ShellRow

/** Whether a record of the type is one the query reaches. */
export function reaches(reach: Reach, row: ShellRow): boolean {
  if (!reach.values || !reach.field) {
    return true
  }
  return reach.values.has(same(row.fields[reach.field]))
}
