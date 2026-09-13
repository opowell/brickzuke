/**
 * The records somebody writes themselves, round-tripped.
 *
 * What is worth pinning here is not that a `put` stores what it was given. It
 * is the two rules that make these stores different from every other store in
 * brickzuke: an edit of one field leaves the other fields alone, because there
 * is no second copy to re-fetch if it does not; and none of these stores may
 * ever be cleared by an upgrade, because nothing can fetch them again.
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach } from 'vitest'
import type { IDBPDatabase } from 'idb'
import { getDbConnection } from '../idb'
import STORES from '../stores'
import { putAll } from '../db'
import {createUserCategory,
  deleteUserCategory,
  loadUserCategories,
  updateUserCategory} from '../userCategory'
import {createUserItem,
  deleteUserItem,
  loadUserItems,
  updateUserItem,
  userItemIdOf,
  userItemRecord} from '../userItem'
import {addInventoryLine,
  loadInventoryLines,
  removeInventoryLine,
  updateInventoryLine} from '../userInventory'
import {addShopListItem,
  createShopList,
  deleteShopList,
  loadShopList,
  loadShopListItems,
  loadShopLists,
  shopListFromRecord,
  updateShopListItem} from '../shopList'

let db: IDBPDatabase

/** A fresh set of stores per test, these being stores that are written to. */
beforeEach(async () => {
  db = await getDbConnection()
  for (const store of [
    STORES.USER_CATEGORIES,
    STORES.USER_ITEMS,
    STORES.USER_INVENTORY_LINES,
    STORES.SHOP_LISTS,
    STORES.SHOP_LIST_ITEMS,
    STORES.ITEM_INVENTORIES
  ]) {
    await db.clear(store.name)
  }
})

describe('user categories', () => {
  it('creates, renames and deletes one', async () => {
    const made = await createUserCategory(db, 'Bits of my own')
    expect(made.id).toBeGreaterThan(0)
    expect(await loadUserCategories(db)).toHaveLength(1)

    await updateUserCategory(db, made.id, {
      name: 'Renamed' 
    })
    expect((await loadUserCategories(db))[0].name).toBe('Renamed')

    await deleteUserCategory(db, made.id)
    expect(await loadUserCategories(db)).toHaveLength(0)
  })

  it('gives a new one a name, so a fresh row is not a blank one', async () => {
    expect((await createUserCategory(db)).name).toBeTruthy()
  })
})

describe('user items', () => {
  it('keeps the fields an edit did not name', async () => {
    const made = await createUserItem(db, 'Sprue offcut')
    await updateUserItem(db, made.id, {
      note: 'from the 1978 bag' 
    })
    await updateUserItem(db, made.id, {
      categoryId: 5 
    })

    const [held] = await loadUserItems(db)
    // The whole point: a second edit must not take the first one with it.
    expect(held.note).toBe('from the 1978 bag')
    expect(held.categoryId).toBe(5)
    expect(held.name).toBe('Sprue offcut')
    expect(held.createdAt).toBeInstanceOf(Date)
  })

  it('does not resurrect a record that has been deleted', async () => {
    const made = await createUserItem(db, 'Gone')
    await deleteUserItem(db, made.id)
    expect(await updateUserItem(db, made.id, {
      name: 'Back?' 
    })).toBeUndefined()
    expect(await loadUserItems(db)).toHaveLength(0)
  })

  it('lists the newest first', async () => {
    await createUserItem(db, 'First')
    await createUserItem(db, 'Second')
    expect((await loadUserItems(db)).map((item) => item.name)).toEqual(['Second', 'First'])
  })
})

describe('an item record of their own', () => {
  it('reads as one and back, and never as one of BrickLink own', () => {
    expect(userItemRecord(3)).toBe('U-3')
    expect(userItemIdOf('U-3')).toBe(3)
    // Every shape a BrickLink record takes, and the near misses.
    for (const record of ['S-10511-1', 'P-3001', 'M-sw0001', 'U-', 'U-0', 'u-3', 'U-3x', 3]) {
      expect([record, userItemIdOf(record)]).toEqual([record, undefined])
    }
  })
})

