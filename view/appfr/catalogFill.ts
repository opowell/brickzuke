/**
 * What the catalogue's own tables are drawn from, fetched while they are up.
 *
 * Two tables here are the residue of browsing rather than a download: the
 * lines of sets' inventories, written when a set is opened, and the pictures
 * of items, written when an item is. Asked about one item, each already
 * fetches that item's page. Asked about anything else they showed whatever
 * had been opened, and said nothing of the rest. This is the rest:
 *
 * - `lines`, for the item inventories and variants. Under a query naming an
 *   item, what it is made of and — for a part or a minifigure — what it is
 *   in, off its own "appears in" pages: two requests for every set a part is
 *   in, where opening sets to find it would be twenty thousand. Under any
 *   other query, every set's, minifigure's and gear's inventory not yet
 *   stored, newest first.
 * - `pictures`, for the images: every item's pictures not yet stored, of the
 *   types the query names or of every type, sets first.
 *
 * The second of each is tens of thousands of pages, and so it is a slow fill
 * by design, in [reachFill]'s manners: one request at a time with the reader's
 * gap between, only while the table is up, nothing asked twice in a session,
 * and a pause rather than a string of failures while BrickLink's bot check
 * stands. A run of failures slows it rather than ends it — an item BrickLink
 * lists nothing for fails just as an unanswered one does, and old sets with no
 * inventory are scattered all through the catalogue; see [partsFill].
 */
