/**
 * The records somebody owns, as rows.
 *
 * The sibling of [catalogRows], which turns the catalogue's own stores into
 * rows, and it does the same job under the same rules: one `fields` bag per
 * record, keyed by the names the columns read, with any field a term can be
 * written against lowercased and held as a number — the parser lowercases a
 * term's field, and `:` compares numbers exactly where it substring-matches
 * strings.
 *
 * Every one of these is read fresh. They change because somebody just changed
 * one, so a held answer would be the table before the edit — the third reason
 * [catalogRows] gives for a live loader, and the only reason here.
 *
 * Every row here carries `own: true`. It is what the writing cells read to
 * know they may write — a table can mix these rows with the catalogue's, as
 * the categories table does, and a box must not be offered on a row nobody
 * can change. See [writableRow].
 *
 * The counts on a parent row — how many parts an inventory has, how many pieces
 * a list wants — are read off the children rather than stored on the parent. A
 * number kept in two places is a number that can disagree with itself, and
 * these are tens of records: the indexed read that answers "what is in this" is
 * the same read the detail table makes.
 */
import type { ShellRow } from 'header-content-layout'
import type { IDBPDatabase } from 'idb'
import { getAll } from '../../idb/db'
import stores from '../../idb/stores'
import type {Cart,
  CartLine,
  PriceModifier,
  PriceModifierProfile,
  ShopList,
  ShopListItem,
  UserCategory,
  UserInventoryLine,
  UserItem} from '../../idb/userTypes'
import type {BrickLinkCategory,
  BrickLinkColor} from '../stores/bricklink/catalog-download-page'
import { userCategoryIdOf, userCategoryRef } from '../../idb/userCategory'
import { userItemIdOf, userItemRecord } from '../../idb/userItem'
import { loadAllInventoryLines, loadInventoryLines } from '../../idb/userInventory'
import { loadShopListItems } from '../../idb/shopList'
import { loadCartLines } from '../../idb/cart'
import { planFor } from './shopPlan'
import { activeCartId, activeProfileId } from './settings'

/** Newest first, as [listRecords] hands them over and for the same reason. */
function newestFirst<T extends { id: number }>(records: T[]): T[] {
  return records.slice().sort((a, b) => b.id - a.id)
}

async function held<T extends { id: number }>(
  db: IDBPDatabase,
  store: (typeof stores)[keyof typeof stores]
): Promise<T[]> {
  return newestFirst(((await getAll<T>(db, store)) ?? []).filter((record) => record.id !== undefined))
}

/**
 * The date a record was made, as the shell's `date` kind wants it.
 *
 * Stored as a `Date`, which survives IndexedDB intact — but a record written
 * before the field existed has none, and an ISO string is what the column
 * formats.
 */
function made(createdAt: unknown): string | undefined {
  return createdAt instanceof Date ? createdAt.toISOString() : undefined
}

/**
 * What each category is called, by the number an item names it with — theirs
 * by the negative id, BrickLink's by its own. One map, because the item holds
 * one field: see [userCategoryRef].
 *
 * BrickLink's names are read off the download records directly rather than
 * through [loadCategories], which joins them by brickzuke's key; an item names
 * a category by BrickLink's, which is what the record itself carries.
 */
async function categoryNames(db: IDBPDatabase): Promise<Map<number, string>> {
  const names = new Map<number, string>()
  for (const record of (await getAll<BrickLinkCategory>(db, stores.BRICK_LINK_CATEGORIES)) ?? []) {
    const id = Number(record.categoryId)
    if (Number.isFinite(id) && !names.has(id)) {
      names.set(id, record['Category Name'])
    }
  }
  for (const category of (await getAll<UserCategory>(db, stores.USER_CATEGORIES)) ?? []) {
    names.set(userCategoryRef(category.id), category.name)
  }
  return names
}

