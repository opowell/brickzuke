/**
 * The first migration of a store nobody scraped, and so the first that has to
 * carry every row across rather than drop them.
 *
 * In a file of its own because it needs the database at the version *before*
 * the fold, which every other test here opens past on its first line. The
 * fake IndexedDB is fresh per test file, so this one can make the old shape
 * by hand, close it, and let `getDbConnection` bring it forward.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { getDbConnection } from '../idb'
import STORES from '../stores'
import { loadUserItems } from '../userItem'
import { userCategoryRef } from '../userCategory'

/** The database as v25 left it: the user stores, and two items in the old shape. */
function writeOldShape(): Promise<void> {
  return new Promise((ok, no) => {
    const request = indexedDB.open('brickzuke', 25)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of Object.values(STORES)) {
        db.createObjectStore(store.name, {
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement === true
        })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(STORES.USER_ITEMS.name, 'readwrite')
      tx.objectStore(STORES.USER_ITEMS.name).put({
        name: 'Filed under mine',
        note: 'keep me',
        userCategoryId: 3,
        createdAt: new Date('2026-09-01')
      })
      tx.objectStore(STORES.USER_ITEMS.name).put({
        name: 'Filed under BrickLink',
        categoryId: 5,
        createdAt: new Date('2026-09-02')
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

describe('folding an item two category fields into one', () => {
  it('carries every item across, the one field moved and the rest untouched', async () => {
    await writeOldShape()

    const db = await getDbConnection()
    expect(db.version).toBe(34)
    const items = await loadUserItems(db)
    db.close()

    const mine = items.find((item) => item.name === 'Filed under mine')!
    // The category of theirs, now named the way the categories table names
    // it — and the field it used to sit in gone, not left as a second copy.
    expect(mine.categoryId).toBe(userCategoryRef(3))
    expect('userCategoryId' in mine).toBe(false)
    // Nothing else on the row moved.
    expect(mine.note).toBe('keep me')
    expect(mine.createdAt).toEqual(new Date('2026-09-01'))

    // An item already filed under BrickLink's is exactly as it was.
    const theirs = items.find((item) => item.name === 'Filed under BrickLink')!
    expect(theirs.categoryId).toBe(5)
    expect(items).toHaveLength(2)
  })
})
