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
/**
 * Where the lots come from — handed in by the source rather than imported
 * from it, because the source applies this join to its own tables (see
 * `joined` there) and a module the source imports cannot import the source
 * back. `each` walks every lot held, a row at a time; `named` reads the lots
 * a query names — an item's, a seller's — as the lots table would show them,
 * or nothing where it names none. See [provideLots].
 */
/*
 * Nothing here imports the schema or the source: the source registers its
 * lots below, and a caller hands in the entity it is asking about. Both are
 * so that the source can import this — a cell imports the source, the
 * schema imports the cells, and a schema loaded halfway through a cell's own
 * load is a schema naming a component that is not there yet.
 */
export interface LotSource {
  each(visit: (lot: ShellRow) => void): Promise<number>
  named(expr: string): Promise<ShellRow[]> | undefined
  /**
   * The records the query's item stands for — `P-3001` — or nothing where it
   * names no item. See [OF_ITEM] for what is read off them.
   */
  records(expr: string): Promise<string[]> | undefined
  /**
   * What the query's item is made of — the stored lines of a set's inventory,
   * as its table shows them — or nothing where it names no item. Empty for
   * an item made of nothing, a part, and for a set nobody has opened yet.
   * See [madeOf].
   */
  lines(expr: string): Promise<ShellRow[]> | undefined
}

let lots: LotSource | undefined

/** The source's lots, registered once as the source loads. */
export function provideLots(source: LotSource): void {
  lots = source
}

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
 * The first seven are on the lot itself. The last three are on the item behind
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
  provinces: {
    field: 'province',
    of: (lot) => lot.fields.province
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
  },
  /*
   * And the ones a lot speaks for by way of who sells it and what it is of.
   * A seller's terms are the seller's, so the sellers with a matching lot are
   * the terms worth listing; a picture is of a record, as a lot is; and a
   * line of a set's inventory, or the variant it folds into, is a part —
   * `P-3001` — which is the record a lot names.
   */
  shippingMethods: {
    field: 'store',
    of: (lot) => lot.fields.store
  },
  shippingCosts: {
    field: 'store',
    of: (lot) => lot.fields.store
  },
  images: {
    field: 'record',
    of: (lot) => lot.fields.record
  },
  itemInventories: {
    field: 'part',
    of: (lot) => lot.fields.record
  },
  itemVariants: {
    field: 'part',
    of: (lot) => lot.fields.record
  }
}

/**
 * The types a lot can speak for, by key — what a fill deepening the fact table
 * has to re-read when a page of lots lands.
 */
export const JOINED: readonly string[] = Object.keys(THROUGH)

/**
 * The types that are about the item itself, and what the item says of them.
 *
 * A query naming an item — `id:37194` — is answered two ways. Who sells it,
 * where, in what colour and condition is a question of its lots, and goes
 * through {@link THROUGH}. What it is — its category, its year, its type, the
 * sets it is a line of, the pictures of it, the lists that want it and the
 * carts holding a lot of it — is a question of the item and its records, and
 * needs no lot at all: an item nobody is selling is still in a category, and
 * still wanted by a list. So these are read off the records the query stands
 * for, and the answer is exact rather than a floor, there being no fact table
 * it could be a fraction of.
 *
 * `field` is where the type's own rows carry the value, as in [Through], and
 * `of` reads the same value off one record of the item. A row may carry
 * several — a shopping list wants several parts — and it is reached if any of
 * them is: see [reaches].
 */
interface OfItem {
  field: string
  of(record: string, facts: ItemFacts | undefined): unknown
}

