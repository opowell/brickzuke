/**
 * Writing a record somebody owns, whichever of the six stores holds it.
 *
 * The catalogue's own loaders — [loadCategory], [loadItemTypes] — read and join
 * and never write, because nothing in brickzuke wrote the catalogue. These do
 * the other half, and the four stores they serve take it identically: a new
 * record is the fields plus the moment it was made, an edit is one field of
 * one record, and both go through the generic `put` in db.ts. So the shape is
 * here once rather than four times, and the per-entity files say what their
 * operations are called and what a blank one of them holds.
 *
 * `put` rather than `add` throughout, that being what db.ts offers and what
 * the rest of the app writes with. The difference does not arise: a create
 * passes no key and IndexedDB assigns one, and an update passes the key it
 * read.
 */
import type { IDBPDatabase } from 'idb'
import type { StoreDefinition } from './stores'
import type { IndexDefinition } from './indices'
import { dbDelete, get, getAll, getAllFromIndex, put } from './db'

/** Every record with an `id`, which is every record in these four stores. */
export interface UserRecord {
  id: number
}

/**
 * Writes a new record and gives back what was stored, id and all.
 *
 * The id is the store's to assign, so the caller is handed the record back
 * rather than the fields it passed in: a create is almost always followed by
 * something that needs the key — a line written under the inventory that was
 * just made, a list opened at the id it was given.
 */
export async function createRecord<T extends UserRecord>(
  db: IDBPDatabase,
  store: StoreDefinition,
  fields: Omit<T, 'id'>
): Promise<T> {
  const key = await put<T>(db, store, fields as Partial<T>)
  return {
    ...fields,
    id: Number(key)
  } as T
}

/**
 * Changes some of one record's fields, and leaves the rest as they were.
 *
 * Read-then-write rather than a bare `put` of the changes, because `put`
 * replaces: writing `{id, name}` over an inventory line would take its quantity
 * and its colour with it. A record that is not there is not created either —
 * an edit to something deleted in another tab should do nothing rather than
 * bring it back with two fields and none of the rest.
 */
export async function updateRecord<T extends UserRecord>(
  db: IDBPDatabase,
  store: StoreDefinition,
  id: number,
  changes: Partial<Omit<T, 'id'>>
): Promise<T | undefined> {
  const held = await get<T>(db, store, id)
  if (!held) {
    return undefined
  }
  const written = {
    ...held,
    ...changes,
    id
  }
  await put<T>(db, store, written)
  return written
}

export async function removeRecord(
  db: IDBPDatabase,
  store: StoreDefinition,
  id: number
): Promise<void> {
  await dbDelete(db, store, id)
}

/**
 * Every record in one of these stores, newest first.
 *
 * Newest first because these are somebody's own and there are tens of them
 * rather than thousands: the one they just made is the one they are looking
 * for. The tables sort themselves afterwards — this is the order the home
 * screen's card shows the head of, and the order a fresh table opens in.
 */
export async function listRecords<T extends UserRecord>(
  db: IDBPDatabase,
  store: StoreDefinition
): Promise<T[]> {
  const held = (await getAll<T>(db, store)) ?? []
  return held.sort((a, b) => b.id - a.id)
}

/** The children of one parent — an inventory's lines, a list's wanted parts. */
export async function listChildren<T extends UserRecord>(
  db: IDBPDatabase,
  index: IndexDefinition,
  parent: IDBValidKey
): Promise<T[]> {
  const held = (await getAllFromIndex<T>(db, index, parent)) ?? []
  return held.sort((a, b) => a.id - b.id)
}

/**
 * Deletes a parent and everything under it, so nothing is left addressed to a
 * record that has gone.
 *
 * IndexedDB has no foreign keys and so no cascade: without this, deleting an
 * inventory leaves its lines in the store for ever, indexed under an id
 * nothing will ever ask about again.
 */
export async function removeWithChildren(
  db: IDBPDatabase,
  store: StoreDefinition,
  childStore: StoreDefinition,
  childIndex: IndexDefinition,
  id: number,
  /** What the children carry the parent as, where it is not the id — `U-3`. */
  parent: IDBValidKey = id
): Promise<void> {
  for (const child of await listChildren<UserRecord>(db, childIndex, parent)) {
    await dbDelete(db, childStore, child.id)
  }
  await dbDelete(db, store, id)
}