describe('sets of their own: an item with parts', () => {
  it('files lines under the item record, in the order they were added', async () => {
    const set = userItemRecord((await createUserItem(db, 'My MOC')).id)
    await addInventoryLine(db, set, {
      part: 'P-3001',
      colorId: '5',
      quantity: 4 
    })
    await addInventoryLine(db, set, {
      part: 'P-3002',
      quantity: 2 
    })

    const lines = await loadInventoryLines(db, set)
    expect(lines.map((line) => line.part)).toEqual(['P-3001', 'P-3002'])
    expect(lines[0].quantity).toBe(4)
    expect(lines[0].record).toBe(set)
  })

  it('gives a new line one, not none', async () => {
    const set = userItemRecord((await createUserItem(db)).id)
    expect((await addInventoryLine(db, set)).quantity).toBe(1)
  })

  it('holds only the lines of the set asked about', async () => {
    const mine = userItemRecord((await createUserItem(db, 'Mine')).id)
    const theirs = userItemRecord((await createUserItem(db, 'Theirs')).id)
    await addInventoryLine(db, mine, {
      part: 'P-3001' 
    })
    await addInventoryLine(db, theirs, {
      part: 'P-3002' 
    })

    expect(await loadInventoryLines(db, mine)).toHaveLength(1)
    expect((await loadInventoryLines(db, mine))[0].part).toBe('P-3001')
  })

  it('edits and removes a line', async () => {
    const set = userItemRecord((await createUserItem(db)).id)
    const line = await addInventoryLine(db, set, {
      part: 'P-3001',
      quantity: 1 
    })
    await updateInventoryLine(db, line.id, {
      quantity: 9 
    })
    expect((await loadInventoryLines(db, set))[0].quantity).toBe(9)

    await removeInventoryLine(db, line.id)
    expect(await loadInventoryLines(db, set)).toHaveLength(0)
  })

  it('takes its parts with it when the item goes', async () => {
    const item = await createUserItem(db, 'My MOC')
    const set = userItemRecord(item.id)
    await addInventoryLine(db, set, {
      part: 'P-3001' 
    })
    await addInventoryLine(db, set, {
      part: 'P-3002' 
    })
    await deleteUserItem(db, item.id)

    // Nothing addressed to a record that has gone — IndexedDB has no cascade
    // of its own, so this is the whole of what enforces it.
    expect(await loadInventoryLines(db, set)).toHaveLength(0)
    expect(await db.count(STORES.USER_INVENTORY_LINES.name)).toBe(0)
  })

  it('leaves a line naming the deleted item as a part', async () => {
    const piece = await createUserItem(db, 'Sprue offcut')
    const set = userItemRecord((await createUserItem(db, 'My MOC')).id)
    await addInventoryLine(db, set, {
      part: userItemRecord(piece.id),
      name: 'Sprue offcut' 
    })
    await deleteUserItem(db, piece.id)
    // The line still says what it was called: losing the description is not
    // a reason to lose the line that wanted it.
    expect((await loadInventoryLines(db, set))[0].name).toBe('Sprue offcut')
  })
})

