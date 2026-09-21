/**
 * Putting lots into a BrickLink cart — the one thing here that is sent to
 * BrickLink rather than read from it.
 *
 * The store front's Add to Cart posts `cart/add.ajax` on `store.bricklink.com`
 * with the lots as JSON in one form field, `itemArray`, each lot as its
 * inventory id and a quantity, plus the seller's numeric id twice over — once
 * per lot as `sellerID` and once as `sid` — and a `srcLocation` that says which
 * page the press was made on. BrickLink's cart is one cart per seller, so a
 * lot can only go into its own seller's, which is why the request is by seller
 * and a cart spanning three sellers is three of them. The answer is a
 * `returnCode` for the request and one status per lot, `code` nought where the
 * lot went in and a `msg` where it did not: a lot sold out since, or a
 * quantity past what the seller has.
 *
 * Read off `storebuildjs` on the store front on 2026-09-21. The same shape as
 * its neighbours and for the same reason: not a pinia store, because nothing
 * about this is view state — and nothing here is cached either, an add being
 * a thing done rather than a page held. See `sendOnce`.
 */
import { Call, sendOnce } from '~/assets/js/make-call'
import { storeFrontUrl } from './store-front-page'

/** Where the store front posts an add. */
export const CART_ADD_URL = Call.ADD_TO_CART

/** Where BrickLink shows what every seller's cart holds. */
export const BRICKLINK_CART_URL = 'https://www.bricklink.com/v2/globalcart.page'

/**
 * `bl.srcmap.location.STOREFRONT` — the store front, which is the page a
 * buyer adding from a seller's own inventory is on. A tracking figure only.
 */
const SRC_LOCATION_STOREFRONT = 1100

/**
 * `getCartSourceType()` on the store front: `1` for the ordinary inventory,
 * where `2` is a wanted-list match and `5` a featured item.
 */
const SOURCE_TYPE_INVENTORY = 1

/**
 * How long to wait for BrickLink's answer before saying nothing is coming —
 * the same budget a page gets, and for the same reason: it arrives through
 * the browser extension, or not at all.
 */
const DEADLINE_MS = 20_000

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It sends the lots to BrickLink on ' +
  "the app's behalf — check it is installed and that you are signed in to BrickLink."

/** One lot to put in: BrickLink's inventory id, and how many. */
export interface CartAddLot {
  lotId: string
  quantity: number
}

/** The form the store front posts, as a string. */
export function cartAddBody(sid: number, lots: CartAddLot[]): string {
  const itemArray = lots.map((lot) => ({
    invID: lot.lotId,
    invQty: lot.quantity,
    sellerID: sid,
    sourceType: SOURCE_TYPE_INVENTORY,
  }))
  return new URLSearchParams({
    itemArray: JSON.stringify(itemArray),
    sid: String(sid),
    srcLocation: String(SRC_LOCATION_STOREFRONT),
  }).toString()
}

/**
 * The fetch options, as `itemsOptions` in [store-front-page] gives them for a
 * read of the same store, but a POST with a form body.
 */
export function cartAddOptions(username: string, sid: number, lots: CartAddLot[]) {
  return {
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      priority: 'u=1, i',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-requested-with': 'XMLHttpRequest',
    },
    referrer: storeFrontUrl(username),
    referrerPolicy: 'no-referrer-when-downgrade',
    body: cartAddBody(sid, lots),
    method: 'POST',
    mode: 'cors',
    // The cart is the signed-in buyer's, so the request has to be theirs too.
    credentials: 'include',
  }
}

/** What BrickLink answers, as much of it as is read. */
export interface CartAddResponse {
  returnCode?: number | string
  returnMessage?: string | null
  errors?: number | string
  itemReturnStatus?: {
    invID?: number | string
    code?: number | string
    msg?: string | null
  }[]
}

/** A lot BrickLink would not take, and what it said about it. */
export interface CartAddRefusal {
  lotId: string
  reason: string
}

/** How the request went: which lots are in the cart now, and which are not. */
export interface CartAddOutcome {
  added: string[]
  refused: CartAddRefusal[]
}

/**
 * The outcome, off the answer.
 *
 * A `returnCode` other than nought is the whole request refused — the store
 * closed, say, which `-2` and a `returnMessage` carry — and then every lot is
 * refused for that reason. Otherwise each lot's status says for itself; a lot
 * the answer does not mention at all is taken as refused too, since it is not
 * in the cart and nothing said it was.
 */
export function readCartAddResponse(response: unknown, lots: CartAddLot[]): CartAddOutcome {
  const answer = (response ?? {}) as CartAddResponse
  const code = Number(answer.returnCode)
  if (!Number.isFinite(code) || code !== 0) {
    const reason =
      (answer.returnMessage && String(answer.returnMessage).trim()) ||
      `BrickLink refused the request (code ${answer.returnCode ?? 'unknown'})`
    return {
      added: [],
      refused: lots.map((lot) => ({
        lotId: lot.lotId,
        reason,
      })),
    }
  }
  const statuses = new Map(
    (answer.itemReturnStatus ?? []).map((status) => [String(status.invID ?? ''), status]),
  )
  const added: string[] = []
  const refused: CartAddRefusal[] = []
  for (const lot of lots) {
    const status = statuses.get(lot.lotId)
    if (!status) {
      refused.push({
        lotId: lot.lotId,
        reason: 'BrickLink did not answer for this lot',
      })
    } else if (Number(status.code) === 0) {
      added.push(lot.lotId)
    } else {
      refused.push({
        lotId: lot.lotId,
        reason: (status.msg && String(status.msg).trim()) || `Refused (code ${status.code})`,
      })
    }
  }
  return {
    added,
    refused,
  }
}

/**
 * Puts these lots into the buyer's cart at this seller, and says how it went.
 *
 * Rejects only where nothing answered at all; a lot BrickLink would not take
 * is a refusal in the outcome, not an error.
 */
export async function addToBrickLinkCart(
  username: string,
  sid: number,
  lots: CartAddLot[],
): Promise<CartAddOutcome> {
  const response = await sendOnce(
    Call.ADD_TO_CART,
    CART_ADD_URL,
    cartAddOptions(username, sid, lots),
    DEADLINE_MS,
    MISSING_EXTENSION,
  )
  return readCartAddResponse(response, lots)
}
