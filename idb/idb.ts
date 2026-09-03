import { type IDBPDatabase, openDB } from 'idb'
import STORES from './stores'
import INDICES from './indices'

import { createIndex, createStore } from './db'

const DB_NAME = 'brickzuke'
// 18 adds COLOR_ITEMS and its by-scope index.
const DB_VERSION = 18

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
    /**
     * Another tab wants to upgrade and this connection is what is stopping it.
     *
     * IndexedDB will not run a version change while an older connection is
     * open, and it does not time out: without this the upgrading tab waits for
     * ever, showing an empty catalogue and no reason for it. Every tab runs
     * this same code, so closing here is what lets the other one through, and
     * the next call opens a fresh connection at the new version.
     */
    blocking(currentVersion, blockedVersion, event) {
      console.log('Closing db connection so another tab can upgrade', currentVersion, blockedVersion)
      ;(event.target as IDBDatabase | null)?.close()
    },
    /** The other side of the same wait: this tab is the one being held up. */
    blocked(currentVersion, blockedVersion) {
      console.warn(
        `Waiting for another BrickZuke tab to release the database (v${currentVersion} to v${blockedVersion}). Close or reload the other tabs.`,
      )
    },
  })
}