const OF_ITEM: Record<string, OfItem> = {
  items: {
    field: 'id',
    of: (_record, facts) => facts?.id
  },
  categories: {
    field: 'category',
    of: (_record, facts) => facts?.category
  },
  years: {
    field: 'year',
    of: (_record, facts) => facts?.year
  },
  itemTypes: {
    field: 'type',
    // `P-3001` is a part: the type is the front of the record.
    of: (record) => record.split('-')[0]
  },
  images: {
    field: 'record',
    of: (record) => record
  },
  /*
   * A line is of two records — the set it is in and the part it is — and is
   * reached by either: a set named is its own parts, a part named is the sets
   * it is a line of. Through `part` alone a set reached nothing, no set being
   * a line of itself. A variant the same way: the part, and the sets it is
   * in. See [inventoryFields].
   */
  itemInventories: {
    field: 'records',
    of: (record) => record
  },
  itemVariants: {
    field: 'records',
    of: (record) => record
  },
  /*
   * And theirs. A list's row carries the records its lines want and a cart's
   * the records its lots are of — see [userRows] — so both are reached by
   * the item the way a set's line is.
   */
  shopLists: {
    field: 'records',
    of: (record) => record
  },
  carts: {
    field: 'records',
    of: (record) => record
  }
}

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
export function matching(
  entity: EntitySchema | undefined,
  expr: string
): (row: ShellRow) => boolean {
  if (!expr.trim() || !entity) {
    return () => true
  }
  const parsed = withoutItemAddress(entity.key, parseExpression(expr))
  return (row) => matchesExpression(parsed, row, entity)
}

/**
 * Whether a term names an item by the items table's own scope, `id:` — the
 * term a press on an item writes, and the one the header reads back as the
 * item whichever table is up.
 *
 * Every other row has an `id` of its own and none of them is the item's, so
 * on every table but the items table's the term is an address and not a
 * filter: it says whose lots the query is about (see [LotSource.named]) and
 * narrows no row by its own id. The same reading the source's tables make of
 * it — see `itemAddress` there.
 */
function namesItem(term: Term): boolean {
  return term.kind === 'field' && term.field === 'id' && term.comparator === ':' && !term.negated
}

/** Whether a term is the `type:` that, beside an `id:`, says which of the item's records is meant. */
function typesItem(term: Term): boolean {
  return term.kind === 'field' && term.field === 'type' && term.comparator === ':' && !term.negated
}

/**
 * The expression with the item's address lifted out, on every table but the
 * items table's.
 *
 * The `type:` beside an `id:` goes with it — see `itemAddress` in the source,
 * which reads the pair the same way. Left in, it was put to the rows of a
 * type that carries a type of its own: every line of the set `type:S id:979`
 * names is a part, so `type:S` matched none of them, and the card the join
 * had just reached read nought. On its own `type:` stays a filter.
 */
