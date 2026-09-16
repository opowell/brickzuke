/**
 * How much is on offer in each condition, over every lot stored.
 *
 * The conditions table is two rows, and each states how many of the lots
 * brickzuke holds are in that condition and how many pieces that comes to.
 * Un-narrowed, "the lots brickzuke holds" is the whole of [STORE_LOTS] — a
 * few hundred thousand rows once a handful of sellers have been opened — and
 * the table used to answer by reading every one of them into a row of the
 * lots table, looking the category up behind each, and then counting two
 * numbers off the result. Every `condition:"N"` in a query asked the same:
 * the header puts a name to that term by running it back against this table,
 * so a lots query narrowed to New paid for a pass over every lot there is
 * before its own rows could be read, and paid again on each of the shell's
 * re-asks while the answer was still in flight.
 *
 * This is the two numbers and nothing else, folded once a session in the
 * manner of [storeInventoryCounts] and held. A chunk of the store at a time,
 * so the fold never holds every lot at once and never blocks the thread for
 * longer than one chunk's worth of deserialising; a lots query reading its
 * own few hundred rows in between is delayed by one chunk, not by the pass.
 *
 * What is *not* here is the lots an item's own page has put in memory this
 * session — they are read live by the table, being few and already in hand —
 * nor any narrowing by a term other than the condition itself: a query that
 * crosses the conditions with a region still reads the lots, because that is
 * a question only the lots can answer.
 */
import { ref, watch } from 'vue'
import { getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import STORES from '../../idb/stores'
import type { StoredStoreLot } from '../stores/bricklink/store-front-page'
import { storeScopeVersion } from './storeLotsFetch'

/** How many lots are in a condition, and how many pieces they come to. */
export interface ConditionCount {
  lots: number
  quantity: number
}

/**
 * Lots pulled per round trip.
 *
 * Every other read of the database waits behind whichever chunk is in hand,
 * so the size is a latency put on everything else for as long as the pass
 * runs: five thousand is a dozen milliseconds or so at the sizes a stored lot
 * runs to, and the pass is still under a hundred trips.
 */
const CHUNK = 5_000

/** The fold's answer, by condition code — undefined until it has run. */
const counts = ref<Map<string, ConditionCount> | undefined>()

/**
 * Bumped as each fold lands, for a table drawn from the fold to be told when
 * the numbers on it have changed — see the `fill` on the conditions type.
 */
export const conditionCountsVersion = ref(0)

async function read(): Promise<void> {
  const tally = new Map<string, ConditionCount>()
  const db = await getDbConnection()
  try {
    let range: IDBKeyRange | null = null
    for (;;) {
      const batch = (await getAll<StoredStoreLot>(db, STORES.STORE_LOTS, range, CHUNK)) ?? []
      for (const lot of batch) {
        const code = lot.condition
        if (!code) {
          continue
        }
        const count = tally.get(code) ?? {
          lots: 0,
          quantity: 0
        }
        count.lots++
        count.quantity += Number(lot.quantity) || 0
        tally.set(code, count)
      }
      if (batch.length < CHUNK) {
        break
      }
      range = IDBKeyRange.lowerBound(batch[batch.length - 1].id, true)
    }
  } finally {
    db.close()
  }
  counts.value = tally
  conditionCountsVersion.value++
}

let loaded: Promise<void> | undefined

/** The pass, run once and never thrown from — see [ensurePartCounts]. */
export function ensureConditionCounts(): Promise<void> {
  loaded ??= read().catch(() => {})
  return loaded
}

/**
 * The counts by condition code — or nothing at all where the fold has not
 * landed yet, which is the table's own distinction between lots not read and
 * no lots on offer.
 *
 * Reading does not start the fold. Most reads are the header putting a name
 * to a `condition:` term, and a name needs no numbers: a pass over the lots
 * started for one would sit in front of the very rows the term is narrowing.
 * The table and the card, which do want the numbers, ask for the fold
 * themselves — see [ensureConditionCounts] — and the table is told when it
 * lands.
 */
export function conditionCounts(): ReadonlyMap<string, ConditionCount> | undefined {
  return counts.value
}

/** Drops the fold and its answer, so the next ask reads the lots again. */
export function forgetConditionCounts() {
  loaded = undefined
  counts.value = undefined
}

let refold: ReturnType<typeof setTimeout> | undefined

/*
 * A page of a seller's lots landing bumps [storeScopeVersion], and a seller
 * runs to dozens of pages: refolding on every one would be a pass over the
 * store a page apart for as long as a fill runs. Debounced instead, as
 * [storeInventoryCounts] is, so a burst of pages is one refold — and only
 * once something has asked, an unasked fold being nobody's answer.
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
