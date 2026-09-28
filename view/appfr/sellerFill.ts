/**
 * The sellers a table is about, and their shipping terms, fetched while it is
 * up.
 *
 * The sellers table fetches a country's sellers when the query names the
 * country, and the shipping tables fetch a seller's terms when it names the
 * seller — one page each, which is the table's own read. Asked anything wider,
 * `region:"Europe"` or `country:"AT"` on the shipping, each showed whatever
 * browsing had happened to gather, and said nothing about the rest. This is
 * the rest: the directory page of every country in scope that has none
 * stored, and then — for the shipping — the terms of every seller in scope
 * that has none stored.
 *
 * In [reachFill]'s manners, for the same reason — these are somebody else's
 * pages, asked for because a screen is open in front of somebody: one request
 * at a time with the reader's gap between them, only while the table is up,
 * nothing asked twice once stored, the biggest seller first, and a pause
 * rather than a string of failures while BrickLink's bot check stands — see
 * [botCheck].
 */
import { ref } from 'vue'
import { parseExpression } from 'header-content-layout'
import { throughBotCheck } from '../assets/js/bot-check'
import { catalogSchema } from './catalogSchema'
import { storedRows } from './catalogSource'
import { isLegoStore } from './legoLotsFetch'
import { matching } from './reach'
import { reachGapMs } from './settings'
import { readStorePolicy, storePolicyFor } from './storePolicyFetch'
import { countriesFor, readStores, storesFor } from './storesFetch'

/** Three failures in a row is the extension not being there — [homeFill]'s number. */
const GIVE_UP = 3

/** Ticks each time a country's sellers or a seller's terms land. See [tableReach]. */
export const sellersLanded = ref(0)

export type SellerFill = 'directory' | 'policies'

let current = 0
let issued = 0
let running = ''

/**
 * The countries whose sellers the query is about: the ones it names, by
 * `country:` or by the country a `province:` is in — and, where `wide`, every
 * country in a region it names, or every country there is where it names no
 * place at all. Only countries the directory counts any seller in: a country
 * with none has no page of sellers to wait for.
 */
export async function countriesInScope(expr: string, wide: boolean): Promise<string[]> {
  const codes = new Set<string>()
  const regions = new Set<string>()
  let placed = false
  for (const group of parseExpression(expr)) {
    for (const term of group) {
      if (term.kind !== 'field' || term.comparator !== ':' || term.negated) {
        continue
      }
      if (term.field === 'country' && /^[A-Z]{2}$/.test(term.value)) {
        codes.add(term.value)
        placed = true
      } else if (term.field === 'province' && /^[A-Z]{2}-/.test(term.value)) {
        codes.add(term.value.slice(0, 2))
        placed = true
      } else if (term.field === 'region') {
        regions.add(term.value)
        placed = true
      }
    }
  }
  if (!wide || (!regions.size && placed)) {
    return [...codes]
  }
  let countries
  try {
    countries = await countriesFor()
  } catch {
    // No directory of countries: the ones named are all there is to go on.
    return [...codes]
  }
  for (const country of countries) {
    if (country.storeCount > 0 && (!placed || regions.has(country.regionId))) {
      codes.add(country.countryCode)
    }
  }
  return [...codes]
}

/**
 * Fetches the sellers of each country that has none stored, one at a time,
 * while `live` says somebody still wants them. `landed` is told of each.
 */
export async function listSellers(
  codes: readonly string[],
  live: () => boolean,
  landed: () => void = () => undefined
): Promise<void> {
  let failures = 0
  for (const code of codes) {
    if (!live()) {
      return
    }
    try {
      if ((await readStores(code)).length) {
        continue
      }
      await throughBotCheck(() => storesFor(code), live)
      failures = 0
      landed()
    } catch {
      if (++failures >= GIVE_UP) {
        return
      }
    }
    await wait(reachGapMs.value)
  }
}

/** Starts the fill for a table, or leaves the one already running for it alone. */
export function startSellerFill(kind: SellerFill, expr: string): void {
  const asked = `${kind}|${expr.trim()}`
  if (current && running === asked) {
    return
  }
  running = asked
  const mine = (current = ++issued)
  void run(mine, kind, expr.trim())
}

/** Stops it, at whatever country or seller it had reached. What was fetched stays. */
export function stopSellerFill(): void {
  current = 0
  running = ''
}

async function run(mine: number, kind: SellerFill, expr: string): Promise<void> {
  const live = () => mine === current
  const landed = () => {
    if (live()) {
      sellersLanded.value++
    }
  }
  await listSellers(await countriesInScope(expr, true), live, landed)
  if (kind === 'policies' && live()) {
    await fetchPolicies(expr, live, landed)
  }
}

/** The terms of every seller in scope that has none stored, biggest seller first. */
async function fetchPolicies(expr: string, live: () => boolean, landed: () => void): Promise<void> {
  const stores = catalogSchema.value.entities.find((entity) => entity.key === 'stores')
  const scope = ((await storedRows('stores')) ?? [])
    .filter(matching(stores, expr))
    .sort((left, right) => Number(right.fields.items ?? 0) - Number(left.fields.items ?? 0))
  let failures = 0
  for (const row of scope) {
    if (!live()) {
      return
    }
    const username = String(row.fields.store ?? '')
    if (!username || isLegoStore(username) || (await readStorePolicy(username))) {
      continue
    }
    try {
      await throughBotCheck(() => storePolicyFor(username), live)
      failures = 0
      landed()
    } catch {
      if (++failures >= GIVE_UP) {
        return
      }
    }
    await wait(reachGapMs.value)
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
