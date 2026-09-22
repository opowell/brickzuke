/**
 * v33 brings every stored set up from its thumbnail to the normal-size
 * picture. In a file of its own for the reason the other upgrade tests are:
 * it needs the database at the version before, which every other test opens
 * past on its first line, and the fake IndexedDB is fresh per file.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { getDbConnection } from '../idb'
import STORES from '../stores'
import { getAll } from '../db'
import type { BrickLinkItem } from '../../view/stores/bricklink/catalog-download-page'

/** The database as v32 left it: a set on its thumbnail, a part, and a set already brought up. */
function writeOldShape(): Promise<void> {
  return new Promise((ok, no) => {
    const request = indexedDB.open('brickzuke', 32)
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
      const tx = db.transaction(STORES.BRICK_LINK_ITEMS.name, 'readwrite')
      const items = tx.objectStore(STORES.BRICK_LINK_ITEMS.name)
      items.put({
        id: 'S-10179-1',
        itemType: 'S',
        Number: '10179-1',
        Name: 'Millennium Falcon - UCS',
        image: 'https://img.bricklink.com/ItemImage/ST/0/10179-1.t2.png'
      })
      items.put({
        id: 'S-375-2',
        itemType: 'S',
        Number: '375-2',
        Name: 'Castle',
        image: 'https://img.bricklink.com/ItemImage/SN/0/375-2.png'
      })
      items.put({
        id: 'P-3001',
        itemType: 'P',
        Number: '3001',
        Name: 'Brick 2 x 4',
        image: 'https://img.bricklink.com/ItemImage/PL/3001.png'
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

describe('bringing stored sets up from their thumbnails', () => {
  it('rewrites a set on its thumbnail, and leaves every other row as it was', async () => {
    await writeOldShape()

    const db = await getDbConnection()
    expect(db.version).toBe(33)
    const items = (await getAll<BrickLinkItem>(db, STORES.BRICK_LINK_ITEMS)) ?? []
    db.close()

    const byId = new Map(items.map((item) => [item.id, item]))
    expect(byId.get('S-10179-1')?.image).toBe('https://img.bricklink.com/ItemImage/SN/0/10179-1.png')
    // The rest of the row untouched.
    expect(byId.get('S-10179-1')?.Name).toBe('Millennium Falcon - UCS')
    // A set already at size, and a part, are exactly as they were.
    expect(byId.get('S-375-2')?.image).toBe('https://img.bricklink.com/ItemImage/SN/0/375-2.png')
    expect(byId.get('P-3001')?.image).toBe('https://img.bricklink.com/ItemImage/PL/3001.png')
    expect(items).toHaveLength(3)
  })
})
