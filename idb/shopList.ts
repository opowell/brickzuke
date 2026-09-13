/**
 * Shopping lists, and the parts on them.
 *
 * The intent to buy, held apart from the buying: a list says which parts,
 * how many, and at what price at most, and says nothing about which seller —
 * that is worked out from the lots on offer every time somebody asks, because a
 * price is true only while the lot is there. See [shopParts] for the other half.
 *
 * A list is made two ways, which is the whole of what `TODO.md` asks for:
 * empty, so somebody can type what they want; or from a set — BrickLink's or
 * one of their own, `shopListFromRecord` reading whichever store the record
 * names — which is "buy the parts in this set".
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import { getAllFromIndex, putAll } from './db'
import type { ShopList, ShopListItem } from './userTypes'
import {createRecord,
  listChildren,
  listRecords,
  removeRecord,
  removeWithChildren,
  updateRecord} from './userRecord'
import { loadInventoryLines } from './userInventory'
import { loadUserItems, userItemIdOf } from './userItem'

export const NEW_SHOP_LIST_NAME = 'New shopping list'

/**
 * One part of one BrickLink set, as it is stored.
 *
 * Declared here rather than imported from `view/stores/bricklink` so that the
 * idb layer does not reach up into the view's for a shape: this is the one
 * field of that record `shopListFromRecord` reads, and the rest of it is the
 * view's business.
 */
interface StoredSetPart {
  record: string
  quantity: number
  itemVariant?: {
    itemType?: string
    itemId?: string
    name?: string
    colorId?: string
  }
}

export async function createShopList(
  db: IDBPDatabase,
  fields: Partial<Omit<ShopList, 'id' | 'createdAt'>> = {}
): Promise<ShopList> {
  return createRecord<ShopList>(db, stores.SHOP_LISTS, {
    name: fields.name ?? NEW_SHOP_LIST_NAME,
    sourceRecord: fields.sourceRecord,
    createdAt: new Date()
  })
}

export async function updateShopList(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<ShopList, 'id'>>
): Promise<ShopList | undefined> {
  return updateRecord<ShopList>(db, stores.SHOP_LISTS, id, changes)
}

/** The list and the parts on it both — see [removeWithChildren]. */
export async function deleteShopList(db: IDBPDatabase, id: number): Promise<void> {
  return removeWithChildren(
    db,
    stores.SHOP_LISTS,
    stores.SHOP_LIST_ITEMS,
    indices.SHOP_LIST_ITEMS_BY_LIST,
    id
  )
}

export async function loadShopLists(db: IDBPDatabase): Promise<ShopList[]> {
  return listRecords<ShopList>(db, stores.SHOP_LISTS)
}

export async function loadShopListItems(
  db: IDBPDatabase,
  listId: number
): Promise<ShopListItem[]> {
  return listChildren<ShopListItem>(db, indices.SHOP_LIST_ITEMS_BY_LIST, listId)
}

export async function loadShopList(
  db: IDBPDatabase,
  id: number
): Promise<(ShopList & { items: ShopListItem[] }) | undefined> {
  const list = (await loadShopLists(db)).find((held) => held.id === id)
  if (!list) {
    return undefined
  }
  return {
    ...list,
    items: await loadShopListItems(db, id)
  }
}

export async function addShopListItem(
  db: IDBPDatabase,
  listId: number,
  fields: Partial<Omit<ShopListItem, 'id' | 'listId'>> = {}
): Promise<ShopListItem> {
  return createRecord<ShopListItem>(db, stores.SHOP_LIST_ITEMS, {
    listId,
    record: fields.record,
    colorId: fields.colorId,
    name: fields.name,
    minQuantity: fields.minQuantity ?? 1,
    maxPrice: fields.maxPrice,
    condition: fields.condition
  })
}

export async function updateShopListItem(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<ShopListItem, 'id'>>
): Promise<ShopListItem | undefined> {
  return updateRecord<ShopListItem>(db, stores.SHOP_LIST_ITEMS, id, changes)
}

export async function removeShopListItem(db: IDBPDatabase, id: number): Promise<void> {
  return removeRecord(db, stores.SHOP_LIST_ITEMS, id)
}

/**
 * The lines to write, in one transaction rather than one each.
 *
 * A set runs to hundreds of parts, and `putAll` exists for exactly this — see
 * the note on it in db.ts. The ids are the store's to assign, so nothing here
 * passes one.
 */
async function writeItems(
  db: IDBPDatabase,
  items: Omit<ShopListItem, 'id'>[]
): Promise<void> {
  await putAll(db, stores.SHOP_LIST_ITEMS, items)
}

/**
 * A list of everything in a set — the "shop parts" press on a set's inventory.
 *
 * Which store is read is which kind of set the record names. One of theirs is
 * read out of USER_INVENTORY_LINES, and the quantity carries over as
 * `minQuantity`: a set needing four of a brick is a list wanting four of it.
 *
 * BrickLink's is read out of ITEM_INVENTORIES, which is where a set's parts
 * are written when somebody opens it. So the press only says as much as has
 * been fetched: a set whose inventory has not been opened has no parts stored,
 * and this makes an empty list rather than a wrong one. Undefined where
 * nothing at all is stored, so the caller can say why instead of opening a
 * list with nothing on it.
 *
 * One line per stored part, keeping the colour, because a 2 x 4 in red and the
 * same brick in blue are two different things to buy. The item's name comes
 * along so the list reads as parts rather than as ids — nothing else on a list
 * knows what `P-3001` is called.
 */
export async function shopListFromRecord(
  db: IDBPDatabase,
  record: string,
  setName?: string
): Promise<ShopList | undefined> {
  const ownId = userItemIdOf(record)
  if (ownId !== undefined) {
    const lines = await loadInventoryLines(db, record)
    if (!lines.length) {
      return undefined
    }
    const name = setName || (await loadUserItems(db)).find((item) => item.id === ownId)?.name
    const list = await createShopList(db, {
      name: 'Parts for ' + (name || record),
      sourceRecord: record
    })
    await writeItems(
      db,
      lines.map((line) => ({
        listId: list.id,
        record: line.part,
        colorId: line.colorId,
        name: line.name,
        minQuantity: line.quantity
      }))
    )
    return list
  }

  const parts =
    (await getAllFromIndex<StoredSetPart>(db, indices.ITEM_INVENTORIES_BY_RECORD, record)) ?? []
  if (!parts.length) {
    return undefined
  }
  const list = await createShopList(db, {
    name: 'Parts for ' + (setName || record),
    sourceRecord: record
  })
  await writeItems(
    db,
    parts.map((part) => ({
      listId: list.id,
      // The part's own record, built the way every table here builds one — the
      // type letter, a dash, the number. `part.record` is the *set*, this
      // being a row of that set's inventory, so it is not the field wanted.
      record:
        part.itemVariant?.itemType && part.itemVariant?.itemId
          ? `${part.itemVariant.itemType}-${part.itemVariant.itemId}`
          : undefined,
      colorId: part.itemVariant?.colorId,
      name: part.itemVariant?.name,
      minQuantity: part.quantity
    }))
  )
  return list
}
