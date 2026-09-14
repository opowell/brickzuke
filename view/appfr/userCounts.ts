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
import { ref, watch } from 'vue'
import { count, getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import stores from '../../idb/stores'
import type { Cart, UserCategory } from '../../idb/userTypes'
import type { BrickLinkCategory } from '../stores/bricklink/catalog-download-page'
import { userCategoryRef } from '../../idb/userCategory'
import { refreshActiveCartLines } from './activeCart'
import { refreshPriceModifiers } from './priceModifiers'
import { activeCart } from './settings'

/** The populations, by the entity key each is drawn under. */
export const userCounts = ref<Record<string, number | undefined>>({})

/**
 * Every category an item of theirs may be filed under, as the choices a picker
 * offers: theirs first, then BrickLink's by name.
 *
 * Read here rather than by the cell that draws them, because a `<select>` in a
 * table is drawn once per row and the categories are the same list every time:
 * one read when they change beats one read per cell. They change when this
 * refreshes, which is after every write — including the write that made a new
 * category.
 *
 * The value is the number the item's field holds — see [userCategoryRef] for
 * why one of theirs is the negative of its id — as a string, a `<select>`
 * holding nothing else.
 */
export const categoryChoices = ref<{ value: string; label: string }[]>([])

/**
 * Every cart, as the choices the active-cart setting's picker offers — newest
 * first, as the carts table lists them. Read here for the reason the
 * categories are: they change when this refreshes, which is after every write,
 * including the one that made a new cart.
 */
export const cartChoices = ref<{ value: string; label: string }[]>([])

/** The stores counted, under the entity key that draws each. */
const COUNTED = {
  userCategories: stores.USER_CATEGORIES,
  userItems: stores.USER_ITEMS,
  userInventoryLines: stores.USER_INVENTORY_LINES,
  shopLists: stores.SHOP_LISTS,
  shopListItems: stores.SHOP_LIST_ITEMS,
  carts: stores.CARTS,
  cartLines: stores.CART_LINES
}

/**
 * Counts them all, in one connection.
 *
 * One `count` each rather than a cursor: these are tens of records rather than
 * the catalogue's hundreds of thousands, so the cheap call is the right one
 * and there is nothing to fold.
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
    const own = ((await getAll<UserCategory>(db, stores.USER_CATEGORIES)) ?? []).map(
      (category) => ({
        value: String(userCategoryRef(category.id)),
        label: category.name
      })
    )
    // BrickLink's, once each by its own id — the download lists a category
    // once per item type it sits under, and a picker wants it once.
    const seen = new Set<number>()
    const catalogue: { value: string; label: string }[] = []
    for (const record of (await getAll<BrickLinkCategory>(db, stores.BRICK_LINK_CATEGORIES)) ?? []) {
      const id = Number(record.categoryId)
      if (!Number.isFinite(id) || seen.has(id)) {
        continue
      }
      seen.add(id)
      catalogue.push({
        value: String(id),
        label: record['Category Name']
      })
    }
    catalogue.sort((a, b) => a.label.localeCompare(b.label))
    categoryChoices.value = [
      // Blank first: an item in no category is the state every item starts in,
      // and it has to be choosable again.
      {
        value: '',
        label: 'None'
      },
      ...own,
      ...catalogue
    ]
    cartChoices.value = ((await getAll<Cart>(db, stores.CARTS)) ?? [])
      .sort((a, b) => b.id - a.id)
      .map((cart) => ({
        value: String(cart.id),
        label: cart.name
      }))
    // And what the active cart holds, which every lot's row reads — see
    // [activeCart]. In the same connection, and before the counts land, so the
    // query they re-run finds the lines already in hand.
    await refreshActiveCartLines(db)
    // And the price modifiers, which every lot's row reads for the same
    // reason — see [priceModifiers].
    await refreshPriceModifiers(db)
    userCounts.value = counted
  } finally {
    db.close()
  }
}

/*
 * A different cart made active is a different answer on every lot's row, and
 * nothing was written to bring it about — so the setting is watched, and the
 * same refresh runs: the lines are re-read, and assigning the counts is what
 * re-runs the query over them.
 */
watch(activeCart, () => {
  void refreshUserCounts()
})

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
