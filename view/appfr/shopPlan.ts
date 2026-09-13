/**
 * The buying plan for one shopping list, worked out and held for as long as it
 * is true.
 *
 * [planPurchase] is a cursor over every lot brickzuke holds — the one read here
 * with no bound on it — so it is paid once per list rather than once per table
 * draw. Two tables are drawn from the one answer, the parts and the sellers, and
 * the shell asks for each of them separately; a plan per press would be two
 * walks for one question.
 *
 * Held, and dropped the moment anything it was worked out from moves: a change
 * to the list, which [userWrites] reports, and a change to the lots, which is
 * somebody opening a seller. A price is true only while the lot is there, so a
 * plan is never read back from a later session — this lives in memory only,
 * like the lots off an item's page and for the same reason.
 */
import { planPurchase } from '../../idb/shopParts'
import type { ShopPlan, WantedLine } from '../../idb/shopParts'
import { getDbConnection } from '../../idb/idb'
import { loadShopListItems } from '../../idb/shopList'
import { eachLot } from './catalogSource'

let held: { listId: number; plan: Promise<ShopPlan> } | undefined

/** What the list wants, as the planner reads a line. */
function wanted(items: Awaited<ReturnType<typeof loadShopListItems>>): WantedLine[] {
  return items.map((item) => ({
    // The list item's own key, so the plan's rows can be told apart and a row
    // can be traced back to the line somebody wrote.
    key: String(item.id),
    record: item.record,
    name: item.name,
    colorId: item.colorId,
    quantity: item.minQuantity,
    maxPrice: item.maxPrice,
    condition: item.condition
  }))
}

async function read(listId: number): Promise<ShopPlan> {
  const db = await getDbConnection()
  let lines: WantedLine[]
  try {
    lines = wanted(await loadShopListItems(db, listId))
  } finally {
    db.close()
  }
  /*
   * The lots are walked through `eachLot`, which is the only thing that knows
   * all of them: this session's item-page lots first, then the stored ones off
   * a cursor. Handed in rather than reached for — see the note at the top of
   * shopParts.ts.
   */
  return planPurchase(lines, (visit) =>
    eachLot((lot) =>
      visit({
        record: String(lot.fields.record ?? ''),
        // A lot states its colour as a number and a list as a string, both
        // being BrickLink's own id. Compared as strings by the planner, so it
        // is made one here rather than there.
        colorId: lot.fields.colorid === undefined ? undefined : String(lot.fields.colorid),
        condition: lot.fields.condition as string | undefined,
        quantity: Number(lot.fields.quantity ?? 0),
        price: lot.fields.priceValue as number | undefined,
        store: lot.fields.store as string | undefined,
        storeName: lot.fields.storeName as string | undefined,
        country: lot.fields.country as string | undefined,
        countryName: lot.fields.countryName as string | undefined
      })
    )
  )
}

/** The plan for one list, walking the lots only if it is not already in hand. */
export function planFor(listId: number): Promise<ShopPlan> {
  if (held?.listId !== listId) {
    held = {
      listId,
      plan: read(listId)
    }
  }
  return held.plan
}

/**
 * Drops it. Called after any write to a list, and after lots arrive: both change
 * the answer, and a held plan that no longer describes either is the one thing a
 * price comparison must not show.
 */
export function forgetPlan(): void {
  held = undefined
}