describe('shopping lists', () => {
  it('creates, fills, edits and deletes', async () => {
    const list = await createShopList(db, {
      name: 'Weekend order' 
    })
    const item = await addShopListItem(db, list.id, {
      record: 'P-3001',
      colorId: '5',
      minQuantity: 4,
      maxPrice: 0.2
    })
    expect((await loadShopList(db, list.id))?.items).toHaveLength(1)

    await updateShopListItem(db, item.id, {
      minQuantity: 10 
    })
    expect((await loadShopListItems(db, list.id))[0].minQuantity).toBe(10)
    // The edit left the rest of the line alone.
    expect((await loadShopListItems(db, list.id))[0].maxPrice).toBe(0.2)

    await deleteShopList(db, list.id)
    expect(await loadShopLists(db)).toHaveLength(0)
    expect(await db.count(STORES.SHOP_LIST_ITEMS.name)).toBe(0)
  })

  it('copies one of somebody own sets, quantity and all, by its record', async () => {
    const set = userItemRecord((await createUserItem(db, 'My MOC')).id)
    await addInventoryLine(db, set, {
      part: 'P-3001',
      colorId: '5',
      name: 'Brick 2 x 4',
      quantity: 4
    })
    await addInventoryLine(db, set, {
      part: 'P-3002',
      quantity: 2 
    })

    // The same call as for a set of BrickLink's: the record says which store.
    const list = await shopListFromRecord(db, set)
    expect(list?.sourceRecord).toBe(set)
    expect(list?.name).toBe('Parts for My MOC')
    const items = await loadShopListItems(db, list!.id)
    // A set needing four is a list wanting four.
    expect(items.map((item) => item.minQuantity).sort()).toEqual([2, 4])
    expect(items.find((item) => item.record === 'P-3001')?.name).toBe('Brick 2 x 4')
  })

  it('copies a set BrickLink lists, naming the part and not the set', async () => {
    await putAll(db, STORES.ITEM_INVENTORIES, [
      {
        id: 'S-10511-1/1',
        record: 'S-10511-1',
        quantity: 4,
        itemVariant: {
          itemType: 'P',
          itemId: '3001',
          name: 'Brick 2 x 4',
          colorId: '5',
          variantId: '3001-5'
        }
      },
      {
        id: 'S-10511-1/2',
        record: 'S-10511-1',
        quantity: 1,
        itemVariant: {
          itemType: 'P',
          itemId: '3002',
          name: 'Brick 2 x 3',
          variantId: '3002'
        }
      }
    ])

    const list = await shopListFromRecord(db, 'S-10511-1', 'Big Ben')
    expect(list?.sourceRecord).toBe('S-10511-1')
    expect(list?.name).toContain('Big Ben')
    const items = await loadShopListItems(db, list!.id)
    // The part's own record, not the set's — the bug this assertion is for.
    expect(items.map((item) => item.record).sort()).toEqual(['P-3001', 'P-3002'])
    expect(items.find((item) => item.record === 'P-3001')?.colorId).toBe('5')
  })

  it('says nothing rather than making an empty list for an unopened set', async () => {
    // A set whose inventory nobody has fetched has no parts stored, and a list
    // with nothing on it would look like a set with nothing in it.
    expect(await shopListFromRecord(db, 'S-99999-1')).toBeUndefined()
  })
})

describe('the stores nobody scraped', () => {
  it('is never cleared by an upgrade', () => {
    // IndexedDB will not guard this, and the cost of getting it wrong is
    // somebody's own records gone with no second copy anywhere. Asserted
    // against the source because what must never appear is a line of code.
    // Read by path rather than off `import.meta.url`: the tests run under
    // happy-dom, where that is an http URL and not a file one.
    const source = readFileSync('idb/idb.ts', 'utf8')
    const upgrade = source.slice(source.indexOf('async upgrade'))
    // What is cleared, and not merely what is named: v26 walks USER_ITEMS to
    // rewrite each row in place, which is exactly the thing that is allowed.
    // A store is cleared one of two ways here — on its own, or in a list the
    // loop over `store` clears — and both are read for the names they hold.
    const cleared = new Set<string>()
    for (const [, name] of upgrade.matchAll(/objectStore\(STORES\.(\w+)\.name\)\.clear\(\)/g)) {
      cleared.add(name)
    }
    for (const [, list] of upgrade.matchAll(/for \(const store of \[([^\]]*)\]\)/g)) {
      for (const [, name] of list.matchAll(/STORES\.(\w+)/g)) {
        cleared.add(name)
      }
    }
    // The assertion has teeth only if the reading finds the clears there are.
    expect(cleared).toContain('COLOR_ITEMS')
    expect(cleared).toContain('STORE_LOTS')
    for (const store of [
      'USER_CATEGORIES',
      'USER_ITEMS',
      'USER_INVENTORIES',
      'USER_INVENTORY_LINES',
      'SHOP_LISTS',
      'SHOP_LIST_ITEMS'
    ]) {
      expect(cleared).not.toContain(store)
    }
  })
})
