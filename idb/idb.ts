import { type IDBPDatabase, openDB } from 'idb'
import STORES from './stores'
import INDICES from './indices'

import { createIndex, createStore } from './db'

const DB_NAME = 'brickzuke'
// 19 adds COLOR_SCOPES, which says how much of a colour was fetched.
// 20 adds the store directory — regions, countries and the sellers in them —
// which until now lived only in memory and was re-scraped on every reload.
// 21 renames a seller's `lots` to `items`, the directory's number being a
// quantity and not a count of listings.
// 22 adds STORE_LOTS and the scopes saying how much of a seller's inventory
// each one holds. A version of its own rather than part of 21, because 21 was
// written before those stores were: a tab that reloaded in between upgraded to
// 21 without them, and would never have created them — no upgrade runs for a
// version already reached. The stores are made in the loop below, which runs on
// any upgrade, so a number nobody has seen yet is the whole fix.
const DB_VERSION = 22

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
      /*
       * Sellers stored before v21 carry the directory's number under `lots`,
       * which is not what it counts. Renaming the field in place would leave
       * those rows reading blank, so they go the way the colour rows above
       * did: dropped, and re-scraped the next time a country is opened.
       */
      if (oldVersion >= 20 && oldVersion < 21) {
        try {
          transaction.objectStore(STORES.BRICK_LINK_STORES.name).clear()
        } catch (e) {
          console.log('Error clearing sellers', e)
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
