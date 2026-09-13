/**
 * Categories of somebody's own.
 *
 * The catalogue's categories are BrickLink's, joined out of its download by
 * [loadCategory] and never written to. These are the ones a reader makes for
 * what BrickLink has no category for — or for a grouping of their own over
 * items it does list.
 */
import type { IDBPDatabase } from 'idb'
import stores from './stores'
import type { UserCategory } from './userTypes'
import { createRecord, listRecords, removeRecord, updateRecord } from './userRecord'

/** What a category starts as, before anybody has named it. */
export const NEW_USER_CATEGORY_NAME = 'New category'

export async function createUserCategory(
  db: IDBPDatabase,
  name: string = NEW_USER_CATEGORY_NAME
): Promise<UserCategory> {
  return createRecord<UserCategory>(db, stores.USER_CATEGORIES, {
    name,
    createdAt: new Date()
  })
}

export async function updateUserCategory(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<UserCategory, 'id'>>
): Promise<UserCategory | undefined> {
  return updateRecord<UserCategory>(db, stores.USER_CATEGORIES, id, changes)
}

/**
 * Deletes a category, and says nothing about the items in it.
 *
 * An item naming a category that has gone is drawn without one rather than
 * hidden or deleted with it: what somebody wrote about the item is theirs, and
 * losing a grouping is not a reason to lose the thing grouped.
 */
export async function deleteUserCategory(db: IDBPDatabase, id: number): Promise<void> {
  return removeRecord(db, stores.USER_CATEGORIES, id)
}

export async function loadUserCategories(db: IDBPDatabase): Promise<UserCategory[]> {
  return listRecords<UserCategory>(db, stores.USER_CATEGORIES)
}
