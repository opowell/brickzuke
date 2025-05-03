import { type IDBPDatabase, openDB } from 'idb'
import STORES from './stores'
import INDICES from './indices'

import { createIndex, createStore } from './db'

let dbConnection: IDBPDatabase | undefined

const DB_NAME = 'brickzuke'

export async function getDbConnection(): Promise<IDBPDatabase> {
  if (dbConnection) {
    return dbConnection
  }
  const db = await openDB(DB_NAME, 4, {
    async upgrade(db, oldVersion, newVersion, transaction) {
      Object.values(STORES).forEach((store) => {
        try {
          createStore(db, store)
        } catch {}
      })
      Object.values(INDICES).forEach((index) => {
        try {
          createIndex(transaction, index)
        } catch {}
      })
    },
  })
  dbConnection = db
  return db
}