/**
 * Somebody's own items, as rows of the catalogue's `items` table.
 *
 * The same fields under the same names, so the one table draws both and one
 * `name:` or `category:` term narrows both — and the two the catalogue's rows
 * have no use for: `own`, which the writing cells read, and `ownName`, the
 * name without the record after it, which is what the box holds. `name` keeps
 * the `(U-3)` suffix a catalogue row carries, because that is what a set's
 * parts lead back to their item by: `narrowToItem` writes `name:"(P-3001)"`.
 *
 * Type `U`, which is the record's own letter and no type of BrickLink's — so
 * a reader sees at once which rows are theirs, and `type:"U"` is the term
 * that lists them alone.
 */
export async function userItemRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const items = await held<UserItem>(db, stores.USER_ITEMS)
  const names = await categoryNames(db)
  const lines = await loadAllInventoryLines(db)
  return items.map((item) => {
    const record = userItemRecord(item.id)
    const own = lines.filter((line) => line.record === record)
    return {
      id: record,
      entityKey: 'items',
      entityLabel: 'Items',
      fields: {
        id: record,
        own: true,
        record,
        name: `${item.name} (${record})`,
        ownName: item.name,
        type: 'U',
        typeId: 'U',
        note: item.note,
        // The one field, under the name every item row carries its category in
        // — so `category:` narrows theirs and the catalogue's alike.
        category: item.categoryId,
        // The name where the category is still there, and nothing where it is
        // not: deleting a grouping does not delete what was grouped, so a row
        // naming a category that has gone is drawn without one.
        categoryName: item.categoryId === undefined ? undefined : names.get(item.categoryId),
        ownCategory: userCategoryIdOf(item.categoryId) !== undefined,
        // How many pieces, counted the way a BrickLink set's are, and absent
        // rather than nought for an item with nothing under it — a piece of
        // theirs is not a set with no parts.
        parts: own.length ? own.reduce((sum, line) => sum + (line.quantity ?? 0), 0) : undefined,
        created: made(item.createdAt)
      }
    }
  })
}

/**
 * What each BrickLink colour is called, by its own id — what a line holds.
 *
 * Read off the download records directly, as [categoryNames] reads the
 * categories: the line carries BrickLink's id, which is what the record itself
 * carries.
 */
async function colorNames(db: IDBPDatabase): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const record of (await getAll<BrickLinkColor>(db, stores.BRICK_LINK_COLORS)) ?? []) {
    if (record.colorId && !names.has(record.colorId)) {
      names.set(record.colorId, record['Color Name'])
    }
  }
  return names
}

/**
 * One part of one of somebody's own sets, as the fields a part of a BrickLink
 * set has — see [inventoryFields], whose names these are.
 *
 * The part's record is split the way a stored variant is, into the type letter
 * and the number, because that is what the Type column narrows by and what
 * `narrowToItem` leads back through. A part of theirs splits the same way —
 * `U` and `5` — and leads to their item.
 */
function userLineFields(line: UserInventoryLine, colors: Map<string, string>): Record<string, unknown> {
  const dash = line.part?.indexOf('-') ?? -1
  const type = dash > 0 ? line.part!.slice(0, dash) : undefined
  const itemId = dash > 0 ? line.part!.slice(dash + 1) : undefined
  return {
    id: line.id,
    own: true,
    record: line.record,
    part: line.part,
    type,
    itemId,
    name: line.name,
    color: line.colorId === undefined ? undefined : colors.get(line.colorId),
    colorid: line.colorId === undefined ? undefined : Number(line.colorId),
    quantity: line.quantity,
    variant: itemId && line.colorId ? `${itemId}-${line.colorId}` : undefined
  }
}

/** The lines of one set of theirs, as rows of the open set's `inventory`. */
export async function userInventoryLineRows(
  db: IDBPDatabase,
  record: string | undefined
): Promise<ShellRow[]> {
  if (!record || userItemIdOf(record) === undefined) {
    return []
  }
  const colors = await colorNames(db)
  return (await loadInventoryLines(db, record)).map((line) => ({
    id: String(line.id),
    entityKey: 'inventory',
    entityLabel: 'Inventory',
    fields: userLineFields(line, colors)
  }))
}

