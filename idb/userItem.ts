/**
 * Items of somebody's own: a piece BrickLink does not list, or a set they
 * designed — the two being one type, an item with parts filed under it being
 * a set, exactly as in the catalogue.
 *
 * An item here has no lots, because no seller is offering a part the catalogue
 * has no id for. That is what separates it from a catalogue item on a
 * shopping list, and why the planner reports a line naming one as something
 * it cannot price — see [shopParts].
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import type { UserItem } from './userTypes'
import { createRecord, listRecords, removeWithChildren, updateRecord } from './userRecord'

export const NEW_USER_ITEM_NAME = 'New item'

/**
 * How one of these is referred to wherever a catalogue item is referred to by
 * its BrickLink record: as `U-3`.
 *
 * An item is named by its record in every table here — a set's parts, a lot on
 * offer, a shopping list's lines all carry `S-10511-1` or `P-3001` — so an
 * item of theirs has to have one, in the same field, of the same shape: a
 * type letter, a dash, a number. `U` because BrickLink issues no such type,
 * so nothing of theirs can ever read like something of BrickLink's. Stated
 * here and read through [userItemIdOf] everywhere else.
 */
export function userItemRecord(id: number): string {
  return `U-${id}`
}

/** The [UserItem] id a record names, or nothing where it is BrickLink's. */
export function userItemIdOf(record: unknown): number | undefined {
  const found = /^U-(\d+)$/.exec(String(record ?? ''))
  const id = found ? Number(found[1]) : NaN
  return Number.isFinite(id) && id > 0 ? id : undefined
}

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

/**
 * The item and, where it was a set, its parts — see [removeWithChildren].
 *
 * Lines elsewhere naming it as a *part* are left alone, as an item is left
 * when its category goes: the line still says what it was called, and losing
 * the description is not a reason to lose the line that wanted it.
 */
export async function deleteUserItem(db: IDBPDatabase, id: number): Promise<void> {
  return removeWithChildren(
    db,
    stores.USER_ITEMS,
    stores.USER_INVENTORY_LINES,
    indices.USER_INVENTORY_LINES_BY_RECORD,
    id,
    userItemRecord(id)
  )
}

export async function loadUserItems(db: IDBPDatabase): Promise<UserItem[]> {
  return listRecords<UserItem>(db, stores.USER_ITEMS)
}

/** One item by its key, for a line that carries the id and wants the name. */
export async function loadUserItemNames(db: IDBPDatabase): Promise<Map<number, string>> {
  return new Map((await loadUserItems(db)).map((item) => [item.id, item.name]))
}
