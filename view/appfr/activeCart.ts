/**
 * What the active cart holds, kept where a lot's row can read it without
 * asking.
 *
 * The lots table is built a row at a time off a cursor — see [eachLot] — and
 * each row wants to say how many of that lot are in the cart. A read per row
 * would be thousands of reads for one table, so the cart's lines are read once,
 * here, into a map by lot, and every row builder looks its lot up in it.
 *
 * Refreshed on the two things that change it: a write, through
 * [refreshUserCounts], which is what re-runs the query anyway; and the setting
 * naming a different cart, which [userCounts] watches for the same reason.
 */
import { ref } from 'vue'
import type { IDBPDatabase } from 'idb'
import type { CartLine } from '../../idb/userTypes'
import { loadCartLines } from '../../idb/cart'
import { activeCartId } from './settings'

/** The active cart's lines, by the lot each one is of. */
export const activeCartLines = ref<Map<string, CartLine>>(new Map())

/** Re-reads the active cart's lines — empty where no cart is active. */
export async function refreshActiveCartLines(db: IDBPDatabase): Promise<void> {
  const id = activeCartId()
  const lines = id ? await loadCartLines(db, id) : []
  activeCartLines.value = new Map(lines.map((line) => [line.lotId, line]))
}

/**
 * How many of one lot the active cart holds, or nothing where it holds none.
 *
 * Nothing rather than nought, so the column reads blank down every lot not in
 * the cart and a figure on the ones that are — a `0` on every row would be a
 * table of noughts with the cart lost among them.
 */
export function cartQuantityOf(lotId: unknown): number | undefined {
  return activeCartLines.value.get(String(lotId ?? ''))?.quantity
}
