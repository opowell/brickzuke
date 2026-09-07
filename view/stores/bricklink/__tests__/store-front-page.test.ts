/**
 * Scraping and persisting what a seller has for sale.
 *
 * Two fixtures because it takes two requests. The HTML is a real store front,
 * trimmed to the two places it names `StoreFront.store` — a button handler
 * that reads the id, and, far below it, the object that declares one. The JSON
 * is a real `searchitems.ajax` answer, trimmed to three lots.
 *
 * Two different sellers, deliberately. The JSON is an American store, so its
 * prices are quoted in dollars and converted into euros, which is the case
 * that tells the two price fields apart — a German seller's are the same
 * figure twice and would pin nothing.
 *
 * The HTML half is the fragile one and the reason it is pinned here: the whole
 * feature rests on that page still printing a numeric id, because the endpoint
 * that lists a store's lots is addressed by it and by nothing else —
 * `p=BunteSteinewelt` is rejected as an invalid parameter.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {PAGE_SIZE,
  handleStoreFrontResponse,
  handleStoreItemsResponse,
  parseStoreId,
  storeIds,
  storeItemsUrl,
  storeLotCounts} from '../store-front-page'
import type { StoreItemsResponse, StoredStoreLot, StoredStoreScope } from '../store-front-page'
import { get, getAllFromIndex } from '../../../../idb/db'
import { getDbConnection } from '../../../../idb/idb'
import indices from '../../../../idb/indices'
import STORES from '../../../../idb/stores'
import FRONT from './fixtures/storeFront-BunteSteinewelt.html?raw'
import ITEMS from './fixtures/storeItems-TeDE.json'

function frontDetail(username: string, response: string) {
  return {
    request: {
      url: `https://store.bricklink.com/${username}`,
      call: 'x',
      type: 'x',
      options: {},
      extraParams: {
        username,
      },
    },
    response,
  } as unknown as Parameters<typeof handleStoreFrontResponse>[0]
}

function itemsDetail(username: string, page: number, response: unknown) {
  return {
    request: {
      url: storeItemsUrl(1801484, page),
      call: 'x',
      type: 'x',
      options: {},
      extraParams: {
        username,
        page,
      },
    },
    response,
  } as unknown as StoreItemsResponse
}

/** The lots filed under one seller, read back through the index they are stored by. */
async function storedFor(username: string): Promise<StoredStoreLot[]> {
  const db = await getDbConnection()
  try {
    return (await getAllFromIndex<StoredStoreLot>(db, indices.STORE_LOTS_BY_STORE, username))!
  } finally {
    db.close()
  }
}

beforeEach(() => {
  storeIds.clear()
  storeLotCounts.clear()
})

describe('the store front', () => {
  it('reads the numeric id the lots endpoint is addressed by', () => {
    expect(parseStoreId(FRONT)).toBe(1801484)
  })

  it('takes the declaration and not the reference above it', () => {
    // `StoreFront.store.id` appears in a button handler long before the object
    // that defines it. Anchoring on that name rather than on `var StoreFront`
    // finds the handler, whose next `id:` is in some other object entirely —
    // so this asserts the trap, not just the happy path.
    expect(FRONT.indexOf('StoreFront.store.id')).toBeLessThan(FRONT.indexOf('var StoreFront'))
    expect(parseStoreId(FRONT)).toBe(1801484)
  })

  it('says nothing rather than guessing when the page has no such object', () => {
    expect(parseStoreId('<html><body>Store closed</body></html>')).toBeUndefined()
  })

  it('files the id under the username that was asked for', () => {
    handleStoreFrontResponse(frontDetail('BunteSteinewelt', FRONT))
    expect(storeIds.get('BunteSteinewelt')).toBe(1801484)
  })
})

describe('a page of lots', () => {
  it('asks for a hundred at a time, which is the most BrickLink answers with', () => {
    // `pgSize=200` is not a bigger page but a rejected one — BrickLink falls
    // back to its own default of 25, so asking for more costs requests.
    expect(PAGE_SIZE).toBe(100)
    expect(storeItemsUrl(1801484, 2)).toBe(
      'https://www.bricklink.com/ajax/clone/store/searchitems.ajax' +
        '?sid=1801484&pg=2&pgSize=100',
    )
  })

  it('stores each lot under the seller, addressed the way every table names an item', async () => {
    await handleStoreItemsResponse(itemsDetail('TeDE', 1, ITEMS))
    const stored = await storedFor('TeDE')
    expect(stored.length).toBe(3)
    const lot = stored.find((one) => one.id === '459422732')!
    expect(lot.record).toBe('P-87615')
    expect(lot.itemName).toBe('Aircraft Fuselage Aft Section Curved Top 6 x 10')
    expect(lot.description).toBe('Heavy playwear.')
    expect(lot.colorName).toBe('White')
    expect(lot.quantity).toBe(1)
    // Protocol-relative as BrickLink states it, which resolves to nothing in an
    // `<img>` the app serves from its own origin.
    expect(lot.image).toBe('https://img.bricklink.com/ItemImage/PT/1/87615.t1.png')
  })

  it('keeps the converted price apart from what the seller charges', async () => {
    await handleStoreItemsResponse(itemsDetail('TeDE', 1, ITEMS))
    const lot = (await storedFor('TeDE')).find((one) => one.id === '459422732')!
    // An American seller read by a European: the number worth comparing across
    // stores is the converted one, and the seller's own figure is the one that
    // can be checked against their shop.
    expect(lot.price).toBe(0.1136)
    expect(lot.displayPrice).toBe('EUR 0.1136')
    expect(lot.nativePrice).toBe('US $0.132')
  })

  it('keeps the precision that two decimal places would throw away', async () => {
    await handleStoreItemsResponse(itemsDetail('TeDE', 1, ITEMS))
    const lot = (await storedFor('TeDE')).find((one) => one.id === '420378664')!
    // Under three cents. Most of a bulk seller's inventory is priced like this,
    // and rounding it for storage would make a whole table read `0.00`.
    expect(lot.price).toBe(0.0293)
  })

  it('writes the condition as the code the rest of the app compares against', async () => {
    await handleStoreItemsResponse(itemsDetail('TeDE', 1, ITEMS))
    const stored = await storedFor('TeDE')
    // The front spells it out where an item's lots give `U`; the conditions
    // table is keyed by the code, so one shape has to win and it is the code.
    expect(new Set(stored.map((one) => one.condition))).toEqual(new Set(['U']))
  })

  it('records how far up the store it got, against how far it goes', async () => {
    await handleStoreItemsResponse(itemsDetail('TeDE', 1, ITEMS))
    const db = await getDbConnection()
    const scope = await get<StoredStoreScope>(db, STORES.STORE_LOT_SCOPES, 'TeDE')
    db.close()
    // 4,996 on offer and three read: the gap is the whole reason this is
    // written down rather than counted off the rows.
    expect(scope!.lots).toBe(4996)
    expect(scope!.fetchedLots).toBe(3)
    expect(storeLotCounts.get('TeDE')).toBe(4996)
  })

  it('does not let a replayed page make the store look shorter than it is', async () => {
    await handleStoreItemsResponse(itemsDetail('TeDE', 3, ITEMS))
    await handleStoreItemsResponse(itemsDetail('TeDE', 1, ITEMS))
    const db = await getDbConnection()
    const scope = await get<StoredStoreScope>(db, STORES.STORE_LOT_SCOPES, 'TeDE')
    db.close()
    // Page three reached lot 203; page one arriving afterwards — off the call
    // cache, say — must not roll that back to three.
    expect(scope!.fetchedLots).toBe(2 * PAGE_SIZE + 3)
  })
})
