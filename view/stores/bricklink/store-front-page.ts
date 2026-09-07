/**
 * What one seller has for sale, from the seller's own store front.
 *
 * The store directory names sellers and counts their items; it never says what
 * any of them are. BrickLink answers that on the store front — the page behind
 * `store.bricklink.com/BunteSteinewelt` — which asks `searchitems.ajax` for a
 * hundred lots at a time.
 *
 * Two requests deep, and the first is only for a number. That endpoint is
 * addressed by a numeric seller id and nothing else: `sid=1801484` answers,
 * `p=BunteSteinewelt` is rejected as an invalid parameter. The directory
 * carries only the username, so the front page is fetched first for the id it
 * declares in `StoreFront.store`.
 *
 * Not a pinia store, unlike most of its neighbours here: nothing about this is
 * view state — it fetches, parses and stores — and appfr reads it from a data
 * source that has no pinia in it. The same shape as [catalog-list-color-page].
 */
import { Call, makeJsonCall, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { ONE_DAY, ONE_WEEK } from '@/assets/js/timesToMs'
import { get, put, putAll } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'

/**
 * One lot a seller has on offer.
 *
 * `store` is the address — the seller's username — and is indexed, so reading
 * a store's inventory back is one lookup rather than a scan.
 */
export interface StoredStoreLot {
  id: string
  store: string
  /** `P-3001` as every other table here addresses an item. */
  record: string
  itemType: string
  itemNumber: string
  itemName: string
  description: string
  /** BrickLink's own one-letter code, `N` or `U`, as the lots table reads it. */
  condition: string
  colorId?: string
  colorName?: string
  quantity: number
  /**
   * Converted to the viewer's currency, as a number.
   *
   * BrickLink states the converted figure to full precision here and rounds it
   * only for display, which matters at these prices: a great many lots are
   * worth less than a cent apiece, and two decimal places make them all nought.
   */
  price: number
  /** What BrickLink printed for that, currency and all — `EUR 0.11`. */
  displayPrice: string
  /** The same lot in the seller's own currency — `US $0.13`. */
  nativePrice: string
  image?: string
}

/**
 * How much of a seller's inventory is stored.
 *
 * `lots` is what BrickLink says the store holds; `fetchedLots` is how far up
 * that the store actually goes. They differ when a seller ran past what appfr
 * was willing to fetch, and the difference is why this is written down rather
 * than held in memory: the rows outlive the session that fetched them, so the
 * caveat has to as well.
 */
export interface StoredStoreScope {
  store: string
  lots: number
  fetchedLots: number
}

/**
 * The most lots one request will answer with.
 *
 * A hundred, because a hundred is the ceiling: `pgSize=200` is not a bigger
 * page but a rejected one, and BrickLink falls back to its own default of 25.
 * Asking for more than this makes a store's inventory four times as many
 * requests, not fewer.
 */
export const PAGE_SIZE = 100

/** The seller's own front, which is the page that states the numeric id. */
export function storeFrontUrl(username: string): string {
  return `https://store.bricklink.com/${encodeURIComponent(username)}`
}

/** One page of a seller's lots, addressed by the id that front page gave up. */
export function storeItemsUrl(sid: number, page: number): string {
  return (
    'https://www.bricklink.com/ajax/clone/store/searchitems.ajax' +
    `?sid=${sid}&pg=${page}&pgSize=${PAGE_SIZE}`
  )
}

function frontOptions(username: string) {
  return {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
      priority: 'u=0, i',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    },
    referrer: storeFrontUrl(username),
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: null,
    method: 'GET',
    mode: 'cors',
    // The store front sits behind a bot check the extension passes only as the
    // browser it is running in — which is also why this is fetched with the
    // session's own cookies rather than as an anonymous request.
    credentials: 'include',
  }
}

function itemsOptions(username: string) {
  return {
    headers: {
      accept: '*/*',
      'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
      priority: 'u=1, i',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'x-requested-with': 'XMLHttpRequest',
    },
    referrer: storeFrontUrl(username),
    referrerPolicy: 'no-referrer-when-downgrade',
    body: null,
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
  }
}

export async function fetchStoreFront(username: string) {
  return await makeTextCall(
    Call.GET_STORE_FRONT_PAGE,
    storeFrontUrl(username),
    frontOptions(username),
    {
      username,
    },
    // A seller's numeric id does not change; the page it is printed on is what
    // goes stale, and a week is what every other page here is held for.
    ONE_WEEK,
  )
}

export async function fetchStoreItems(username: string, sid: number, page: number) {
  return await makeJsonCall(
    Call.GET_STORE_ITEMS,
    storeItemsUrl(sid, page),
    itemsOptions(username),
    {
      username,
      page,
    },
    // A day, as an item's lots get: prices and quantities are what this is
    // made of, and both are only true while the lot is still there.
    ONE_DAY,
  )
}