function withoutItemAddress(entityKey: string, expression: Term[][]): Term[][] {
  if (entityKey === 'items') {
    return expression
  }
  // A group left empty constrains nothing, and matches every row — which is
  // right: a query that was only the item's address asks nothing of a colour.
  return expression.map((group) => {
    const named = group.some(namesItem)
    return group.filter((term) => !namesItem(term) && !(named && typesItem(term)))
  })
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
function vocabularyOf(entity: EntitySchema | undefined, rows: readonly ShellRow[]): Set<string> {
  const carried = new Set<string>()
  for (const row of rows) {
    for (const field of Object.keys(row.fields)) {
      carried.add(field.toLowerCase())
    }
  }
  if (carried.size) {
    return carried
  }
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
function foreignTerms(
  entity: EntitySchema | undefined,
  rows: readonly ShellRow[],
  expr: string
): Term[][] {
  const carried = vocabularyOf(entity, rows)
  return parseExpression(expr).map((group) =>
    group.filter(
      (term) => term.kind === 'field' && !carried.has(term.field.toLowerCase()) && !namesItem(term)
    )
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

/** How much of the lots one value of a type accounts for. */
export interface Tally {
  /** Lots carrying the value. */
  lots: number
  /** Every piece inside those lots. */
  quantity: number
  /**
   * Who is selling them — the distinct sellers among those lots, which is
   * what a country or a province under the query counts: not the sellers in
   * it, but the ones in it with something the query asked for.
   */
  sellers: Set<string>
}

/** What a query reaches of one type. */
export interface Reach {
  /**
   * The values of {@link Through.field} the query can reach, or undefined where
   * it constrains this type not at all — which is a different answer from an
   * empty set, that being "nothing".
   */
  values?: Set<string>
  /**
   * The same values, each with how many of the lots it was read off — what
   * the colours table writes beside a colour, as the conditions table does
   * beside a condition. Undefined exactly where {@link values} is.
   */
  counts?: Map<string, Tally>
  /** The field those values are compared against on this type's own rows. */
  field?: string
  /** How many lots the answer was read from. Nought is "nothing is known yet". */
  lots: number
  /**
   * Whether the answer is the whole of it rather than a floor — read off the
   * item the query names and not off the lots held of it, see [OF_ITEM]. A
   * card over an exact answer says its number plainly, with no `~`.
   */
  exact?: boolean
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
  /** The values reached, by type, for the types a lot speaks for directly — each with its tally. */
  direct: Map<string, Map<string, Tally>>
  /** The records the surviving lots named, for the three types that need them, each with its tally. */
  records: Map<string, Tally>
  /** Those three resolved, once, and only if anybody asks. */
  items?: Promise<Map<string, Map<string, Tally>>>
}

/** One more lot against a value. */
function tally(into: Map<string, Tally>, value: string, lot: ShellRow | Tally): void {
  const held = into.get(value) ?? {
    lots: 0,
    quantity: 0,
    sellers: new Set<string>()
  }
  if ('lots' in lot) {
    held.lots += lot.lots
    held.quantity += lot.quantity
    for (const seller of lot.sellers) {
      held.sellers.add(seller)
    }
  } else {
    held.lots += 1
    held.quantity += Number(lot.fields.quantity ?? 0)
    const seller = same(lot.fields.store)
    if (seller) {
      held.sellers.add(seller)
    }
  }
  into.set(value, held)
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

/**
 * The lots one pass is over: the ones the query names, or every one held.
 *
 * A query naming an item or a seller — `id:`, `record:`, `store:` — is a
 * query about their lots, and those are the lots the lots table shows for
 * it: an item's page, a seller's stored front. Read from there, the join
 * agrees with that table — the twenty-one lots it counts are the twenty-one
 * the colours are read off — and does not walk the whole fact table to
 * answer a question about one item of it. Nothing named is every lot held,
 * walked a row at a time.
 */
function lotsOver(expr: string, visit: (lot: ShellRow) => void): Promise<number> {
  if (!lots) {
    return Promise.resolve(0)
  }
  const named = lots.named(expr)
  if (!named) {
    return lots.each(visit)
  }
  return named.then((rows) => {
    rows.forEach(visit)
    return rows.length
  })
}

/** One walk, filtered, collecting every dimension it can as it goes. */
async function runPass(expr: string, foreign: Term[][]): Promise<Pass> {
  const direct = new Map(LOT_DIRECT.map((key) => [key, new Map<string, Tally>()]))
  const records = new Map<string, Tally>()
  const lots = await lotsOver(expr, (lot) => {
    if (!matchesExpression(foreign, lot, LOT_FIELDS)) {
      return
    }
    for (const key of LOT_DIRECT) {
      const value = same(THROUGH[key].of(lot, undefined))
      if (value) {
        tally(direct.get(key)!, value, lot)
      }
    }
    // Kept whatever was asked for: which types want it is not known here, and a
    // set of record ids is small beside the lots that named them.
    const record = same(lot.fields.record)
    if (record) {
      tally(records, record, lot)
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
function itemValues(pass: Pass): Promise<Map<string, Map<string, Tally>>> {
  pass.items ??= (async () => {
    const values = new Map(ITEM_DERIVED.map((key) => [key, new Map<string, Tally>()]))
    const behind = await itemsBehind(new Set(pass.records.keys()))
    for (const [record, counted] of pass.records) {
      const facts = behind.get(record)
      if (!facts) {
        continue
      }
      for (const key of ITEM_DERIVED) {
        const value = same(THROUGH[key].of(EMPTY_LOT, facts))
        if (value) {
          // Summed across records: an item is one line over however many
          // records, and its lots are the lots of all of them.
          tally(values.get(key)!, value, counted)
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
 * asked about — see [vocabularyOf] — and `entity` is what says it where there
 * are none, the items scan above all. The answer is a set of values rather
 * than a filtered list of rows so that the caller can use it for the count as
 * well as for the tiles, those being read at different depths.
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
  rows: readonly ShellRow[],
  entity?: EntitySchema
): Promise<Reach> {
  if (!expr.trim()) {
    return UNCONSTRAINED
  }
  const ofItem = OF_ITEM[entityKey]
  const records = ofItem && lots?.records(expr)
  if (ofItem && records) {
    return await ofItemNamed(ofItem, records)
  }
  const lines = entityKey === 'colors' ? lots?.lines(expr) : undefined
  if (lines) {
    const made = await madeOf(lines)
    if (made) {
      return made
    }
  }
  const through = THROUGH[entityKey]
  if (!through) {
    return UNCONSTRAINED
  }
  const foreign = foreignTerms(entity, rows, expr)
  const named = namedIn(expr)
  // No term to put to the lots and no lots named is a query this type
  // answers alone. An address on its own is not: `id:"21051"` filters no lot
  // of the item's, but it is the item's lots the type is then read off.
  if (!named && (!foreign.length || foreign.some((group) => !group.length))) {
    return UNCONSTRAINED
  }
  /*
   * The filter written back as source, and nothing else — not the query it came
   * out of.
   *
   * A walk depends on which terms it filters by, on which lots it is over —
   * see [namedIn] — and on nothing about the reader's query beside that. So
   * `region:"Europe"` and `region:"Europe" name:"brick"` share one walk when
   * the type in hand cannot answer `name` either: two questions, one thing
   * being asked of the lots.
   */
  const key = `${named}|${formatExpression(foreign)}`
  let pass = passes.get(key)
  if (!pass) {
    pass = runPass(expr, foreign).catch((thrown) => {
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
  const counts =
    (needsItems(entityKey) ? (await itemValues(walked)).get(entityKey) : walked.direct.get(entityKey)) ??
    new Map<string, Tally>()
  return {
    values: new Set(counts.keys()),
    counts,
    field: through.field,
    lots: walked.lots
  }
}

/**
 * A type about the item, read off the item's records — see [OF_ITEM].
 *
 * The facts are looked up only where the type needs them: a picture is of a
 * record, and the record is in hand already. An id the catalogue has no
 * record of reaches nothing, which is an empty set and not no constraint —
 * a list wanting a part of an item that does not exist is not every list.
 * Nothing is tallied: these are not lots, and a card over them writes no
 * count of lots beside its rows.
 */
async function ofItemNamed(ofItem: OfItem, records: Promise<string[]>): Promise<Reach> {
  let named: string[]
  try {
    named = await records
  } catch {
    return UNCONSTRAINED
  }
  const needsFacts = ['id', 'category', 'year'].includes(ofItem.field)
  const facts = needsFacts ? await itemsBehind(new Set(named)) : new Map<string, ItemFacts>()
  const values = new Set<string>()
  for (const record of named) {
    const value = same(ofItem.of(record, facts.get(record)))
    if (value) {
      values.add(value)
    }
  }
  return {
    values,
    counts: new Map(),
    field: ofItem.field,
    lots: 0,
    exact: true
  }
}

/**
 * The colours of what the item is made of — see [LotSource.lines].
 *
 * A set's lots say nothing of colour: a set is sold as the box it comes in,
 * and its lot carries the colour the catalogue gives an item that has none.
 * So under `type:S id:979` the colours card, read through the lots, was the
 * one colour that is not a colour. What the set *is* in colour is its parts,
 * and those are on the lines of its inventory — so where the query's item is
 * made of anything, the colours are read off the lines instead, as its
 * category and its year are read off the item rather than its lots. Exact,
 * for the same reason: an inventory is stored whole or not at all.
 *
 * Tallied as the lines are: `lots` is how many of the set's lines are in the
 * colour — that many distinct parts, which is what the card writes beside
 * the colour — and `quantity` how many pieces. Nobody sells a line, so the
 * sellers stay empty.
 *
 * Undefined where the item is made of nothing, or nobody has opened it yet:
 * a part's colours are the colours it is sold in, and those are its lots'.
 */
async function madeOf(lines: Promise<ShellRow[]>): Promise<Reach | undefined> {
  let made: ShellRow[]
  try {
    made = await lines
  } catch {
    return undefined
  }
  const counts = new Map<string, Tally>()
  for (const line of made) {
    const colour = same(line.fields.colorid)
    if (colour) {
      tally(counts, colour, line)
    }
  }
  if (!counts.size) {
    return undefined
  }
  return {
    values: new Set(counts.keys()),
    counts,
    field: 'colorid',
    lots: 0,
    exact: true
  }
}

/**
 * The lots a query names, as text — the other half of a pass's key. Two
 * queries filtering by the same terms are one question of the lots only when
 * they are asking it of the same lots: `condition:N` over one item's page
 * and over every lot held are different walks with different answers.
 */
function namedIn(expr: string): string {
  return formatExpression(
    parseExpression(expr).map((group) =>
      group.filter(
        (term) =>
          term.kind === 'field' &&
          ['id', 'record', 'store'].includes(term.field) &&
          term.comparator === ':' &&
          !term.negated
      )
    )
  )
}

/** A stand-in for the lot, where the value being read is the item's and not its. */
const EMPTY_LOT = {
  id: '',
  entityKey: '',
  entityLabel: '',
  fields: {}
} as ShellRow

/** The join's count for one record of the type, where it counted one. */
export function tallied(reach: Reach, row: ShellRow): Tally | undefined {
  if (!reach.field) {
    return undefined
  }
  return reach.counts?.get(same(row.fields[reach.field]))
}

/**
 * The types whose own figure the join restates, and in what.
 *
 * A seller's row says how many pieces they have for sale and a country's
 * how many sellers are in it: the directory's numbers, true of the type and
 * not of the query. Under `type:S id:979` the sellers table is the sellers
 * with the set — the join sees to that — but `723k` beside one of them is
 * everything else in the shop, and `1.7k` beside Germany is every German
 * seller whether or not they have it. What the reader asked was how many of
 * the set, and how many sellers have one. So where the join has counted a
 * record, the record's figure is the join's, written into the field the
 * type already draws and sorts by: for a seller the pieces in the lots that
 * reached them, for a country, a province or a part of the world the
 * sellers those lots are from. A region has no such field of its own — it
 * counts countries — so `stores` is one the join alone fills, blank until a
 * query reaches something, as a colour's `lots` is.
 *
 * A floor like the count over the table, read off the lots held.
 */
export interface UnderJoin {
  /** The field the figure is written to on the type's own rows. */
  field: string
  /** The figure, off the join's count for the record. */
  of(tally: Tally): number
}

export const UNDER_JOIN: Record<string, UnderJoin> = {
  stores: {
    field: 'items',
    of: (tally) => tally.quantity
  },
  countries: {
    field: 'stores',
    of: (tally) => tally.sellers.size
  },
  provinces: {
    field: 'stores',
    of: (tally) => tally.sellers.size
  },
  regions: {
    field: 'stores',
    of: (tally) => tally.sellers.size
  }
}

/**
 * The record's row with the join's figure written in — see [UNDER_JOIN] —
 * or the row as it was, where the type has no such figure or the join did
 * not count this record.
 */
export function underJoin(entityKey: string, reach: Reach, row: ShellRow): ShellRow {
  const under = UNDER_JOIN[entityKey]
  const tally = under && tallied(reach, row)
  if (!under || !tally) {
    return row
  }
  return {
    ...row,
    fields: {
      ...row.fields,
      [under.field]: under.of(tally)
    }
  }
}

/**
 * Whether a record of the type is one the query reaches.
 *
 * A row carrying several values in the field — the records a list wants — is
 * reached if any one of them is.
 */
export function reaches(reach: Reach, row: ShellRow): boolean {
  if (!reach.values || !reach.field) {
    return true
  }
  const held = row.fields[reach.field]
  if (Array.isArray(held)) {
    return held.some((value) => reach.values!.has(same(value)))
  }
  return reach.values.has(same(held))
}
