/**
 * The third migration of a store nobody scraped, and the first that re-keys
 * one: a modifier keyed by what it is on becomes one keyed by the profile it
 * is in as well, which IndexedDB only allows by dropping the store and making
 * it again.
 *
 * In a file of its own for the reason [foldCategories] is: it needs the
 * database at the version before, with the store keyed as that version keyed
 * it. The fake IndexedDB is fresh per test file, so the old shape is made by
 * hand and `getDbConnection` brings it forward.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { getDbConnection } from '../idb'
import STORES from '../stores'
import { loadAllPriceModifiers, loadPriceModifiers } from '../priceModifier'
import { loadPriceModifierProfiles } from '../priceModifierProfile'

/**
 * The database as v29 left it: every store but the profiles, the modifiers
 * keyed `[entity, key]`, and two factors somebody typed.
 */
function writeOldShape(): Promise<void> {
  return new Promise((ok, no) => {
    const request = indexedDB.open('brickzuke', 29)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of Object.values(STORES)) {
        if (store === STORES.PRICE_MODIFIER_PROFILES) {
          continue
        }
        db.createObjectStore(store.name, {
          keyPath: store === STORES.PRICE_MODIFIERS ? ['entity', 'key'] : store.keyPath,
          autoIncrement: store.autoIncrement === true
        })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(STORES.PRICE_MODIFIERS.name, 'readwrite')
      tx.objectStore(STORES.PRICE_MODIFIERS.name).put({
        entity: 'colors',
        key: '5',
        factor: 1.2
      })
      tx.objectStore(STORES.PRICE_MODIFIERS.name).put({
        entity: 'stores',
        key: 'brickmeister',
        factor: 0.9
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

describe('filing the price modifiers under a profile', () => {
  it('carries every factor across under one profile made for them', async () => {
    await writeOldShape()

    const db = await getDbConnection()
    expect(db.version).toBe(32)
    const profiles = await loadPriceModifierProfiles(db)
    const all = await loadAllPriceModifiers(db)

    // One profile, named so that it can be found on the table and picked.
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Default')

    // Both factors, as they were, now saying which profile they are in — and
    // readable by it, which is the index the new store carries.
    expect(all).toHaveLength(2)
    expect(all.every((modifier) => modifier.profileId === profiles[0].id)).toBe(true)
    expect(await loadPriceModifiers(db, profiles[0].id)).toMatchObject([
      {
        entity: 'colors',
        key: '5',
        factor: 1.2
      },
      {
        entity: 'stores',
        key: 'brickmeister',
        factor: 0.9
      }
    ])
    db.close()
  })
})
