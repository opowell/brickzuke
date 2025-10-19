import type { IDBPDatabase, IDBPTransaction } from 'idb'
import type { StoreDefinition } from './stores'
import type { IndexDefinition } from './indices'
import STORES from '../idb/stores'
import { isProxy, toRaw } from 'vue'

export async function openCursor(
  db: IDBPDatabase,
  store: StoreDefinition,
): Promise<IDBCursor | undefined> {
  return await db.transaction(store.name).store.openCursor()
}

export async function getAll<T>(
  db: IDBPDatabase,
  storeDefinition: StoreDefinition,
): Promise<T[] | undefined> {
  return db.getAll(storeDefinition.name)
}

export async function count(db: IDBPDatabase, storeDefinition: StoreDefinition) {
  return await db.count(storeDefinition.name)
}

export async function get<T>(
  db: IDBPDatabase,
  store: StoreDefinition,
  query: IDBKeyRange | IDBValidKey,
): Promise<T | undefined> {
  return await db.get(store.name, query)
}

export async function put<T>(db: IDBPDatabase, storeDef: StoreDefinition, value: T) {
  if (isProxy(value)) {
    value = toRaw(value)
  }
  try {
    return await db.put(storeDef.name, value)
  } catch (e) {
    console.log(value, e)
  }
}

export async function dbDelete(db: IDBPDatabase, storeDef: StoreDefinition, keyPath: IDBValidKey) {
  try {
    return await db.delete(storeDef.name, keyPath)
  } catch (e) {
    console.log(keyPath, e)
  }
}

export async function deleteQueuedCall(db: IDBPDatabase, id: number) {
  return await dbDelete(db, STORES.QUEUED_CALLS, id)
}

export async function getAllFromIndex<T>(
  db: IDBPDatabase,
  index: IndexDefinition,
  query?: IDBKeyRange | IDBValidKey | null | undefined,
  count?: number,
): Promise<T[] | undefined> {
  return db.getAllFromIndex(index.store.name, index.name, query, count)
}

export function createIndex(
  transaction: IDBPTransaction<unknown, string[], 'versionchange'>,
  index: IndexDefinition,
) {
  const store = transaction.objectStore(index.store.name)
  store.createIndex(index.name, index.keyPath)
}

export function createStore(db: IDBPDatabase, storeDefinition: StoreDefinition) {
  db.createObjectStore(storeDefinition.name, {
    keyPath: storeDefinition.keyPath,
    autoIncrement: storeDefinition.autoIncrement === true,
  })
}
