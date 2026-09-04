import { type IDBPDatabase, openDB } from 'idb'
import STORES from './stores'
import INDICES from './indices'

import { createIndex, createStore } from './db'

const DB_NAME = 'brickzuke'
// 19 adds COLOR_SCOPES, which says how much of a colour was fetched.
const DB_VERSION = 19

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
      /*
       * Colour rows stored before COLOR_SCOPES existed cannot say whether they
       * are a whole colour or the first fifth of one, and a partial list read
       * back as an answer is the one thing this store must not be. They are
       * dropped rather than trusted; nothing is lost, since a colour nobody
       * has is fetched the next time someone asks for it.
       */
      if (oldVersion >= 18 && oldVersion < 19) {
        try {
          transaction.objectStore(STORES.COLOR_ITEMS.name).clear()
        } catch (e) {
          console.log('Error clearing colour items', e)
        }
      }
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
