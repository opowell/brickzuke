/**
 * A seller's terms — where they ship, how, and what they say it costs — from
 * the policy their store front asks for.
 *
 * The store front's Terms tab is drawn from `policy.ajax`, which answers by
 * the same numeric seller id the lots do — see [store-front-page] — and says
 * three things worth keeping. `shipCountries` is where the seller ships at
 * all; `shipMethods` is the methods they offer, each marked `D` for buyers in
 * the seller's own country, `I` for everyone else or `B` for both; and
 * `sellerTermsShipping` is what they charge, which BrickLink holds as prose
 * and nowhere as data. The prose is stored as text, and what can be read out
 * of it is read at the table — see [shipping-terms].
 *
 * The same shape as its neighbour and for the same reason: not a pinia
 * store, because nothing about this is view state.
 */
import { Call, makeJsonCall, type EventDetail } from '~/assets/js/make-call'
import { ONE_WEEK } from '@/assets/js/timesToMs'
import { put } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'
import { storeFrontUrl } from './store-front-page'
import { termsText } from './shipping-terms'

/** Who a shipping method is offered to. */
export type ShippingReach = 'domestic' | 'international' | 'both'

/** One way a seller will send an order. */
export interface StoredShippingMethod {
  /** BrickLink's own id for the method, unique across sellers. */
  id: number
  name: string
  /** What the seller wrote beside it, if anything. */
  note: string
  reach: ShippingReach
}

/**
 * A seller's shipping and payment terms, as IndexedDB holds them: one record
 * per seller, under the username every other table addresses them by.
 */
export interface StoredStorePolicy {
  store: string
  /**
   * The countries the seller ships to, as the codes the directory keys them
   * by. Empty where the seller declared none — which BrickLink shows as a
   * store that ships everywhere, not one that ships nowhere.
   */
  shipsTo: string[]
  methods: StoredShippingMethod[]
  /** The currencies the seller takes, ISO codes. */
  currencies: string[]
  /** What the seller wrote about shipping charges, as text — see [termsText]. */
  shippingTerms: string
  /** Whether the seller charges VAT. */
  vat: boolean
  /** When this was read, in milliseconds since the epoch. */
  fetched: number
}

/** The policy, addressed by the id the front page gave up. */
export function storePolicyUrl(sid: number): string {
  return `https://store.bricklink.com/ajax/clone/store/policy.ajax?sid=${sid}`
}

function policyOptions(username: string) {
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
      'sec-fetch-site': 'same-origin',
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

export async function fetchStorePolicy(username: string, sid: number) {
  return await makeJsonCall(
    Call.GET_STORE_POLICY,
    storePolicyUrl(sid),
    policyOptions(username),
    {
      username,
    },
    // A week, as the front page is: terms change rarely, and the policy
    // itself logs when they last did.
    ONE_WEEK,
  )
}

export interface StorePolicyResponse extends EventDetail {
  request: EventDetail['request'] & {
    extraParams: {
      username: string
    }
  }
  response: {
    sellerTermsShipping?: string | null
    hasVAT?: boolean
    acceptedCurrencies?: {
      code: string
    }[]
    shipCountries?: {
      id: string
      name: string
    }[]
    shipMethods?: {
      id: number
      name: string
      note?: string | null
      shipsTo?: string
    }[]
    returnCode?: number
  }
}

/** BrickLink's one-letter reach as the word the table shows. */
function reachOf(shipsTo: string | undefined): ShippingReach {
  switch (shipsTo) {
    case 'D':
      return 'domestic'
    case 'I':
      return 'international'
    default:
      return 'both'
  }
}

/** The policy as the store holds it, from the answer as BrickLink gives it. */
export function toStoredPolicy(
  username: string,
  response: StorePolicyResponse['response'],
  fetched = Date.now()
): StoredStorePolicy {
  return {
    store: username,
    shipsTo: (response.shipCountries ?? []).map((country) => country.id),
    methods: (response.shipMethods ?? []).map((method) => ({
      id: method.id,
      name: method.name.trim(),
      note: (method.note ?? '').trim(),
      reach: reachOf(method.shipsTo)
    })),
    currencies: (response.acceptedCurrencies ?? []).map((currency) => currency.code),
    shippingTerms: termsText(response.sellerTermsShipping),
    vat: response.hasVAT === true,
    fetched
  }
}

export async function handleStorePolicyResponse(detail: StorePolicyResponse) {
  const username = String(detail.request.extraParams?.username ?? '')
  const response = detail.response
  // A store that is closed or unknown answers with a return code and no
  // terms; nothing about that is worth writing down as a policy.
  if (!username || !response || (response.returnCode !== undefined && response.returnCode !== 0)) {
    return
  }
  const db = await getDbConnection()
  try {
    await put<StoredStorePolicy>(db, STORES.STORE_POLICIES, toStoredPolicy(username, response))
  } finally {
    db.close()
  }
}