/** Every line of every set of theirs, as rows of `itemInventories`. */
export async function allUserInventoryLineRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const colors = await colorNames(db)
  return (await loadAllInventoryLines(db)).map((line) => ({
    id: String(line.id),
    entityKey: 'itemInventories',
    entityLabel: 'Item inventories',
    fields: userLineFields(line, colors)
  }))
}

export async function shopListRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const lists = await held<ShopList>(db, stores.SHOP_LISTS)
  const items = (await getAll<ShopListItem>(db, stores.SHOP_LIST_ITEMS)) ?? []
  return lists.map((list) => {
    const own = items.filter((item) => item.listId === list.id)
    return {
      id: String(list.id),
      entityKey: 'shopLists',
      entityLabel: 'Shopping lists',
      fields: {
        id: list.id,
        own: true,
        shoplist: list.id,
        name: list.name,
        record: list.sourceRecord,
        parts: own.length,
        pieces: own.reduce((sum, item) => sum + (item.minQuantity ?? 0), 0),
        created: made(list.createdAt)
      }
    }
  })
}

export async function shopListItemRows(
  db: IDBPDatabase,
  listId: number | undefined
): Promise<ShellRow[]> {
  if (!listId) {
    return []
  }
  const items = await loadShopListItems(db, listId)
  return items.map((item) => ({
    id: String(item.id),
    entityKey: 'shopListItems',
    entityLabel: 'Wanted parts',
    fields: {
      id: item.id,
      own: true,
      shoplist: item.listId,
      name: item.name,
      record: item.record,
      colorid: item.colorId === undefined ? undefined : Number(item.colorId),
      quantity: item.minQuantity,
      maxPrice: item.maxPrice,
      // BrickLink's own code, which is what the conditions table is keyed by
      // and so what a `condition:` term compares against — and the name after
      // it, which is what the cell shows.
      condition: item.condition,
      conditionName: item.condition === 'N' ? 'New' : item.condition === 'U' ? 'Used' : undefined
    }
  }))
}

/** What each wanted part would cost, and from whom. */
export async function shopPlanRows(listId: number | undefined): Promise<ShellRow[]> {
  if (!listId) {
    return []
  }
  const plan = await planFor(listId)
  return plan.lines.map((line) => ({
    id: line.key,
    entityKey: 'shopPlan',
    entityLabel: 'Shop parts',
    fields: {
      id: line.key,
      shoplist: listId,
      name: line.name,
      record: line.record,
      colorid: line.colorId === undefined ? undefined : Number(line.colorId),
      wanted: line.wanted,
      covered: line.covered,
      short: line.short,
      // Said in words rather than as the code, this being a cell somebody
      // reads and acts on — see [shortfallFor] for what each of them means.
      shortfall: SHORTFALL[line.shortfall ?? ''] ,
      offers: line.offers,
      store: line.store,
      storeName: line.storeName,
      country: line.country,
      countryName: line.countryName,
      priceValue: line.price,
      cost: line.cost
    }
  }))
}

/** Why a line fell short, in the words the table shows. */
const SHORTFALL: Record<string, string | undefined> = {
  own: 'Yours — not for sale',
  none: 'Nobody has it',
  price: 'Over your limit',
  quantity: 'Not enough'
}

/**
 * What the whole list would cost from each seller — the answer to "compare this
 * across a variety of sellers", which is the question the parts table does not
 * answer: that one buys every line wherever it is cheapest, which is forty
 * sellers and forty lots of postage.
 */
export async function shopStoreRows(listId: number | undefined): Promise<ShellRow[]> {
  if (!listId) {
    return []
  }
  const plan = await planFor(listId)
  return plan.stores.map((store) => ({
    id: store.store,
    entityKey: 'shopStores',
    entityLabel: 'Shop sellers',
    fields: {
      id: store.store,
      shoplist: listId,
      store: store.store,
      storeName: store.storeName ?? store.store,
      country: store.country,
      countryName: store.countryName,
      lines: store.lines,
      quantity: store.quantity,
      short: store.short,
      cost: store.cost
    }
  }))
}

