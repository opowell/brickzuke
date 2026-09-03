/**
 * Scraping and persisting a set's inventory.
 *
 * The fixture is a real `catalogItemInv.asp` response — the inventory table
 * BrickLink served for set 10511-1, trimmed to six rows and checked for
 * anything identifying, since it was fetched with a logged-in session. Four of
 * those rows carry a colour and two do not, which is the branch the parser
 * takes separately.
 *
 * So this covers both halves: that the scrape still matches the markup
 * BrickLink actually sends, and that what it parses is filed where a set can
 * find it again.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCatalogItemInvPageStore } from '../catalog-item-inv-page'
import type { StoredItemInventory } from '../catalog-item-inv-page'
import { getAllFromIndex } from '../../../../idb/db'
import { getDbConnection } from '../../../../idb/idb'
import indices from '../../../../idb/indices'
import PAGE from './fixtures/catalogItemInv-S-10511-1.html?raw'


function detailFor(url: string, response: string) {
  return {
    request: {
      url,
      call: 'x',
      type: 'x',
      options: {}
    },
    response
  } as never
}

async function storedFor(record: string) {
  const db = await getDbConnection()
  const rows = await getAllFromIndex<StoredItemInventory>(
    db,
    indices.ITEM_INVENTORIES_BY_RECORD,
    record
  )
  db.close()
  return rows ?? []
}

describe('inventory persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('files an inventory under the BrickLink id an item record carries', async () => {
    // `catalogItemInv.asp?S=10511-1` is the inventory of `S-10511-1`, which is
    // exactly the id the item records table shows. That equality is the whole
    // bridge between a set and its parts, so it is the thing to pin.
    const store = useCatalogItemInvPageStore()
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    )

    const stored = await storedFor('S-10511-1')
    expect(stored).toHaveLength(6)
    expect(new Set(stored.map((s) => s.record))).toEqual(new Set(['S-10511-1']))
    // Parsed off the real page, not invented: a part number, a name, a colour
    // and a quantity that all came out of BrickLink's own markup.
    const brick = stored.find((s) => s.itemVariant.itemId === '3011')!
    expect(brick.quantity).toBe(1)
    expect(brick.itemVariant.name).toBe('Duplo, Brick 2 x 4')
    expect(brick.itemVariant.colorName).toBe('Blue')
    expect(brick.itemVariant.itemType).toBe('P')
  })

  it('gives every part its own row, colour or no colour', async () => {
    const store = useCatalogItemInvPageStore()
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    )

    const stored = await storedFor('S-10511-1')
    // The id carries the variant, so nothing overwrites anything.
    expect(new Set(stored.map((s) => s.id)).size).toBe(stored.length)
    // The fixture holds both kinds of row the parser branches on.
    expect(stored.some((s) => s.itemVariant.colorId !== undefined)).toBe(true)
    expect(stored.some((s) => s.itemVariant.colorId === undefined)).toBe(true)
  })

  it('survives a reload, which the Pinia maps did not', async () => {
    const store = useCatalogItemInvPageStore()
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    )

    // A new store is a fresh set of maps — the reload this store used to lose
    // everything to. The rows are still in IndexedDB.
    setActivePinia(createPinia())
    expect(useCatalogItemInvPageStore().itemInventories.size).toBe(0)
    expect(await storedFor('S-10511-1')).toHaveLength(6)
  })

  it('re-reading a page replaces its rows rather than doubling them', async () => {
    const store = useCatalogItemInvPageStore()
    const detail = detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    await store.handlePageResponse(detail)
    await store.handlePageResponse(detail)

    expect(await storedFor('S-10511-1')).toHaveLength(6)
  })

  it('files a different set separately', async () => {
    const store = useCatalogItemInvPageStore()
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    )
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=60012-1', PAGE)
    )

    expect(await storedFor('S-10511-1')).toHaveLength(6)
    expect(await storedFor('S-60012-1')).toHaveLength(6)
  })
})
