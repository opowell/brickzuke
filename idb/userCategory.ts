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

/**
 * How one of these is referred to from an item, in the same field a BrickLink
 * category is: as the negative of its id.
 *
 * A category is a category whoever made it, so an item names its category in
 * one field and the categories table lists both kinds in one list. The two id
 * spaces have to be told apart in that field, and the sign is what does it:
 * BrickLink never issues a negative id, and a number is what the field has to
 * hold — the query language compares a number exactly and a string by
 * substring, so `category:"3"` must not also answer for category 30, and a
 * prefix like `u3` would. Everything that reads or writes the field goes
 * through these two, so the sign is stated here and nowhere else.
 */
export function userCategoryRef(id: number): number {
  return -id
}

/** The [UserCategory] id a reference names, or nothing where it is BrickLink's. */
export function userCategoryIdOf(ref: unknown): number | undefined {
  const value = Number(ref)
  return Number.isFinite(value) && value < 0 ? -value : undefined
}

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
