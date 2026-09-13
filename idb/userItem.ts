/**
 * Items of somebody's own: a piece BrickLink does not list, or one a reader
 * would rather describe themselves.
 *
 * An item here is a description and nothing else — there are no lots for it,
 * because no seller is offering a part the catalogue has no id for. That is
 * what separates it from a catalogue item on a shopping list, and why the
 * planner reports a line naming one as something it cannot price: see
 * [shopParts].
 */
import type { IDBPDatabase } from 'idb'
import stores from './stores'
import type { UserItem } from './userTypes'
import { createRecord, listRecords, removeRecord, updateRecord } from './userRecord'

export const NEW_USER_ITEM_NAME = 'New item'

export async function createUserItem(
  db: IDBPDatabase,
  name: string = NEW_USER_ITEM_NAME
): Promise<UserItem> {
  return createRecord<UserItem>(db, stores.USER_ITEMS, {
    name,
    createdAt: new Date()
  })
}

export async function updateUserItem(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<UserItem, 'id'>>
): Promise<UserItem | undefined> {
  return updateRecord<UserItem>(db, stores.USER_ITEMS, id, changes)
}

export async function deleteUserItem(db: IDBPDatabase, id: number): Promise<void> {
  return removeRecord(db, stores.USER_ITEMS, id)
}

export async function loadUserItems(db: IDBPDatabase): Promise<UserItem[]> {
  return listRecords<UserItem>(db, stores.USER_ITEMS)
}

/** One item by its key, for a line that carries the id and wants the name. */
export async function loadUserItemNames(db: IDBPDatabase): Promise<Map<number, string>> {
  return new Map((await loadUserItems(db)).map((item) => [item.id, item.name]))
}
