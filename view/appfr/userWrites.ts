/**
 * Making, changing and deleting a record of somebody's own, from the shell.
 *
 * The three gestures the shell offers a host and applies none of itself: it
 * draws `+ New…` on the bar over a type that names `create` and reports the
 * press; it offers ticks and a `Delete` for a type that names `delete` and
 * reports the selection; and it hands a cell to a component of the host's own,
 * which is where an edit comes from. This is the other side of all three, and
 * the one place brickzuke writes anything somebody typed.
 *
 * Every write ends in [refreshUserCounts], which is what puts the new row's
 * count on the bar, and most end in a tick of [userRevision], which is what
 * makes the row itself appear — see the note there.
 */
import type { EntitySchema, Selection, ShellRow } from 'header-content-layout'
import type { IDBPDatabase } from 'idb'
import { ref } from 'vue'
import { getDbConnection } from '../../idb/idb'
import { refreshUserCounts } from './userCounts'
import {createUserCategory,
  deleteUserCategory,
  updateUserCategory,
  userCategoryIdOf} from '../../idb/userCategory'
import {createUserItem,
  deleteUserItem,
  updateUserItem,
  userItemIdOf} from '../../idb/userItem'
import {addInventoryLine,
  removeInventoryLine,
  updateInventoryLine} from '../../idb/userInventory'
import {addShopListItem,
  createShopList,
  deleteShopList,
  removeShopListItem,
  shopListFromRecord,
  updateShopList,
  updateShopListItem} from '../../idb/shopList'
import {createCart,
  deleteCart,
  removeCartLine,
  setCartLine,
  setCartLines,
  updateCart,
  updateCartLine} from '../../idb/cart'
import type { CartLot } from '../../idb/cart'
import { cartDraft, cartSelection, dropDraft, resetDraft } from './cartDraft'
import { setPriceModifier } from '../../idb/priceModifier'
import {createPriceModifierProfile,
  deletePriceModifierProfile,
  updatePriceModifierProfile} from '../../idb/priceModifierProfile'
import { MODIFIED } from './priceModifiers'
import { forgetPlan } from './shopPlan'
import { forgetCatalogRows } from './catalogRows'
import { forgetPartCounts } from './partCounts'
import { activeCart, activeCartId, activeProfile, activeProfileId } from './settings'

/**
 * How many times a table of theirs has been written under the shell.
 *
 * The table is re-read when this moves: [ItemsShell] hands the shell a fresh
 * source for every tick of it, and a new source is one of the three things
 * the shell re-runs a query for. The schema is not one of them — appfr 0.27.4
 * stopped a schema rebuild from restarting a stream in flight, brickzuke's
 * being rebuilt on every count anywhere on the page — so the count a write
 * puts on the bar through [refreshUserCounts] no longer brings the row with
 * it, and a `+ New…` that moved the count from 7 to 8 over a table still
 * showing 7 rows is what this was added for.
 *
 * Ticked by every write made *on* a table of theirs — a record made, unmade or
 * typed into — and not by the two made from a cell on a catalogue table: the
 * cart's quantity box on the lots and a factor on the eight tables that carry
 * one. There the cell holds what was typed, the rest of the row is unchanged,
 * and the table under it is the very stream a re-run would restart.
 */
export const userRevision = ref(0)

/**
 * One connection per write, opened and closed — as every reader here does.
 *
 * `touches` says which type the write is to, for the one held answer a user
 * write can leave stale. The categories table is read once and held, being a
 * couple of thousand records joined — and somebody's own categories are rows
 * of it, and an item's category is counted on it. So a write to either drops
 * that answer; a write to anything else leaves it, the join being worth not
 * paying for a renamed shopping list.
 *
 * `rereads` is whether the table on screen is re-read afterwards — see
 * [userRevision] for which writes say no.
 */
async function writing<T>(
  touches: string,
  write: (db: IDBPDatabase) => Promise<T>,
  rereads = true
): Promise<T> {
  const db = await getDbConnection()
  try {
    return await write(db)
  } finally {
    db.close()
    if (touches === 'categories' || touches === 'items') {
      forgetCatalogRows()
    }
    // A factor is a field on the row it is on, and three of the tables it
    // can be on are held — so a modifier written drops them too, or the box
    // would read the old factor the next time the table was opened. As does
    // a profile deleted, which may have been the one whose factors they show.
    if (touches === 'priceModifiers' || touches === 'priceModifierProfiles') {
      forgetCatalogRows()
    }
    // A part added to a set of theirs is a number on that set's row of the
    // items table, and the pass that counts them is held for the session.
    if (touches === 'inventory' || touches === 'items') {
      forgetPartCounts()
    }
    // The plan is worked out from the lots against a list, so any change to a
    // list is a plan that no longer describes it.
    forgetPlan()
    await refreshUserCounts()
    // After the counts, so the re-read finds them already in hand.
    if (rereads) {
      userRevision.value++
    }
  }
}

