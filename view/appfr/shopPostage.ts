/**
 * What each seller would charge to post an order to the country the "Ship
 * to" setting names, for the tables that put a figure beside a seller.
 *
 * Three things meet here and nowhere else: the setting — see [settings] —
 * which is a code; the sellers' terms, stored as prose and read at the table
 * — see [storePolicyFetch] and [shipping-terms]; and the reading of a
 * heading against a country — see [shipping-match]. What comes out is a set
 * of fields a row can carry: the figure, its currency, the line it was read
 * off, and a word for the sellers who have no figure.
 *
 * Read from what is stored and never fetched: the shop sellers table lists
 * every seller with anything on the list, which is hundreds, and a request
 * per seller to draw one column is not what anybody pressing "Shop sellers"
 * asked for. A seller's terms are fetched behind their lots, so the sellers
 * somebody has looked at are the sellers with a figure, and the rest fill in
 * as they are looked at.
 */
import type { ShellRow } from 'header-content-layout'
import { readStorePolicies } from './storePolicyFetch'
import type { StoredStorePolicy } from '../stores/bricklink/store-policy-page'
import type { Country, Store } from '../stores/bricklink/stores-page'
import { currencyOf, parseShippingCosts } from '../stores/bricklink/shipping-terms'
import type { ShippingCost } from '../stores/bricklink/shipping-terms'
import { postageTo, ratesTo } from '../stores/bricklink/shipping-match'
import type { OrderValue, Place, Postage, ShippingTerms } from '../stores/bricklink/shipping-match'
import { priceCurrency } from './priceCurrency'
import { shipTo } from './settings'

/** The two lookups a seller's country and the ship-to country are read from. */
export interface Directory {
  sellers: Map<string, Store>
  countries: Map<string, Country>
}

/** A country by code, with what the directory adds where it has been read. */
export function placeOf(code: string | undefined, directory: Directory): Place | undefined {
  if (!code) {
    return undefined
  }
  const country = directory.countries.get(code)
  return {
    code,
    name: country?.countryName,
    region: country?.regionId
  }
}

/** The country an order would go to, or nothing while the setting is blank. */
export function shipToPlace(directory: Directory): Place | undefined {
  return placeOf(shipTo.value.trim() || undefined, directory)
}

/** A seller's own country: what the row says, or what the directory does. */
export function sellerPlace(
  store: string,
  country: string | undefined,
  directory: Directory
): Place | undefined {
  return placeOf(country ?? directory.sellers.get(store)?.countryID, directory)
}

/** A stored policy as the matching reads it, the rates read out of the prose. */
export function termsOf(policy: StoredStorePolicy): ShippingTerms {
  return {
    shipsTo: policy.shipsTo,
    rates: parseShippingCosts(policy.shippingTerms, {
      currencies: policy.currencies
    })
  }
}

/** Every stored policy by seller, read once per table draw. */
export async function policiesByStore(): Promise<Map<string, StoredStorePolicy>> {
  return new Map((await readStorePolicies()).map((policy) => [policy.store, policy]))
}

/**
 * An order's total as something a rate bounded by value can be held against:
 * the figure in the currency the lots were converted into, where one has
 * been read off a price yet.
 */
function orderOf(cost: unknown): OrderValue | undefined {
  const value = Number(cost)
  if (!Number.isFinite(value) || !priceCurrency.value) {
    return undefined
  }
  return {
    value,
    currency: currencyOf(priceCurrency.value)
  }
}

/** What the cell says for a seller with no figure. */
const NOTE: Record<Exclude<Postage['kind'], 'rate'>, string> = {
  unshipped: 'Not to there',
  unread: 'Not read'
}

/** The fields a row carries for its postage — none where nothing can be said. */
export function postageFields(postage: Postage | undefined): Record<string, unknown> {
  if (!postage) {
    return {}
  }
  if (postage.kind !== 'rate') {
    return {
      postageNote: NOTE[postage.kind]
    }
  }
  const rate = postage.rate
  return {
    postage: rate.cost,
    postageCurrency: rate.currency,
    // Where it was read from, for the hover: the reading is a guess and this
    // is what to check it against.
    postageSource: [rate.destination, rate.source].filter(Boolean).join(' — ')
  }
}

/**
 * The seller rows with their postage to the ship-to country filled in.
 *
 * Each row names its seller in `store`, the seller's country in `country`
 * and the order's total in `cost`; the rows come back with the postage
 * fields added, or untouched while the setting is blank.
 */
export async function withPostage(rows: ShellRow[], directory: Directory): Promise<ShellRow[]> {
  const to = shipToPlace(directory)
  if (!to || !rows.length) {
    return rows
  }
  const policies = await policiesByStore()
  return rows.map((row) => {
    const store = String(row.fields.store ?? '')
    const policy = policies.get(store)
    if (!policy) {
      return row
    }
    const from = sellerPlace(store, row.fields.country as string | undefined, directory)
    const postage = postageTo(termsOf(policy), to, from, orderOf(row.fields.cost))
    return {
      ...row,
      fields: {
        ...row.fields,
        ...postageFields(postage)
      }
    }
  })
}

/**
 * Which of a seller's rates are the ones for the ship-to country — the rows
 * of the shipping costs table that would be picked from — or none while the
 * setting is blank or the seller does not post there.
 */
export function ratesApplying(policy: StoredStorePolicy, rates: ShippingCost[], directory: Directory): Set<ShippingCost> {
  const to = shipToPlace(directory)
  if (!to || (policy.shipsTo.length && !policy.shipsTo.includes(to.code))) {
    return new Set()
  }
  const from = sellerPlace(policy.store, undefined, directory)
  return new Set(ratesTo(rates, to, from))
}
