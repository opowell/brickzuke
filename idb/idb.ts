import { type IDBPDatabase, openDB } from 'idb'
import STORES from './stores'
import INDICES from './indices'

import { createIndex, createStore } from './db'
import { userCategoryRef } from './userCategory'
import { userItemRecord } from './userItem'

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
// 23 changes what a stored lot holds — the item's name and colour, and the
// price split into the converted number and the seller's own figure.
// 24 adds the six stores nobody scraped: somebody's own categories, items and
// sets, and the shopping lists they buy the parts from. They are made by the
// loop below like any other, and they are the first stores here that must
// never be cleared by it — every clearing above is safe because the rows are a
// copy of BrickLink's and can be fetched again, and none of these is a copy of
// anything. A shape that turns out to be wrong is migrated in place.
// 25 adds STORE_POLICIES — a seller's shipping terms — made by the loop below
// like any other and, being a copy of BrickLink's, safe to clear.
// 26 folds an item's two category fields into one: `userCategoryId` becomes a
// negative `categoryId` — see [userCategoryRef]. The first change of shape to
// a store nobody scraped, and so the first migrated in place rather than
// cleared: see the loop at the foot of `upgrade` for how that is done.
// 27 makes a set of somebody's own an item of theirs with parts, and gives
// every item of theirs a record — `U-3` — in the field a BrickLink item has
// one in. USER_INVENTORIES goes: each becomes a USER_ITEMS row, its lines are
// re-filed under the new item's record, and the two places a line or a list
// item could name a part by key name it by record instead. Every row is
// carried; see the last block of `upgrade`.
// 28 adds CARTS and CART_LINES — which lots somebody means to order, from whom
// and how many. Made by the loop below like any other, and under the same rule
// as the other stores nobody scraped: never cleared.
// 29 adds PRICE_MODIFIERS — a factor somebody puts on the prices of every lot
// of one colour, seller, category, condition, country or item type. Made by
// the loop below like any other; theirs, and never cleared.
const DB_VERSION = 29

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
      /*
       * Lots stored before v23 carry a price as the string BrickLink printed
       * and name neither the item nor its colour, so those columns would read
       * blank for ever: `storeLotsFor` takes stored rows as the answer and
       * never asks again. Dropped, and re-fetched the next time a seller is
       * opened — with the scopes, which would otherwise claim a store was
       * already read.
       */
      if (oldVersion >= 22 && oldVersion < 23) {
        for (const store of [STORES.STORE_LOTS, STORES.STORE_LOT_SCOPES]) {
          try {
            transaction.objectStore(store.name).clear()
          } catch (e) {
            console.log('Error clearing store lots', store, e)
          }
        }
      }
      /*
       * Items of somebody's own written before v26 name one of their own
       * categories in a field of its own. Every clearing above is safe because
       * the rows are a copy of BrickLink's; these are not, so this walks them
       * and rewrites each in place — the one field moved, the rest untouched.
       * Awaited, because the upgrade transaction is what makes the write
       * atomic with the version: a cursor left running past the end of this
       * function would be writing into a transaction already committed.
       */
      if (oldVersion >= 24 && oldVersion < 26) {
        try {
          const items = transaction.objectStore(STORES.USER_ITEMS.name)
          let cursor = await items.openCursor()
          while (cursor) {
            const item = cursor.value as { categoryId?: number; userCategoryId?: number }
            if (item.userCategoryId !== undefined) {
              const {
                userCategoryId, ...rest 
              } = item
              await cursor.update({
                ...rest,
                categoryId: userCategoryRef(userCategoryId)
              })
            }
            cursor = await cursor.continue()
          }
        } catch (e) {
          console.log('Error folding item categories', e)
        }
      }
      /*
       * v27. A set of theirs was a record of its own, keyed apart from their
       * items; now it is one of their items, and its parts are filed under
       * that item's record. So each set becomes an item — its name, its date,
       * and what it was about kept as a note — and every line under it is
       * re-addressed from the set's old key to the new item's record, with the
       * part it names moved into `part`. A line or a wanted part that named a
       * part of theirs by key names it by record now, and a list that named
       * the set it came from by key names it by record.
       *
       * The old store is dropped once it is empty of anything not carried
       * across, which is the one deletion of a user store here and the reason
       * it is stated in words: nothing in it is lost, it has been moved.
       *
       * Guarded on the store being there at all: a database made fresh at
       * this version never had it.
       */
      if (oldVersion >= 24 && oldVersion < 27) {
        try {
          const items = transaction.objectStore(STORES.USER_ITEMS.name)
          const lines = transaction.objectStore(STORES.USER_INVENTORY_LINES.name)
          const listItems = transaction.objectStore(STORES.SHOP_LIST_ITEMS.name)
          const lists = transaction.objectStore(STORES.SHOP_LISTS.name)
          const OLD_SETS = 'userInventories'
          const OLD_INDEX = 'inventoryId'

          // Each set of theirs, as an item of theirs — and which key became
          // which record, for everything that pointed at the set.
          const recordOf = new Map<number, string>()
          if (db.objectStoreNames.contains(OLD_SETS)) {
            const sets = transaction.objectStore(OLD_SETS)
            for (const set of (await sets.getAll()) as {
              id: number
              name: string
              record?: string
              createdAt: Date
            }[]) {
              const key = await items.add({
                name: set.name,
                note: set.record ? `For ${set.record}` : undefined,
                createdAt: set.createdAt ?? new Date()
              })
              recordOf.set(set.id, userItemRecord(Number(key)))
            }
          }

          let line = await lines.openCursor()
          while (line) {
            const old = line.value as {
              inventoryId?: number
              record?: string
              userItemId?: number
              [field: string]: unknown
            }
            if (old.inventoryId !== undefined) {
              const {
                inventoryId, record, userItemId, ...rest 
              } = old
              await line.update({
                ...rest,
                record: recordOf.get(inventoryId) ?? userItemRecord(inventoryId),
                part: record ?? (userItemId === undefined ? undefined : userItemRecord(userItemId))
              })
            }
            line = await line.continue()
          }
          if (lines.indexNames.contains(OLD_INDEX)) {
            lines.deleteIndex(OLD_INDEX)
          }

          let wanted = await listItems.openCursor()
          while (wanted) {
            const old = wanted.value as { record?: string; userItemId?: number; [field: string]: unknown }
            if (old.userItemId !== undefined) {
              const {
                userItemId, ...rest 
              } = old
              await wanted.update({
                ...rest,
                record: rest.record ?? userItemRecord(userItemId)
              })
            }
            wanted = await wanted.continue()
          }

          let list = await lists.openCursor()
          while (list) {
            const old = list.value as { sourceInventoryId?: number; sourceRecord?: string; [field: string]: unknown }
            if (old.sourceInventoryId !== undefined) {
              const {
                sourceInventoryId, ...rest 
              } = old
              await list.update({
                ...rest,
                sourceRecord: rest.sourceRecord ?? recordOf.get(sourceInventoryId)
              })
            }
            list = await list.continue()
          }

          if (db.objectStoreNames.contains(OLD_SETS)) {
            db.deleteObjectStore(OLD_SETS)
          }
        } catch (e) {
          console.log('Error making sets into items', e)
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
