import { type IDBPDatabase, openDB } from 'idb'
import STORES from './stores'
import INDICES from './indices'

import { createIndex, createStore } from './db'

let dbConnection: IDBPDatabase | undefined

const DB_NAME = 'brickzuke'
const DB_VERSION = 10

export async function getDbConnection(): Promise<IDBPDatabase> {
  if (dbConnection) {
    return dbConnection
  }
  const db = await openDB(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, newVersion, transaction) {
      Object.values(STORES).forEach((store) => {
        try {
          createStore(db, store)
        } catch (e) {
          console.log('Error creating store', store, e)
        }
      })
      Object.values(INDICES).forEach((index) => {
        try {
          createIndex(transaction, index)
        } catch (e) {
          console.log('Error creating index', index, e)
        }
      })
    },
  })
  dbConnection = db
  return db
}
