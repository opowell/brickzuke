/**
 * The second migration of a store nobody scraped, and the first that moves
 * records between stores rather than rewriting them where they lie.
 *
 * In a file of its own for the reason [foldCategories] is: it needs the
 * database at the version before, with the store that version had and this
 * one has not. The fake IndexedDB is fresh per test file, so the old shape is
 * made by hand and `getDbConnection` brings it forward.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { getDbConnection } from '../idb'
import STORES from '../stores'
import { loadUserItems, userItemRecord } from '../userItem'
import { loadInventoryLines } from '../userInventory'
import { loadShopListItems, loadShopLists } from '../shopList'

/**
 * The database as v26 left it: a set of theirs with two lines, one naming a
 * part of BrickLink's and one a part of theirs by key; a list copied from the
 * set, with the same two parts; and an item of theirs already there, so the
 * set's new id cannot be the same number as its old one.
 */
function writeOldShape(): Promise<void> {
  return new Promise((ok, no) => {
    const request = indexedDB.open('brickzuke', 26)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of Object.values(STORES)) {
        db.createObjectStore(store.name, {
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement === true
        })
      }
      const sets = db.createObjectStore('userInventories', {
        keyPath: 'id',
        autoIncrement: true
      })
      void sets
      const lines = request.transaction!.objectStore(STORES.USER_INVENTORY_LINES.name)
      lines.createIndex('inventoryId', 'inventoryId')
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(
        [
          STORES.USER_ITEMS.name,
          'userInventories',
          STORES.USER_INVENTORY_LINES.name,
          STORES.SHOP_LISTS.name,
          STORES.SHOP_LIST_ITEMS.name
        ],
        'readwrite'
      )
      // Item 1 is a piece of theirs; the set will have to become item 2.
      tx.objectStore(STORES.USER_ITEMS.name).put({
        name: 'Sprue offcut',
        createdAt: new Date('2026-09-01')
      })
      tx.objectStore('userInventories').put({
        name: 'My MOC',
        record: 'S-10511-1',
        createdAt: new Date('2026-09-02')
      })
      tx.objectStore(STORES.USER_INVENTORY_LINES.name).put({
        inventoryId: 1,
        record: 'P-3001',
        colorId: '5',
        name: 'Brick 2 x 4',
        quantity: 4
      })
      tx.objectStore(STORES.USER_INVENTORY_LINES.name).put({
        inventoryId: 1,
        userItemId: 1,
        name: 'Sprue offcut',
        quantity: 2
      })
      tx.objectStore(STORES.SHOP_LISTS.name).put({
        name: 'Parts for My MOC',
        sourceInventoryId: 1,
        createdAt: new Date('2026-09-03')
      })
      tx.objectStore(STORES.SHOP_LIST_ITEMS.name).put({
        listId: 1,
        record: 'P-3001',
        minQuantity: 4
      })
      tx.objectStore(STORES.SHOP_LIST_ITEMS.name).put({
        listId: 1,
        userItemId: 1,
        name: 'Sprue offcut',
        minQuantity: 2
      })
      tx.oncomplete = () => {
        db.close()
        ok()
      }
      tx.onerror = () => no(tx.error)
    }
    request.onerror = () => no(request.error)
  })
}

describe('making a set of theirs an item of theirs', () => {
  it('carries the set, its parts, and everything that pointed at either', async () => {
    await writeOldShape()

    const db = await getDbConnection()
    expect(db.version).toBe(28)
    const items = await loadUserItems(db)
    const set = items.find((item) => item.name === 'My MOC')!
    const piece = items.find((item) => item.name === 'Sprue offcut')!

    // The set is an item now, with a new key of its own — not the old set's
    // key, which the piece already held — and what it was about kept.
    expect(set.id).not.toBe(1)
    expect(piece.id).toBe(1)
    expect(set.note).toBe('For S-10511-1')
    expect(set.createdAt).toEqual(new Date('2026-09-02'))

    // Its parts are filed under its record, and each names its part by
    // record — BrickLink's as it was, and the piece by its record now.
    const record = userItemRecord(set.id)
    const lines = await loadInventoryLines(db, record)
    expect(lines.map((line) => [line.part, line.quantity])).toEqual([
      ['P-3001', 4],
      [userItemRecord(piece.id), 2]
    ])
    expect(lines.every((line) => !('inventoryId' in line) && !('userItemId' in line))).toBe(true)
    expect(lines[0].colorId).toBe('5')

    // The list points at the set by record, and its parts by record.
    const [list] = await loadShopLists(db)
    expect(list.sourceRecord).toBe(record)
    expect('sourceInventoryId' in list).toBe(false)
    const wanted = await loadShopListItems(db, list.id)
    expect(wanted.map((item) => item.record)).toEqual(['P-3001', userItemRecord(piece.id)])
    expect(wanted.every((item) => !('userItemId' in item))).toBe(true)

    // The old store and the old index are gone, nothing in them having been
    // left behind.
    expect([...db.objectStoreNames]).not.toContain('userInventories')
    expect([
      ...db.transaction(STORES.USER_INVENTORY_LINES.name).store.indexNames
    ]).toEqual(['record'])
    db.close()
  })
})
