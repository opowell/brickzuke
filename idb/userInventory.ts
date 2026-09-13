/**
 * Sets of somebody's own, and what is in them.
 *
 * The same question ITEM_INVENTORIES answers for a BrickLink set — what is this
 * made of — over an inventory a reader wrote instead. Two stores rather than
 * one, and joined through USER_INVENTORY_LINES_BY_INVENTORY the way
 * [loadCategory] joins through BRICK_LINK_CATEGORIES_BY_CATEGORY_ID: one
 * indexed lookup answers "what is in this".
 *
 * A line names its part by BrickLink's own record — `P-3001` — where the part
 * is one the catalogue lists, and by a [UserItem] id where it is not. Holding
 * the record rather than brickzuke's key is what lets the planner match the
 * line against the lots on offer, every one of which carries the same field.
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import type { UserInventory, UserInventoryLine } from './userTypes'
import {createRecord,
  listChildren,
  listRecords,
  removeRecord,
  removeWithChildren,
  updateRecord} from './userRecord'

export const NEW_USER_INVENTORY_NAME = 'New inventory'

export async function createUserInventory(
  db: IDBPDatabase,
  fields: Partial<Omit<UserInventory, 'id' | 'createdAt'>> = {}
): Promise<UserInventory> {
  return createRecord<UserInventory>(db, stores.USER_INVENTORIES, {
    name: fields.name ?? NEW_USER_INVENTORY_NAME,
    record: fields.record,
    createdAt: new Date()
  })
}

export async function updateUserInventory(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<UserInventory, 'id'>>
): Promise<UserInventory | undefined> {
  return updateRecord<UserInventory>(db, stores.USER_INVENTORIES, id, changes)
}

/** The inventory and its lines both — see [removeWithChildren] for why. */
export async function deleteUserInventory(db: IDBPDatabase, id: number): Promise<void> {
  return removeWithChildren(
    db,
    stores.USER_INVENTORIES,
    stores.USER_INVENTORY_LINES,
    indices.USER_INVENTORY_LINES_BY_INVENTORY,
    id
  )
}

export async function loadUserInventories(db: IDBPDatabase): Promise<UserInventory[]> {
  return listRecords<UserInventory>(db, stores.USER_INVENTORIES)
}

/** What one inventory is made of, in the order the lines were added. */
export async function loadInventoryLines(
  db: IDBPDatabase,
  inventoryId: number
): Promise<UserInventoryLine[]> {
  return listChildren<UserInventoryLine>(
    db,
    indices.USER_INVENTORY_LINES_BY_INVENTORY,
    inventoryId
  )
}

/**
 * The inventory with its lines joined on, which is the one shape a reader of
 * this store wants and the shape [loadCategory] hands a category back in.
 */
export async function loadUserInventory(
  db: IDBPDatabase,
  id: number
): Promise<(UserInventory & { lines: UserInventoryLine[] }) | undefined> {
  const inventories = await loadUserInventories(db)
  const inventory = inventories.find((held) => held.id === id)
  if (!inventory) {
    return undefined
  }
  return {
    ...inventory,
    lines: await loadInventoryLines(db, id)
  }
}

/**
 * A line with a quantity of one, which is what a new line is.
 *
 * One rather than none, because a part somebody has just added to a set is a
 * part they want at least one of, and a line reading zero is a line the planner
 * would silently skip.
 */
export async function addInventoryLine(
  db: IDBPDatabase,
  inventoryId: number,
  fields: Partial<Omit<UserInventoryLine, 'id' | 'inventoryId'>> = {}
): Promise<UserInventoryLine> {
  return createRecord<UserInventoryLine>(db, stores.USER_INVENTORY_LINES, {
    inventoryId,
    record: fields.record,
    userItemId: fields.userItemId,
    colorId: fields.colorId,
    name: fields.name,
    quantity: fields.quantity ?? 1
  })
}

export async function updateInventoryLine(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<UserInventoryLine, 'id'>>
): Promise<UserInventoryLine | undefined> {
  return updateRecord<UserInventoryLine>(db, stores.USER_INVENTORY_LINES, id, changes)
}

export async function removeInventoryLine(db: IDBPDatabase, id: number): Promise<void> {
  return removeRecord(db, stores.USER_INVENTORY_LINES, id)
}
