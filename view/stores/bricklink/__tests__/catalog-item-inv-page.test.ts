/**
 * Persisting a parsed inventory.
 *
 * IMPORTANT — what this fixture is, and what it is not. The markup below is
 * *reconstructed* from what the extractors in `handlePageResponse` look for; it
 * is not a captured BrickLink page. So this pins the half that is ours — the
 * record key the inventory is filed under, the id that keeps two colours of one
 * part apart, and the round trip through the new index — and it proves nothing
 * about whether the scrape still matches BrickLink's real HTML. That needs a
 * saved `catalogItemInv.asp` response dropped in as `PAGE`, which is the one
 * change this file should need.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCatalogItemInvPageStore } from '../catalog-item-inv-page'
import type { StoredItemInventory } from '../catalog-item-inv-page'
import { getAllFromIndex } from '../../../../idb/db'
import { getDbConnection } from '../../../../idb/idb'
import indices from '../../../../idb/indices'

const TABLE = '<TABLE BORDER="0" CELLPADDING="3" CELLSPACING="0" WIDTH="100%" CLASS="ta">'

/** One inventory row, in the marker order the extractors walk. */
function row(options: {
  itemId: string
  name: string
  thumbnail: string
  quantity: number
  colorId?: string
  colorName?: string
}) {
  const color = options.colorId
    ? ` idColor=${options.colorId}" `
    : ' '
  const variant = options.colorId
    ? `</A></TD><TD><B>${options.name} ${options.colorName}</B>`
    : ''
  return (
    `<TR class="IV_${options.itemId} ">` +
    `<TD><A href="/catalogItem.asp?${color}">Name: ${options.name}"</A></TD>` +
    variant +
    `<TD><IMG SRC='${options.thumbnail}'></TD>` +
    `<TD ALIGN="RIGHT">&nbsp;${options.quantity}&nbsp;</TD>` +
    `<TD><A href="/x?itemType=P"></A>` +
    `<A href="/y?catType=P&catString=5'>Bricks<</A></TD>` +
    `</TR>`
  )
}

const PAGE =
  '<html><body>' +
  TABLE +
  row({
    itemId: '3001',
    name: 'Brick 2 x 4',
    thumbnail: 'https://img.example/3001.png',
    quantity: 12,
    colorId: '11',
    colorName: 'Red'
  }) +
  row({
    itemId: '3001',
    name: 'Brick 2 x 4',
    thumbnail: 'https://img.example/3001b.png',
    quantity: 4,
    colorId: '1',
    colorName: 'Blue'
  }) +
  row({
    itemId: '3020',
    name: 'Plate 2 x 4',
    thumbnail: 'https://img.example/3020.png',
    quantity: 2
  }) +
  '<!-- Classic Contents End-->' +
  '</body></html>'

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
    expect(stored).toHaveLength(3)
    expect(new Set(stored.map((s) => s.record))).toEqual(new Set(['S-10511-1']))
  })

  it('keeps two colours of the same part apart', async () => {
    const store = useCatalogItemInvPageStore()
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    )

    const stored = await storedFor('S-10511-1')
    // Same part number, two colours: two rows, not one overwriting the other.
    const brick = stored.filter((s) => s.itemVariant.itemId === '3001')
    expect(brick).toHaveLength(2)
    expect(new Set(brick.map((s) => s.id)).size).toBe(2)
    expect(new Set(brick.map((s) => s.itemVariant.colorId))).toEqual(new Set(['11', '1']))
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
    expect(await storedFor('S-10511-1')).toHaveLength(3)
  })

  it('re-reading a page replaces its rows rather than doubling them', async () => {
    const store = useCatalogItemInvPageStore()
    const detail = detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    await store.handlePageResponse(detail)
    await store.handlePageResponse(detail)

    expect(await storedFor('S-10511-1')).toHaveLength(3)
  })

  it('files a different set separately', async () => {
    const store = useCatalogItemInvPageStore()
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=10511-1', PAGE)
    )
    await store.handlePageResponse(
      detailFor('https://www.bricklink.com/catalogItemInv.asp?S=60012-1', PAGE)
    )

    expect(await storedFor('S-10511-1')).toHaveLength(3)
    expect(await storedFor('S-60012-1')).toHaveLength(3)
  })
})
