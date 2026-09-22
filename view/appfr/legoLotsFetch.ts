/**
 * Getting LEGO's own prices, as lots of one more seller.
 *
 * Two ways in, as there are for any seller. Naming an item asks LEGO about
 * that item and nothing else — one small request, whose answer lands among
 * the item's lots from BrickLink's sellers — see [legoLotsOf]. Opening LEGO's
 * own inventory is its whole shop, a page at a time, the way a BrickLink
 * seller's front is fetched: every set, then every Pick a Brick element —
 * see [legoStorePages].
 *
 * Which shop is the Ship to setting's. LEGO prices a set in each country's
 * own currency and some countries have no shop at all, so without a country
 * there is no LEGO to ask, and a country changed is a different price list:
 * the old one's lots are dropped the first time the new one is asked.
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { Call, processQueue } from '../assets/js/make-call'
import { countFromIndex, count, getAllFromIndex, get } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import STORES from '../../idb/stores'
import { fetchElementCodes, type ElementCode } from '../stores/bricklink/element-codes'
import type { StoredStoreLot } from '../stores/bricklink/store-front-page'
import type { Store } from '../stores/bricklink/stores-page'
import {ELEMENTS_PER_ASK,
  LEGO_NAME,
  LEGO_STORE,
  answerKey,
  fetchLegoElementPage,
  fetchLegoElements,
  fetchLegoProduct,
  fetchLegoSetPage,
  legoAnswers,
  legoLocale,
  productCodeOf,
  readLegoLots,
  readLegoScope,
  type LegoStoreScope} from '../stores/lego/lego-shop'
import type { Pages } from './pageFill'
import { shipTo } from './settings'

/**
 * How long to wait for one answer — the budget a BrickLink page gets, and for
 * the same reason: it arrives through the browser extension, or not at all.
 */
const DEADLINE_MS = 20_000

/**
 * How long the element codes get. One file for every part BrickLink lists,
 * and the slowest thing here to arrive by some way.
 */
const CODES_DEADLINE_MS = 120_000

const MISSING_EXTENSION =
  'No answer from LEGO.com. The BrickZuke extension asks it on the ' +
  "app's behalf — check it is installed, and reloaded since it was updated. " +
  'If it is, LEGO.com may be refusing its requests for now.'

const MISSING_CODES =
  "BrickLink's element numbers did not arrive. They come from a catalogue " +
  'download, which needs you signed in to BrickLink.'

const NO_SHOP =
  'LEGO prices are per country. Choose a Ship to country in Settings to see them.'

/** Whether a seller is LEGO. */
export function isLegoStore(store: string | undefined): boolean {
  return store === LEGO_STORE
}

/** The shop the Ship to setting stands for, or none. */
export function currentLegoLocale(): string | undefined {
  return legoLocale(shipTo.value)
}

/**
 * LEGO as the directory states a seller: in the country it ships to, since
 * that is the shop its prices are from. None without a Ship to country,
 * there being no shop to have prices from.
 *
 * Made up here rather than stored with BrickLink's sellers, and deliberately:
 * a country with a seller stored under it is a country whose page has been
 * fetched, and LEGO filed under Germany would have kept Germany's real
 * sellers from ever being asked for.
 */
export function legoSeller(): Store | undefined {
  const country = shipTo.value?.trim().toUpperCase()
  if (!legoLocale(country)) {
    return undefined
  }
  return {
    id: LEGO_STORE,
    name: LEGO_NAME,
    countryID: country
  }
}