import { ref } from 'vue'
import { parseExpression } from 'header-content-layout'
import { throughBotCheck } from '../assets/js/bot-check'
import { getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import STORES from '../../idb/stores'
import type { BrickLinkItem } from '../stores/bricklink/catalog-download-page'
import { appearancesFor, hasAppearances } from './appearancesFetch'
import { recordsNamedBy } from './catalogSource'
import { hasInventory, inventoryFor } from './inventoryFetch'
import { imagedRecords, imagesFor } from './itemPageFetch'
import { reachGapMs } from './settings'

export type CatalogFill = 'lines' | 'pictures'

/** Ticks each time something lands. See [tableReach]. */
export const catalogLanded = ref(0)

/** Failures in a row before the pace drops — [partsFill]'s number, for its reason. */
const FAILURES_BEFORE_BACKOFF = 3

/** The pace once it has dropped: a try a minute. */
const BACKOFF_MS = 60_000

/** The kinds of item that are made of anything, and so have an inventory to fetch. */
const MADE_OF = ['S', 'M', 'G']

/** The order the pictures of every item are fetched in: sets, then minifigures, then parts, then the rest. */
const PICTURED = ['S', 'M', 'P', 'G', 'B', 'C', 'I', 'O']

/** Asked about this session, answered or not, so none is asked twice. */
const attempted = new Set<string>()

let current = 0
let issued = 0
let running = ''

/** Starts the fill for a table, or leaves the one already running for it alone. */
export function startCatalogFill(kind: CatalogFill, expr: string): void {
  const asked = `${kind}|${expr.trim()}`
  if (current && running === asked) {
    return
  }
  running = asked
  const mine = (current = ++issued)
  void run(mine, kind, expr.trim())
}

/** Stops it, at whatever item it had reached. What was fetched stays. */
export function stopCatalogFill(): void {
  current = 0
  running = ''
}

async function run(mine: number, kind: CatalogFill, expr: string): Promise<void> {
  const live = () => mine === current
  let asks: (() => Promise<unknown>)[]
  try {
    asks = kind === 'lines' ? await lineAsks(expr) : await pictureAsks(expr)
  } catch {
    // Nothing to read the catalogue from: nothing to fetch.
    return
  }
  let failures = 0
  for (const ask of asks) {
    if (!live()) {
      return
    }
    try {
      await throughBotCheck(ask, live)
      failures = 0
      if (live()) {
        catalogLanded.value++
      }
    } catch {
      failures++
    }
    await wait(failures >= FAILURES_BEFORE_BACKOFF ? BACKOFF_MS : reachGapMs.value)
  }
}

/** One ask of each kind per record, each made at most once a session. */
function once(
  record: string,
  label: string,
  ask: () => Promise<unknown>
): (() => Promise<unknown>) | undefined {
  const key = `${record}|${label}`
  if (attempted.has(key)) {
    return undefined
  }
  // Marked once answered, not once asked: a table's query settles over a few
  // ticks on the way in, and each restarts the run. Marked on asking, the run
  // that asked was stopped before its answer landed and the one after skipped
  // the record — the answer stored, and the table never told. Asked again, it
  // joins the fetch in flight rather than making another.
  return async () => {
    try {
      return await ask()
    } finally {
      attempted.add(key)
    }
  }
}

/**
 * The asks behind the item inventories: the named item's own pages where the
 * query names one, and otherwise every inventory not yet stored.
 */
async function lineAsks(expr: string): Promise<(() => Promise<unknown>)[]> {
  const named = await namedRecords(expr)
  const records = named.length ? named : await unopenedInventories()
  const asks: (() => Promise<unknown>)[] = []
  for (const record of records) {
    if (hasInventory(record)) {
      const made = once(record, 'made of', () => inventoryFor(record))
      if (made) {
        asks.push(made)
      }
    }
    if (named.length && hasAppearances(record)) {
      const within = once(record, 'appears in', () => appearancesFor(record))
      if (within) {
        asks.push(within)
      }
    }
  }
  return asks
}

/**
 * The records the query names: an item by `id:` or `record:`, and a part by
 * the `part:` a line carries it under — the term a press on a line's part
 * writes.
 */
async function namedRecords(expr: string): Promise<string[]> {
  const records = new Set<string>(await (recordsNamedBy(expr) ?? Promise.resolve([])))
  for (const group of parseExpression(expr)) {
    for (const term of group) {
      if (
        term.kind === 'field' &&
        term.comparator === ':' &&
        !term.negated &&
        ['part', 'record'].includes(term.field) &&
        /^[A-Z]-./.test(term.value)
      ) {
        records.add(term.value)
      }
    }
  }
  return [...records]
}

/** Every set, minifigure and piece of gear whose inventory is not stored, newest first. */
async function unopenedInventories(): Promise<string[]> {
  const db = await getDbConnection()
  try {
    const opened = new Set<string>()
    const index = db
      .transaction(STORES.ITEM_INVENTORIES.name)
      .store.index(indices.ITEM_INVENTORIES_BY_RECORD.name)
    for (let cursor = await index.openKeyCursor(null, 'nextunique'); cursor; cursor = await cursor.continue()) {
      opened.add(String(cursor.key))
    }
    const items: BrickLinkItem[] = []
    for (const type of MADE_OF) {
      items.push(...((await getAll<BrickLinkItem>(db, STORES.BRICK_LINK_ITEMS, range(type))) ?? []))
    }
    return items
      .filter((item) => !opened.has(item.id))
      .sort((left, right) => Number(right['Year Released'] ?? 0) - Number(left['Year Released'] ?? 0))
      .map((item) => item.id)
  } finally {
    db.close()
  }
}

/** The asks behind the images: every item's pictures not yet stored, of the types the query names or of all. */
async function pictureAsks(expr: string): Promise<(() => Promise<unknown>)[]> {
  const typed = namedTypes(expr)
  const types = typed.length ? PICTURED.filter((type) => typed.includes(type)) : PICTURED
  const pictured = await imagedRecords()
  const db = await getDbConnection()
  const asks: (() => Promise<unknown>)[] = []
  try {
    for (const type of types) {
      const keys = (await db.getAllKeys(STORES.BRICK_LINK_ITEMS.name, range(type))) as string[]
      for (const record of keys) {
        if (pictured.has(record)) {
          continue
        }
        const ask = once(record, 'pictures', () => imagesFor(record))
        if (ask) {
          asks.push(ask)
        }
      }
    }
  } finally {
    db.close()
  }
  return asks
}

/** The item types a query asks for — `type:S` — and nothing where it names none. */
function namedTypes(expr: string): string[] {
  const types: string[] = []
  for (const group of parseExpression(expr)) {
    for (const term of group) {
      if (term.kind === 'field' && term.field === 'type' && term.comparator === ':' && !term.negated) {
        types.push(term.value.toUpperCase())
      }
    }
  }
  return types
}

/** Every catalogue key of one type — `S-` to the end of the `S-`s. */
function range(type: string): IDBKeyRange {
  return IDBKeyRange.bound(`${type}-`, `${type}-￿`)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
