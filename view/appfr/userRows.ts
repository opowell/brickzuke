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
import type {ShopList,
  ShopListItem,
  UserCategory,
  UserInventory,
  UserInventoryLine,
  UserItem} from '../../idb/userTypes'
import { loadInventoryLines } from '../../idb/userInventory'
import { loadShopListItems } from '../../idb/shopList'
import { planFor } from './shopPlan'

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

export async function userCategoryRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const categories = await held<UserCategory>(db, stores.USER_CATEGORIES)
  const items = (await getAll<UserItem>(db, stores.USER_ITEMS)) ?? []
  return categories.map((category) => ({
    id: String(category.id),
    entityKey: 'userCategories',
    entityLabel: 'My categories',
    fields: {
      id: category.id,
      // The field a user item carries this category's id in, and so this
      // type's scope: pressing a row narrows every table to the records under
      // it, and the header reads the term back through here to put the name to
      // the number.
      usercategory: category.id,
      name: category.name,
      items: items.filter((item) => item.userCategoryId === category.id).length,
      created: made(category.createdAt)
    }
  }))
}

export async function userItemRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const items = await held<UserItem>(db, stores.USER_ITEMS)
  const categories = new Map(
    ((await getAll<UserCategory>(db, stores.USER_CATEGORIES)) ?? []).map((category) => [
      category.id,
      category.name
    ])
  )
  return items.map((item) => ({
    id: String(item.id),
    entityKey: 'userItems',
    entityLabel: 'My items',
    fields: {
      id: item.id,
      useritem: item.id,
      name: item.name,
      note: item.note,
      usercategory: item.userCategoryId,
      // The name where the category is still there, and nothing where it is
      // not: deleting a grouping does not delete what was grouped, so a row
      // naming a category that has gone is drawn without one.
      usercategoryName:
        item.userCategoryId === undefined ? undefined : categories.get(item.userCategoryId),
      category: item.categoryId,
      created: made(item.createdAt)
    }
  }))
}

export async function userInventoryRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const inventories = await held<UserInventory>(db, stores.USER_INVENTORIES)
  const lines = (await getAll<UserInventoryLine>(db, stores.USER_INVENTORY_LINES)) ?? []
  return inventories.map((inventory) => {
    const own = lines.filter((line) => line.inventoryId === inventory.id)
    return {
      id: String(inventory.id),
      entityKey: 'userInventories',
      entityLabel: 'My inventories',
      fields: {
        id: inventory.id,
        userinventory: inventory.id,
        name: inventory.name,
        // The BrickLink set this is about, where it is about one. Under the
        // same name every other table holds a record in, so a press on it
        // leads where a record leads everywhere else.
        record: inventory.record,
        // How many different parts, and how many pieces in all — the two
        // numbers a set is described by, and the pair `shopLists` also draws.
        parts: own.length,
        pieces: own.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
        created: made(inventory.createdAt)
      }
    }
  })
}

/** The lines of one inventory — the type declared only while one is open. */
export async function userInventoryLineRows(
  db: IDBPDatabase,
  inventoryId: number | undefined
): Promise<ShellRow[]> {
  if (!inventoryId) {
    return []
  }
  const lines = await loadInventoryLines(db, inventoryId)
  return lines.map((line) => ({
    id: String(line.id),
    entityKey: 'userInventoryLines',
    entityLabel: 'Inventory parts',
    fields: {
      id: line.id,
      userinventory: line.inventoryId,
      name: line.name,
      record: line.record,
      colorid: line.colorId === undefined ? undefined : Number(line.colorId),
      quantity: line.quantity
    }
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
