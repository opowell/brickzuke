/**
 * How much of a piece the stores a query reaches have on offer.
 *
 * A lot exists here once somebody has looked at the seller that offers it —
 * brickzuke has no bulk download of who sells what, only what browsing a
 * seller's own front, or an item's own page, has scraped into [STORE_LOTS] and
 * the item page store. So this, like [partCounts], is a floor rather than a
 * tally: a store nobody has opened answers as though it stocks nothing, and
 * the count beside the items table's rows is that floor, not a claim about
 * BrickLink itself.
 *
 * Held per record rather than pre-summed, because the sum depends on which
 * stores the current query reaches and that changes with every keystroke —
 * the fold over every lot brickzuke holds is the expensive half, done once and
 * kept; narrowing one record's own lots down to the ones a query's `store:`,
 * `colorid:` or `condition:` terms reach is cheap enough to redo on every
 * read, there being at most a few dozen lots behind any one record.
 *
 * A leaf module by design, the way [partCounts] is one: `catalogSource.ts`
 * reads the fold back to put a number on the row a scan builds — see `toRow`
 * — so this cannot read a lot back off `catalogSource.ts`'s own `eachLot`
 * without the two files importing each other. What is given up for that is
 * the region and the country a lot's seller is in, which only the directory
 * `eachLot` builds knows; a stored lot states its seller, its colour and its
 * condition directly, and those are what narrow the count here.
 */
import { ref, watch } from 'vue'
import { matchesExpression, parseExpression } from 'header-content-layout'
import type { EntitySchema, ShellRow, Term } from 'header-content-layout'
import { openCursor } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import dbStores from '../../idb/stores'
import type { StoredStoreLot } from '../stores/bricklink/store-front-page'
import { readStoreInventories } from './itemPageFetch'
import { storeLotsFill, storeLotsFor, storeScopeVersion } from './storeLotsFetch'

/** A lot's own vocabulary and nothing else — the same constant `reach.ts` folds by. */
const LOT_FIELDS = {
  facets: [],
  columns: []
} as unknown as EntitySchema

/**
 * The fields an item row already carries — see `toRow` in catalogSource.ts.
 * A term naming one of these has already done its work choosing which items
 * are on screen, so it is not asked of a lot again: `category:"5"` narrowed
 * the items table to category 5 already, and a lot of that same record is
 * category 5 by definition. Left in, it would cost nothing where a lot
 * happens to carry the same field — but `name`, `weight`, `dimensions` and
 * `note` are fields a lot does not carry at all, and asking a lot for them
 * would be asking a question it has no way to answer honestly.
 */
const ITEM_FIELDS = new Set([
  'id',
  'name',
  'type',
  'typeid',
  'category',
  'categoryname',
  'image',
  'record',
  'parts',
  'year',
  'weight',
  'dimensions',
  'note'
])

/** One lot, down to what this module narrows and sums by. */
function toLotRow(record: string, store: string, colorid: string | undefined, condition: string | undefined, quantity: number): ShellRow {
  return {
    id: '',
    entityKey: 'inventories',
    entityLabel: 'Store inventories',
    fields: {
      record,
      store,
      colorid: colorid === undefined ? undefined : Number(colorid),
      condition,
      quantity
    }
  }
}

/** Every lot brickzuke holds, grouped by the record it is of. */
const lotsByRecord = ref<Record<string, ShellRow[]>>({})

/** Whether the fold below has run at least once — see [storeInventoryOf]. */
const ready = ref(false)

async function read(): Promise<void> {
  const byRecord: Record<string, ShellRow[]> = {}
  const add = (row: ShellRow) => {
    const record = String(row.fields.record ?? '')
    if (record) {
      (byRecord[record] ??= []).push(row)
    }
  }
  for (const lot of readStoreInventories()) {
    add(
      toLotRow(`${lot.itemType}-${lot.itemNumber}`, lot.strSellerUsername, lot.colorId, lot.condition, lot.quantity)
    )
  }
  const db = await getDbConnection()
  try {
    let cursor = await openCursor(db, dbStores.STORE_LOTS)
    while (cursor) {
      const lot = cursor.value as StoredStoreLot
      add(toLotRow(lot.record, lot.store, lot.colorId, lot.condition, lot.quantity))
      cursor = await cursor.continue()
    }
  } finally {
    db.close()
  }
  lotsByRecord.value = byRecord
  ready.value = true
}

let loaded: Promise<void> | undefined

/** The pass, run once and never thrown from — see [ensurePartCounts]. */
export function ensureStoreInventories(): Promise<void> {
  loaded ??= read().catch(() => {})
  return loaded
}

/** Drops the pass and its answer, so the next ask reads the lots again. */
export function forgetStoreInventories() {
  loaded = undefined
  ready.value = false
  lotsByRecord.value = {}
}

let refold: ReturnType<typeof setTimeout> | undefined

/*
 * A page landing bumps [storeScopeVersion] once per page, and a seller runs
 * to dozens of them — refolding every lot brickzuke holds on every one would
 * be a cursor walk a page apart for as long as a fill runs. Debounced
 * instead, so a burst of pages is one refold rather than one each.
 */
watch(storeScopeVersion, () => {
  if (!loaded) {
    return
  }
  clearTimeout(refold)
  refold = setTimeout(() => {
    loaded = read().catch(() => {})
  }, 500)
})

/** The terms of a query that say which stores it reaches. */
function storeTerms(expr: string): Term[][] {
  return parseExpression(expr).map((group) =>
    group.filter((term) => term.kind === 'field' && !ITEM_FIELDS.has(term.field))
  )
}

/**
 * How many of a record the stores a query reaches have on offer — or nothing
 * where the fold has found no lots of it at all, whoever is asked about.
 * Nothing there is not the same claim as nought: a record with lots on file
 * that a query's store terms all miss is a real zero, and reads as one.
 */
export function storeInventoryOf(record: string, expr: string): number | undefined {
  const lots = lotsByRecord.value[record]
  if (!lots) {
    return undefined
  }
  const foreign = storeTerms(expr)
  return lots
    .filter((lot) => matchesExpression(foreign, lot, LOT_FIELDS))
    .reduce((sum, lot) => sum + (Number(lot.fields.quantity) || 0), 0)
}

/** Whether the fold has run at least once, for a cell deciding to animate. */
export function storeInventoriesReady(): boolean {
  return ready.value
}

/** Sellers a cell has already asked BrickLink for, this session. */
const requested = new Set<string>()

/** Sellers still being asked, for a cell deciding to animate. */
const pending = ref(new Set<string>())

/**
 * Asks for one seller's whole inventory, the way opening their own front page
 * would — and only once a session: a hundred cells asking about the same
 * `store:` term is one seller fetched, not one fetch per row.
 */
export function ensureStoreLots(store: string): void {
  if (!store || requested.has(store)) {
    return
  }
  requested.add(store)
  pending.value = new Set(pending.value).add(store)
  void storeLotsFor(store)
    .then(() => storeLotsFill(store).run())
    .catch(() => undefined)
    .finally(() => {
      const next = new Set(pending.value)
      next.delete(store)
      pending.value = next
    })
}

/** Whether a seller's inventory is still being asked for. */
export function storeLotsPending(store: string): boolean {
  return pending.value.has(store)
}