/**
 * The numeric ids learned from front pages, by username.
 *
 * Held here rather than stored because it is only wanted while a fetch is in
 * flight: once the lots are in IndexedDB they are read back by username, and
 * the id has nothing left to address.
 */
export const storeIds = new Map<string, number>()

/**
 * How many lots BrickLink says a store holds, learned from its first page.
 *
 * `totalLotCnt` and not the length of what came back — the whole point is to
 * know how much was not fetched.
 */
export const storeLotCounts = new Map<string, number>()

/**
 * The seller's numeric id, off the front page.
 *
 * `var StoreFront` is the anchor rather than `StoreFront.store`, which reads
 * like the tighter one and is not: the page scripts `StoreFront.store.id` in a
 * button handler well above the object that defines it, so starting there
 * finds the reference and never the declaration.
 */
export function parseStoreId(html: string): number | undefined {
  const at = html.indexOf('var StoreFront')
  if (at === -1) {
    return undefined
  }
  const from = html.indexOf('id:', at)
  if (from === -1) {
    return undefined
  }
  const to = html.indexOf(',', from)
  if (to === -1) {
    return undefined
  }
  const parsed = Number.parseInt(html.slice(from + 'id:'.length, to).trim(), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export interface StoreItemsResponse extends EventDetail {
  request: EventDetail['request'] & {
    extraParams: {
      username: string
      page: number
    }
  }
  response: {
    result?: {
      totalLotCnt?: number
      groups?: {
        items?: {
          invID: number
          itemName: string
          invDescription: string
          invNew: string
          invQty: number
          itemType: string
          itemNo: string
          colorID: number
          colorName: string
          salePrice: string
          invPrice: string
          nativePrice: string
          rawConvertedPrice: number
          smallImg: string
        }[]
      }[]
    }
  }
}

/**
 * New and Used as BrickLink writes them here, and as the rest of the app reads
 * them.
 *
 * The store front spells the condition out where an item's lots give the code,
 * and the code is what the conditions table is keyed by and what a
 * `condition:"N"` term compares against. One shape, so one answer.
 */
function conditionCode(invNew: string): string {
  return invNew?.toLowerCase().startsWith('u') ? 'U' : 'N'
}

export function handleStoreFrontResponse(detail: EventDetail) {
  const username = String(detail.request.extraParams?.username ?? '')
  const sid = parseStoreId(String(detail.response ?? ''))
  if (!username || sid === undefined) {
    return
  }
  storeIds.set(username, sid)
}

/** How far this store now goes, in lots stored against lots on offer. */
async function recordScope(store: string, lots: number, fetchedLots: number) {
  const db = await getDbConnection()
  try {
    const held = await get<StoredStoreScope>(db, STORES.STORE_LOT_SCOPES, store)
    await put<StoredStoreScope>(db, STORES.STORE_LOT_SCOPES, {
      store,
      lots,
      // The highest seen rather than a running sum: pages are fetched in order
      // and a page replayed from the call cache must not make the inventory
      // look longer than it is.
      fetchedLots: Math.max(held?.fetchedLots ?? 0, fetchedLots),
    })
  } finally {
    db.close()
  }
}

export async function handleStoreItemsResponse(detail: StoreItemsResponse) {
  const username = String(detail.request.extraParams?.username ?? '')
  const result = detail.response?.result
  if (!username || !result) {
    return
  }
  const page = Number(detail.request.extraParams?.page ?? 1)
  const lots = Number(result.totalLotCnt ?? 0)
  storeLotCounts.set(username, lots)

  const items = (result.groups ?? []).flatMap((group) => group.items ?? [])
  await recordScope(username, lots, Math.min((page - 1) * PAGE_SIZE + items.length, lots || Infinity))
  if (!items.length) {
    return
  }
  const db = await getDbConnection()
  try {
    await putAll<StoredStoreLot>(
      db,
      STORES.STORE_LOTS,
      items.map((item) => ({
        // The lot id, which is BrickLink's own and unique across sellers.
        id: String(item.invID),
        store: username,
        record: `${item.itemType}-${item.itemNo}`,
        itemType: item.itemType,
        itemNumber: item.itemNo,
        itemName: item.itemName,
        description: item.invDescription ?? '',
        condition: conditionCode(item.invNew),
        // A string, as an item's lots carry it, so one `colorid:` term reads
        // the same on both.
        colorId: item.colorID === undefined ? undefined : String(item.colorID),
        colorName: item.colorName,
        quantity: item.invQty,
        // What the buyer would pay, which is the sale price where there is one
        // — `invPrice` is the same figure before any discount. Both are already
        // converted; `nativePrice` is the one in the seller's own currency.
        price: item.rawConvertedPrice,
        displayPrice: item.salePrice || item.invPrice,
        nativePrice: item.nativePrice,
        // Protocol-relative as BrickLink states it, which resolves to nothing
        // useful in an `<img>` that the app serves over its own origin.
        image: item.smallImg ? 'https:' + item.smallImg : undefined,
      })),
    )
  } finally {
    db.close()
  }
}