/**
 * Whether a row is one somebody may write to.
 *
 * Every row built by [userRows] says so in `own`, and so does a category of
 * theirs in the catalogue's own categories table — which is the case this
 * exists for: that table mixes rows nobody can change with rows somebody can,
 * and the same column draws both. A cell reads this and offers a box on one
 * and plain text on the other.
 */
export function writableRow(row: ShellRow): boolean {
  return row.fields.own === true
}

/**
 * Which record a row is, for the two writes that are given one.
 *
 * The numeric key rather than the row's `id`, which the shell requires to be a
 * string — and for `shopStores` is not a key at all.
 */
export function recordId(fields: Record<string, unknown>): number | undefined {
  // An item of theirs is keyed by its record on the items table, `U-3`, so
  // the key is read out of it; everything else of theirs carries the number.
  const own = userItemIdOf(fields.id)
  if (own !== undefined) {
    return own
  }
  const id = Number(fields.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

/**
 * The id in the URL that a detail type belongs to — which list's parts are up.
 *
 * Read off the expression rather than passed in, because that is where the
 * shell keeps it: opening a detail type states the term, and a new line has to
 * go under the record the table is already showing.
 */
export function openedId(expr: string, field: string): number | undefined {
  const found = new RegExp(`${field}:"?(\\d+)"?`).exec(expr)
  const id = found ? Number(found[1]) : NaN
  return Number.isFinite(id) && id > 0 ? id : undefined
}

/** The set of theirs whose parts are up — `record:"U-3"` — or nothing. */
export function openedOwnSet(expr: string): string | undefined {
  const found = /record:"?(U-\d+)"?/.exec(expr)
  return found && userItemIdOf(found[1]) !== undefined ? found[1] : undefined
}

/**
 * A blank record of whatever type the press came from.
 *
 * Blank, and not a dialog asking what to call it first: the name is a cell in
 * the table the press was made from, so the row arrives ready to be typed over
 * — which is one gesture rather than two, and is how [CellSetting] already
 * treats a value somebody owns.
 *
 * A detail type makes its record under the one in the URL, and makes nothing at
 * all when the URL names none: a line with no inventory is a line nothing can
 * ever show.
 */
export async function createRecordFor(entity: EntitySchema, expr: string): Promise<void> {
  await writing(entity.key, async (db) => {
    switch (entity.key) {
      // The one catalogue type that can be added to: what is made is a
      // category of theirs, which is a row of that same table.
      case 'categories':
        return void (await createUserCategory(db))
      // Likewise: a new item of theirs is a row of the catalogue's items.
      case 'items':
        return void (await createUserItem(db))
      case 'shopLists':
        return void (await createShopList(db))
      case 'carts':
        return void (await createCart(db))
      case 'priceModifierProfiles':
        return void (await createPriceModifierProfile(db))
      // A part goes under the set whose parts are on screen, and only where
      // that set is theirs: nothing can be added to what BrickLink states.
      case 'inventory': {
        const record = openedOwnSet(expr)
        return record ? void (await addInventoryLine(db, record)) : undefined
      }
      case 'shopListItems': {
        const listId = openedId(expr, 'shoplist')
        return listId ? void (await addShopListItem(db, listId)) : undefined
      }
      default:
        return undefined
    }
  })
}

/**
 * The keys of the ticked records that are somebody's to delete.
 *
 * On a type of their own every id is a key. On the three catalogue tables that
 * list theirs beside BrickLink's, the ticks can land on BrickLink's rows as
 * well, which are not theirs and must not go — so only the ids that read as
 * one of theirs are taken, and the rest are left exactly as they were. A
 * category of theirs is keyed by the negative of its id, an item by its
 * `U-3` record, and a part of one of their sets by its plain key, where a
 * part of BrickLink's is keyed `S-10511-1|3001-5` and never reads as a number.
 */
function ownIds(key: string | undefined, ids: string[]): number[] {
  const keys =
    key === 'categories'
      ? ids.flatMap((id) => {
        const own = userCategoryIdOf(id)
        return own === undefined ? [] : [own]
      })
      : key === 'items'
        ? ids.flatMap((id) => {
          const own = userItemIdOf(id)
          return own === undefined ? [] : [own]
        })
        : key === 'inventory'
          ? ids.flatMap((id) => (/^\d+$/.test(id) ? [Number(id)] : []))
          : ids.map(Number)
  return keys.filter((id) => Number.isFinite(id) && id > 0)
}

/**
 * The ticked records, gone.
 *
 * A selection outlives the page it was made on, so the ids are all of it — see
 * the shell's own note on `Selection`. They are this type's keys, which is what
 * every one of these stores is keyed by.
 */
export async function deleteRecordsFor(selection: Selection): Promise<void> {
  const key = selection.entity?.key
  const ids = ownIds(key, selection.ids)
  if (!key || !ids.length) {
    return
  }
  await writing(key, async (db) => {
    for (const id of ids) {
      switch (key) {
        case 'categories':
          await deleteUserCategory(db, id)
          break
        case 'items':
          await deleteUserItem(db, id)
          break
        case 'inventory':
          await removeInventoryLine(db, id)
          break
        case 'shopLists':
          await deleteShopList(db, id)
          break
        case 'shopListItems':
          await removeShopListItem(db, id)
          break
        case 'carts':
          await deleteCart(db, id)
          // A setting naming a cart that has gone names nothing, so it is
          // cleared rather than left pointing at a key nothing will answer to.
          if (id === activeCartId()) {
            activeCart.value = ''
          }
          break
        case 'cartLines':
          await removeCartLine(db, id)
          break
        case 'priceModifierProfiles':
          await deletePriceModifierProfile(db, id)
          // As with a cart: a setting naming a profile that has gone is cleared.
          if (id === activeProfileId()) {
            activeProfile.value = ''
          }
          break
      }
    }
  })
  // The ticks on what went go with it. The shell reports the selection and
  // leaves it standing — it is the host's, bound on [ItemsShell] — and a bar
  // still reading `1 selected · Delete 1` over an empty table would be a
  // delete that looked as if it had not taken. A tick on a row that stayed,
  // BrickLink's own among theirs, stays: nothing happened to that row.
  cartSelection.value = cartSelection.value.filter((id) => !ownIds(key, [id]).length)
}

/**
 * Where a column's key is not the field on the record.
 *
 * A few of them, and all for a reason the tables cannot give up. A column a term
 * can be written against has to be lowercase, the expression parser lowercasing
 * a term's field — so the colour is `colorid` in a row and `colorId` on the
 * record. And a wanted part's `minQuantity` is drawn as `quantity`, because a
 * column headed Quantity beside one headed Quantity on the next table should
 * mean the same thing to a reader whichever table they are on.
 *
 * Per type rather than one map, `quantity` being the record's own field on an
 * inventory line and a different one on a wanted part.
 */
const FIELD_OF: Record<string, Record<string, string>> = {
  items: {
    category: 'categoryId'
  },
  inventory: {
    colorid: 'colorId'
  },
  shopListItems: {
    colorid: 'colorId',
    quantity: 'minQuantity'
  },
  cartLines: {
    colorid: 'colorId'
  }
}

/**
 * One field of one record, as the cell that drew it hands it over.
 *
 * The field is the column's own key, so a column and the thing it writes cannot
 * drift apart: a cell that draws `name` writes `name`. The two columns whose
 * key is not the record's own field are named above.
 */
export async function writeField(
  entityKey: string,
  id: number,
  field: string,
  value: unknown
): Promise<void> {
  await writing(entityKey, async (db) => {
    const changes = {
      [FIELD_OF[entityKey]?.[field] ?? field]: value
    }
    switch (entityKey) {
      case 'categories':
        return void (await updateUserCategory(db, id, changes))
      case 'items':
        return void (await updateUserItem(db, id, changes))
      case 'inventory':
        return void (await updateInventoryLine(db, id, changes))
      case 'shopLists':
        return void (await updateShopList(db, id, changes))
      case 'shopListItems':
        return void (await updateShopListItem(db, id, changes))
      case 'carts':
        return void (await updateCart(db, id, changes))
      case 'cartLines':
        return void (await updateCartLine(db, id, changes))
      case 'priceModifierProfiles':
        return void (await updatePriceModifierProfile(db, id, changes))
      default:
        return undefined
    }
  })
}

/**
 * The quantity box on a lot: this many of it in the active cart.
 *
 * The lot's row is what the box has, so the line is written from it — the
 * fields under the names the lots table carries them, which are the names
 * [toStoreInventoryRow] and [toStoreLotRow] both write. Held to what the
 * seller has, the box's own `max` notwithstanding: a number typed past it
 * still arrives here. Nothing is written where no cart is active, the box
 * being disabled then and this being the guard behind it.
 */
export async function setCartQuantity(
  lot: Record<string, unknown>,
  quantity: number
): Promise<void> {
  const cartId = activeCartId()
  const lotId = String(lot.id ?? '')
  if (!cartId || !lotId) {
    return
  }
  const available = Number(lot.quantity)
  const held = Number.isFinite(available) && available > 0 ? Math.min(quantity, available) : quantity
  // What was typed is the word for this lot: a proposal the header made for it
  // is dropped, and the box shows what it wrote.
  dropDraft(lotId)
  await writing('cartLines', (db) => setCartLine(db, cartId, cartLotOf(lot), held), false)
}

/**
 * Apply, over the Cart column: every figure the draft proposes, written.
 *
 * One transaction for the puts — see [setCartLines] — because a seller's
 * whole inventory is what the draft most often holds. Held to what each
 * seller has, as a typed figure is. The draft is dropped once written, so
 * the boxes go back to reading the cart, which now says the same thing.
 */
export async function applyCartDraft(): Promise<void> {
  const cartId = activeCartId()
  if (!cartId || !cartDraft.value.size) {
    return
  }
  const changes = Array.from(cartDraft.value.values()).map(({
    fields, quantity
  }) => {
    const available = Number(fields.quantity)
    return {
      lot: cartLotOf(fields),
      quantity: Number.isFinite(available) && available > 0 ? Math.min(quantity, available) : quantity
    }
  })
  await writing('cartLines', (db) => setCartLines(db, cartId, changes), false)
  resetDraft()
}

/** What a line keeps of the lot, read off the lot's row. */
function cartLotOf(lot: Record<string, unknown>): CartLot {
  const text = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
  const available = Number(lot.quantity)
  const price = Number(lot.priceValue)
  return {
    lotId: String(lot.id ?? ''),
    store: text(lot.store) ?? '',
    storeName: text(lot.storeName),
    record: text(lot.record),
    name: text(lot.itemName),
    colorId: text(lot.colorid),
    colorName: text(lot.colorName),
    condition: text(lot.condition),
    price: Number.isFinite(price) ? price : undefined,
    displayPrice: text(lot.price),
    nativePrice: text(lot.nativePrice),
    available: Number.isFinite(available) && available > 0 ? available : undefined
  }
}

/**
 * The factor box on a row of one of the modifiable tables: this factor on
 * every lot of it, in the active profile, or none.
 *
 * The row is what the box has, so the modifier is keyed off it: the table it
 * is a row of, and the key that table's own scope field carries — see
 * [MODIFIED]. Nothing is written for a row of any other table, or a row that
 * carries no key; blank takes the factor off.
 *
 * Into the active profile — and where none is active, into one made here and
 * made active, rather than nowhere. The cart's box is disabled with no cart
 * chosen, because a lot put in a cart nobody named could be an order nobody
 * meant; a factor typed with no profile is not ambiguous like that. The
 * profile is only the shelf the factor sits on, and the shelf can be made.
 * Blank with no profile writes nothing, there being nothing to take off.
 */
export async function setPriceModifierFor(
  entityKey: string,
  fields: Record<string, unknown>,
  factor: number | undefined
): Promise<void> {
  const on = MODIFIED[entityKey]?.on
  const key = on === undefined ? undefined : fields[on]
  if (key === undefined || key === null || key === '') {
    return
  }
  const held = activeProfileId()
  if (held === undefined && factor === undefined) {
    return
  }
  await writing('priceModifiers', async (db) => {
    const profileId = held ?? (await createPriceModifierProfile(db)).id
    const written = await setPriceModifier(db, profileId, entityKey, String(key), factor)
    // Made active only once the factor is in it, and only where it took: a
    // refused factor with no profile leaves no profile behind. The setting is
    // watched, and setting it re-runs the refresh this write ends in — twice
    // over, once here and once for the write, which is cheap and harmless.
    if (held === undefined && written) {
      activeProfile.value = String(profileId)
    }
  }, false)
}

/**
 * "Shop parts" on a set — BrickLink's or one of theirs: a list of everything
 * in it, and the plan for buying it.
 *
 * Gives back the list's id so the caller can open it, and nothing where the
 * set has no parts stored — a list with nothing on it would read as a set with
 * nothing in it. See [shopListFromRecord].
 */
export async function shopPartsOf(record: string, setName?: string): Promise<number | undefined> {
  // No re-read: the press is made on the set's inventory, which the list
  // changes nothing on, and leaves it for the plan the moment this returns.
  return writing('shopLists', async (db) => (await shopListFromRecord(db, record, setName))?.id, false)
}
