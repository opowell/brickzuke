/**
 * How many parts each set is made of, for the tables that list sets.
 *
 * An inventory is the one thing in the catalogue no bulk download carries:
 * BrickLink states it a page at a time, so the only sets whose part count is
 * known are the ones somebody has already opened — see [inventoryFetch]. That
 * is what this holds, and the whole of it. A set nobody has opened has no
 * count here, and its cell says so rather than saying nought: `0` for a set of
 * 300 pieces is a number brickzuke never gave.
 *
 * Held in a ref rather than written onto the rows, because the answer arrives
 * after the row does — opening one set fills its count in, and the cell that
 * was showing a dash a moment ago is showing the number while the table it
 * came from is still on screen behind it.
 */
import { ref } from 'vue'
import { getDbConnection } from '../../idb/idb'
import stores from '../../idb/stores'
import type { StoredItemInventory } from '../stores/bricklink/catalog-item-inv-page'

/**
 * The two numbers a set's inventory is, which are not the same number.
 *
 * `parts` is pieces — every part counted as many times as the set contains it,
 * which is what a set's part count means to anyone holding the box. `lots` is
 * the rows the listing draws, one per part and colour. A 300-piece set is
 * routinely 60 lots, so a cell stating one and opening the other owes the
 * reader an explanation, and the hover is where it gives it.
 */
export interface PartCount {
  parts: number
  lots: number
}

/** What is known so far, by the BrickLink record — `S-10511-1`. */
export const partCounts = ref<Record<string, PartCount>>({})

/** The counts one set's stored parts add up to. */
function fold(stored: readonly StoredItemInventory[]): PartCount {
  let parts = 0
  for (const part of stored) {
    parts += Number(part.quantity) || 0
  }
  return {
    parts,
    lots: stored.length
  }
}

/**
 * What a set was found to be made of, remembered.
 *
 * Nothing at all is not an answer here: every read of an unstored set comes
 * back empty, and writing that down as "made of nothing" would put a `0` on
 * every set in the catalogue. `inventoryFetch` waits for a non-empty answer
 * for the same reason.
 */
export function notePartCount(record: string, stored: readonly StoredItemInventory[]) {
  if (!record || !stored.length) {
    return
  }
  partCounts.value = {
    ...partCounts.value,
    [record]: fold(stored)
  }
}

/** What this set is made of, or nothing when nobody has opened it yet. */
export function partsOf(record: string): PartCount | undefined {
  return partCounts.value[record]
}

/** One pass at a time, and one per session: this changes only as sets are opened. */
let loaded: Promise<void> | undefined

/**
 * Every stored inventory folded down to a count per set, in one cursor pass.
 *
 * A cursor rather than an indexed count per row: the items table is 199,000
 * rows and this store holds only the handful of sets browsed so far, so one
 * walk of the small side answers every row of the large one. The same fold
 * [catalogCounts] makes for the home screen's cards, kept per record.
 */
async function read(): Promise<void> {
  const db = await getDbConnection()
  try {
    const counts: Record<string, PartCount> = {}
    let cursor = await db.transaction(stores.ITEM_INVENTORIES.name).store.openCursor()
    while (cursor) {
      const stored = cursor.value as StoredItemInventory
      if (stored.record) {
        const held = (counts[stored.record] ??= {
          parts: 0,
          lots: 0
        })
        held.parts += Number(stored.quantity) || 0
        held.lots++
      }
      cursor = await cursor.continue()
    }
    // Anything noted while the pass ran wins: a set opened just now was read
    // from what came back, and the pass may have started before it was stored.
    partCounts.value = {
      ...counts,
      ...partCounts.value
    }
  } finally {
    db.close()
  }
}

/**
 * The pass, run once and never thrown from.
 *
 * Every Parts cell asks for this on mount, so a store that cannot be opened
 * would be one unhandled rejection per row. A count nobody could read is a
 * cell that says it has not been counted, which is the same thing it says
 * before the pass finishes and is true either way.
 */
export function ensurePartCounts(): Promise<void> {
  loaded ??= read().catch(() => {})
  return loaded
}

/** Drops the pass and its answer, so the next ask reads the store again. */
export function forgetPartCounts() {
  loaded = undefined
  partCounts.value = {}
}
