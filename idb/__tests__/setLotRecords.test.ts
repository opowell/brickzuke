/**
 * v35 gives a stored lot of a set the record the catalogue files the set
 * under. In a file of its own for the reason the other upgrade tests are: it
 * needs the database at the version before, which every other test opens past
 * on its first line, and the fake IndexedDB is fresh per file.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { getDbConnection } from '../idb'
import STORES from '../stores'
import INDICES from '../indices'
import { getAll } from '../db'
import type { StoredStoreLot } from '../../view/stores/bricklink/store-front-page'

/**
 * The database as v34 left it: a set lot kept without its sequence, one kept
 * with it, a part, and a set the catalogue does not know either way.
 */
function writeOldShape(): Promise<void> {
  return new Promise((ok, no) => {
    const request = indexedDB.open('brickzuke', 34)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of Object.values(STORES)) {
        db.createObjectStore(store.name, {
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement === true
        })
      }
      const lots = request.transaction!.objectStore(STORES.STORE_LOTS.name)
      lots.createIndex(INDICES.STORE_LOTS_BY_RECORD.name, INDICES.STORE_LOTS_BY_RECORD.keyPath)
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction([STORES.BRICK_LINK_ITEMS.name, STORES.STORE_LOTS.name], 'readwrite')
      const items = tx.objectStore(STORES.BRICK_LINK_ITEMS.name)
      items.put({
        id: 'S-4403-1',
        itemType: 'S',
        Number: '4403-1',
        Name: 'Air Blazers'
      })
      items.put({
        id: 'P-3001',
        itemType: 'P',
        Number: '3001',
        Name: 'Brick 2 x 4'
      })
      const lots = tx.objectStore(STORES.STORE_LOTS.name)
      const lot = (id: string, record: string, itemNumber: string) => ({
        id,
        store: 'styria_bricks',
        record,
        itemType: record.split('-')[0],
        itemNumber,
        itemName: '',
        description: '',
        condition: 'U',
        quantity: 1,
        price: 1
      })
      lots.put(lot('1', 'S-4403', '4403'))
      lots.put(lot('2', 'S-4403-1', '4403-1'))
      lots.put(lot('3', 'P-3001', '3001'))
      lots.put(lot('4', 'S-99999', '99999'))
      tx.oncomplete = () => {
        db.close()
        ok()
      }
      tx.onerror = () => no(tx.error)
    }
    request.onerror = () => no(request.error)
  })
}

describe('giving stored set lots their records', () => {
  it('adds the sequence where the catalogue knows the set by it, and nowhere else', async () => {
    await writeOldShape()

    const db = await getDbConnection()
    expect(db.version).toBe(36)
    const lots = (await getAll<StoredStoreLot>(db, STORES.STORE_LOTS)) ?? []
    db.close()

    const byId = new Map(lots.map((lot) => [lot.id, lot]))
    expect(byId.get('1')?.record).toBe('S-4403-1')
    expect(byId.get('1')?.itemNumber).toBe('4403-1')
    // Already right, a part, and a set nothing says the sequence of.
    expect(byId.get('2')?.record).toBe('S-4403-1')
    expect(byId.get('3')?.record).toBe('P-3001')
    expect(byId.get('4')?.record).toBe('S-99999')
    expect(lots).toHaveLength(4)
  })
})