/** What a line comes to — its price times how many, or nothing without a price. */
function lineCost(line: CartLine): number | undefined {
  return line.price === undefined ? undefined : line.price * line.quantity
}

/**
 * Somebody's carts, each with what it holds summed off its lines — as the
 * shopping lists are, and for the reason at the top.
 *
 * `active` says which one the setting names, so the table can show it and
 * offer the others: the same fact the settings table states, read where the
 * carts are.
 */
export async function cartRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const carts = await held<Cart>(db, stores.CARTS)
  const lines = (await getAll<CartLine>(db, stores.CART_LINES)) ?? []
  const active = activeCartId()
  return carts.map((cart) => {
    const own = lines.filter((line) => line.cartId === cart.id)
    const priced = own.filter((line) => line.price !== undefined)
    return {
      id: String(cart.id),
      entityKey: 'carts',
      entityLabel: 'Carts',
      fields: {
        id: cart.id,
        own: true,
        cart: cart.id,
        name: cart.name,
        active: cart.id === active,
        lots: own.length,
        pieces: own.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
        // How many sellers the cart would be orders to, which is what a cart
        // of lots costs in postage before it costs anything in parts.
        sellers: new Set(own.map((line) => line.store)).size,
        // Summed over the lines that carry a price, and absent where none do:
        // a cart of unpriced lots is not a cart costing nothing.
        cost: priced.length ? priced.reduce((sum, line) => sum + lineCost(line)!, 0) : undefined,
        created: made(cart.createdAt)
      }
    }
  })
}

/**
 * The lots in one cart, under the names the lots table carries the same facts
 * in — `itemName`, `storeName`, `priceValue` — so a reader moving between the
 * two tables meets one vocabulary, and a `store:` or `record:` term narrows
 * both alike.
 */
export async function cartLineRows(
  db: IDBPDatabase,
  cartId: number | undefined
): Promise<ShellRow[]> {
  if (!cartId) {
    return []
  }
  return (await loadCartLines(db, cartId)).map((line) => ({
    id: String(line.id),
    entityKey: 'cartLines',
    entityLabel: 'Cart lines',
    fields: {
      id: line.id,
      own: true,
      cart: line.cartId,
      lot: line.lotId,
      record: line.record,
      itemName: line.name,
      colorName: line.colorName,
      colorid: line.colorId === undefined ? undefined : Number(line.colorId),
      store: line.store,
      storeName: line.storeName ?? line.store,
      condition: line.condition,
      conditionName: line.condition === 'N' ? 'New' : line.condition === 'U' ? 'Used' : undefined,
      // The three the price cell reads — the number it draws, and the two
      // printed figures it puts on the hover.
      priceValue: line.price,
      price: line.displayPrice,
      nativePrice: line.nativePrice,
      quantity: line.quantity,
      available: line.available,
      cost: lineCost(line)
    }
  }))
}

/**
 * Somebody's price modifier profiles, each with how many factors it holds
 * counted off the modifiers — and which one is in force, read off the setting
 * the way a cart's `active` is.
 *
 * The factors themselves are not a table: each is a box on the row it is on,
 * in the colours, sellers, categories and the rest — see [CellPriceModifier] —
 * so the count is what a profile's row can say about them.
 */
export async function priceModifierProfileRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const profiles = await held<PriceModifierProfile>(db, stores.PRICE_MODIFIER_PROFILES)
  const modifiers = (await getAll<PriceModifier>(db, stores.PRICE_MODIFIERS)) ?? []
  const active = activeProfileId()
  return profiles.map((profile) => ({
    id: String(profile.id),
    entityKey: 'priceModifierProfiles',
    entityLabel: 'Price modifier profiles',
    fields: {
      id: profile.id,
      own: true,
      profile: profile.id,
      name: profile.name,
      active: profile.id === active,
      modifiers: modifiers.filter((modifier) => modifier.profileId === profile.id).length,
      created: made(profile.createdAt)
    }
  }))
}
