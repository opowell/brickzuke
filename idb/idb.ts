import { type IDBPDatabase, openDB } from 'idb'
import STORES from './stores'
import INDICES from './indices'

import { createIndex, createStore } from './db'

const DB_NAME = 'brickzuke'
const DB_VERSION = 16

export async function getDbConnection(): Promise<IDBPDatabase> {
  return await openDB(DB_NAME, DB_VERSION, {
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
}
