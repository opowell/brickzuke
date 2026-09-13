/**
 * What a set of somebody's own is made of.
 *
 * The same question ITEM_INVENTORIES answers for a BrickLink set, over lines
 * a reader wrote instead, and under the same address: the set's record. A
 * set of theirs is an item of theirs — see [userItemRecord] — so there is no
 * inventory record to make or name; there are only parts filed under `U-3`,
 * and the item is a set for as long as any are.
 *
 * Joined through USER_INVENTORY_LINES_BY_RECORD the way ITEM_INVENTORIES is
 * joined through ITEM_INVENTORIES_BY_RECORD: one indexed lookup answers "what
 * is in this".
 *
 * A line names its part by record — BrickLink's, `P-3001`, or one of theirs,
 * `U-5`. Holding the record rather than a key is what lets the planner match
 * the line against the lots on offer, every one of which carries the same
 * field, and tell a part of theirs, which no seller has, from a part nobody
 * happens to hold.
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import { getAll } from './db'
import type { UserInventoryLine } from './userTypes'
import { createRecord, listChildren, removeRecord, updateRecord } from './userRecord'

/** What one set is made of, in the order the lines were added. */
export async function loadInventoryLines(
  db: IDBPDatabase,
  record: string
): Promise<UserInventoryLine[]> {
  return listChildren<UserInventoryLine>(db, indices.USER_INVENTORY_LINES_BY_RECORD, record)
}

/** Every line of every set of theirs, for the tables that list them all. */
export async function loadAllInventoryLines(db: IDBPDatabase): Promise<UserInventoryLine[]> {
  return ((await getAll<UserInventoryLine>(db, stores.USER_INVENTORY_LINES)) ?? []).sort(
    (a, b) => a.id - b.id
  )
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
  record: string,
  fields: Partial<Omit<UserInventoryLine, 'id' | 'record'>> = {}
): Promise<UserInventoryLine> {
  return createRecord<UserInventoryLine>(db, stores.USER_INVENTORY_LINES, {
    record,
    part: fields.part,
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
