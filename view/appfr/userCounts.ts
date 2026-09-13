/**
 * How many records somebody has of their own — and, in passing, what tells the
 * shell to look again after they write one.
 *
 * The sibling of [catalogCounts], which counts the browse-filled types, and it
 * exists separately for the reason those two are separate: this is not a
 * population anybody fetched, and it changes because somebody just changed it
 * rather than because a scrape ran. So it is re-counted after every write
 * instead of when the home screen is drawn.
 *
 * That re-count is also the refresh. `useResults` watches the schema alongside
 * the query, and `catalogSchema` reads these numbers — so assigning a fresh
 * object here rebuilds the schema and the shell re-runs the query it is on,
 * which is how a row somebody has just made appears in the table they made it
 * from. A fresh object every time, and not only when a number has moved: a line
 * added to an inventory changes a count that no card draws, and the table is
 * still owed the new row.
 *
 * An edited *field* needs none of this. The cell holds what was typed, the way
 * [CellSetting]'s does, so nothing has to be read back to show it.
 */
import { ref } from 'vue'
import { count, getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import stores from '../../idb/stores'
import type { UserCategory } from '../../idb/userTypes'

/** The populations, by the entity key each is drawn under. */
export const userCounts = ref<Record<string, number | undefined>>({})

/**
 * Somebody's own categories, as the choices a picker offers.
 *
 * Read here rather than by the cell that draws them, because a `<select>` in a
 * table is drawn once per row and the categories are the same list every time:
 * one read when they change beats one read per cell. They change when this
 * refreshes, which is after every write — including the write that made a new
 * category.
 */
export const userCategoryChoices = ref<{ value: string; label: string }[]>([])

/** The stores counted, under the entity key that draws each. */
const COUNTED = {
  userCategories: stores.USER_CATEGORIES,
  userItems: stores.USER_ITEMS,
  userInventories: stores.USER_INVENTORIES,
  userInventoryLines: stores.USER_INVENTORY_LINES,
  shopLists: stores.SHOP_LISTS,
  shopListItems: stores.SHOP_LIST_ITEMS
}

/**
 * Counts all six, in one connection.
 *
 * Six `count`s rather than a cursor: these are tens of records rather than the
 * catalogue's hundreds of thousands, so the cheap call is the right one and
 * there is nothing to fold.
 *
 * Not guarded against running twice over, unlike [refreshCounts]: this is
 * called after a write, and the whole point is that the write it follows is the
 * one being counted.
 */
export async function refreshUserCounts(): Promise<void> {
  const db = await getDbConnection()
  try {
    const counted: Record<string, number | undefined> = {}
    for (const [key, store] of Object.entries(COUNTED)) {
      counted[key] = await count(db, store)
    }
    userCounts.value = counted
    userCategoryChoices.value = [
      // Blank first: an item in none of somebody's own categories is the state
      // every item starts in, and it has to be choosable again.
      {
        value: '',
        label: 'None'
      },
      ...((await getAll<UserCategory>(db, stores.USER_CATEGORIES)) ?? []).map((category) => ({
        value: String(category.id),
        label: category.name
      }))
    ]
  } finally {
    db.close()
  }
}

/**
 * One population, written the way the rest of the wall writes one.
 *
 * Zero as an empty string, which is the rule every other card here follows —
 * except that for these types it says something slightly different. A country
 * list reading `0` would be claiming brickzuke looked and found none; a
 * shopping-list card reading nothing is saying you have not made one yet, which
 * is true and is the state most readers will first see it in.
 */
export function userPopulation(key: string): string {
  const value = userCounts.value[key]
  return value ? String(value) : ''
}