/** Waits for one answer, draining the queue it is in until it comes. */
async function awaitAnswer(key: string, deadline = DEADLINE_MS): Promise<number> {
  const until = Date.now() + deadline
  let polls = 0
  for (;;) {
    const answered = legoAnswers.get(key)
    if (answered !== undefined) {
      return answered
    }
    if (Date.now() > until) {
      throw new Error(MISSING_EXTENSION)
    }
    // Every two seconds, drain again. Another fill draining the same queue
    // may have sent its own page in place of this one — the queue goes
    // newest first — and nothing else here would send this.
    if (++polls % 5 === 0) {
      await processQueue(1)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

/** Whether BrickLink's element codes are stored. */
async function haveElementCodes(): Promise<boolean> {
  const db = await getDbConnection()
  try {
    return (await count(db, STORES.ELEMENT_CODES)) > 0
  } finally {
    db.close()
  }
}

let codesInFlight: Promise<void> | undefined

/**
 * BrickLink's element codes, downloaded if they are not stored. Once at a
 * time: every part being looked at wants them, and it is one file.
 */
export function elementCodesFor(): Promise<void> {
  codesInFlight ??= (async () => {
    if (await haveElementCodes()) {
      return
    }
    installResponseListener()
    await fetchElementCodes()
    await processQueue(1)
    const until = Date.now() + CODES_DEADLINE_MS
    while (!(await haveElementCodes())) {
      if (Date.now() > until) {
        throw new Error(MISSING_CODES)
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  })().finally(() => {
    codesInFlight = undefined
  })
  return codesInFlight
}

/** Every LEGO element number of one BrickLink part. */
export async function readElementCodesOf(record: string): Promise<ElementCode[]> {
  const db = await getDbConnection()
  try {
    return (await getAllFromIndex<ElementCode>(db, indices.ELEMENT_CODES_BY_RECORD, record)) ?? []
  } finally {
    db.close()
  }
}

/** The shop whose lots are known to be the only ones stored, this session. */
let settledLocale: string | undefined

/**
 * Drops the lots and the scope of any shop but this one.
 *
 * A price from another country's shop is in another currency, and one lot of
 * LEGO's beside another of LEGO's for the same brick at a different price
 * would say something untrue about both.
 */
async function dropOtherShops(locale: string): Promise<void> {
  if (settledLocale === locale) {
    return
  }
  const stale = (await readLegoLots()).filter((lot) => lot.locale !== locale)
  const db = await getDbConnection()
  try {
    if (stale.length) {
      const tx = db.transaction(STORES.STORE_LOTS.name, 'readwrite')
      await Promise.all([...stale.map((lot) => tx.store.delete(lot.id)), tx.done])
    }
    const scope = await get<LegoStoreScope>(db, STORES.STORE_LOT_SCOPES, LEGO_STORE)
    if (scope && scope.locale !== locale) {
      await db.delete(STORES.STORE_LOT_SCOPES.name, LEGO_STORE)
    }
  } finally {
    db.close()
  }
  settledLocale = locale
}

/**
 * Drops another shop's lots where the Ship to country has changed, before
 * LEGO's stored lots are read as its inventory.
 */
export async function settleLegoShop(): Promise<void> {
  const locale = currentLegoLocale()
  if (locale) {
    await dropOtherShops(locale)
  }
}

/** Records asked about this session, by shop — see [legoLotsOf]. */
const asked = new Map<string, Promise<number>>()

/**
 * LEGO's price for one item, stored as a lot of LEGO's; resolves with how
 * many lots it brought.
 *
 * A set is one request: its code is its BrickLink number without the
 * variant. A part is one request for every colour, asked by the element
 * numbers BrickLink files under it — which is what reaches `3070b` as well
 * as `3001`. Anything else LEGO does not sell by a number BrickLink knows,
 * and is not asked about.
 *
 * Once a session per item and shop: the answer is held a day in the call
 * cache, and a table that redraws is not a reason to look again.
 */
export function legoLotsOf(record: string): Promise<number> {
  const locale = currentLegoLocale()
  if (!locale) {
    return Promise.resolve(0)
  }
  const key = `${locale}#${record}`
  const running = asked.get(key)
  if (running) {
    return running.then(() => 0)
  }
  const attempt = (async () => {
    await dropOtherShops(locale)
    installResponseListener()
    const code = productCodeOf(record)
    if (code) {
      await fetchLegoProduct(locale, record, code)
      await processQueue(1)
      return await awaitAnswer(answerKey(Call.GET_LEGO_PRODUCT, locale, record))
    }
    if (!record.startsWith('P-')) {
      return 0
    }
    await elementCodesFor()
    const codes = [...new Set((await readElementCodesOf(record)).map((one) => one.code))]
    let lots = 0
    for (let ask = 0; ask * ELEMENTS_PER_ASK < codes.length; ask++) {
      await fetchLegoElements(locale, record, codes.slice(ask * ELEMENTS_PER_ASK, (ask + 1) * ELEMENTS_PER_ASK), ask)
      await processQueue(1)
      lots += await awaitAnswer(answerKey(Call.GET_LEGO_ELEMENTS, locale, `${record}#${ask}`))
    }
    return lots
  })()
  // Forgotten on failure, so that the next look asks again — an extension
  // reloaded in between is the likely cure.
  attempt.catch(() => asked.delete(key))
  asked.set(key, attempt)
  return attempt
}

/** LEGO's lots as stored. */
export async function readLegoStoreLots(): Promise<StoredStoreLot[]> {
  const db = await getDbConnection()
  try {
    return (await getAllFromIndex<StoredStoreLot>(db, indices.STORE_LOTS_BY_STORE, LEGO_STORE)) ?? []
  } finally {
    db.close()
  }
}

/** How many lots of LEGO's are stored — for a caller deciding whether to ask. */
export async function countLegoStoreLots(): Promise<number> {
  const db = await getDbConnection()
  try {
    return await countFromIndex(db, indices.STORE_LOTS_BY_STORE, LEGO_STORE)
  } finally {
    db.close()
  }
}

/**
 * The first page of LEGO's shop — the first of its sets — which is what a
 * table of LEGO's inventory can be drawn from. The rest is the fill's.
 */
export async function legoFirstPage(): Promise<void> {
  const locale = currentLegoLocale()
  if (!locale) {
    throw new Error(NO_SHOP)
  }
  await dropOtherShops(locale)
  installResponseListener()
  await fetchLegoSetPage(locale, 1)
  await processQueue(1)
  await awaitAnswer(answerKey(Call.GET_LEGO_SET_PAGE, locale, 1))
}

/** Whether the scope has more of one list to fetch: more than it has, or no word yet of how much. */
function short(total: number | undefined, fetched: number): boolean {
  return total === undefined || fetched < total
}

/**
 * The rest of LEGO's shop as pages, for [pageFill] to fetch while the table
 * is up: every set, then every Pick a Brick element.
 *
 * Sets first, because a set needs nothing more than its own number to be
 * filed; an element needs BrickLink's element codes, which are one large
 * download, and are fetched only once the sets are in.
 *
 * The page asked for is a count of pages fetched across both lists — what
 * the fill needs of it is that landing one moves it — and which list it is a
 * page of is read off the scope at the time.
 */
export function legoStorePages(): Pages {
  return {
    async next() {
      const locale = currentLegoLocale()
      if (!locale) {
        return undefined
      }
      const scope = await readLegoScope(locale)
      if (
        short(scope.setPages, scope.setPagesFetched) ||
        short(scope.elementPages, scope.elementPagesFetched)
      ) {
        return scope.setPagesFetched + scope.elementPagesFetched + 1
      }
      return undefined
    },
    async fetch() {
      const locale = currentLegoLocale()
      if (!locale) {
        throw new Error(NO_SHOP)
      }
      await dropOtherShops(locale)
      installResponseListener()
      const scope = await readLegoScope(locale)
      if (short(scope.setPages, scope.setPagesFetched)) {
        await fetchLegoSetPage(locale, scope.setPagesFetched + 1)
      } else {
        await elementCodesFor()
        await fetchLegoElementPage(locale, scope.elementPagesFetched + 1)
      }
      await processQueue(1)
    },
    async reach() {
      const locale = currentLegoLocale()
      if (!locale) {
        return 0
      }
      const scope = await readLegoScope(locale)
      return scope.setPagesFetched + scope.elementPagesFetched
    }
  }
}
