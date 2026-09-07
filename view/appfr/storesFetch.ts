/**
 * Getting BrickLink's store directory when it is not stored yet.
 *
 * The third of the same shape as [inventoryFetch] and [colorItemsFetch], and
 * for the same reason: no bulk download states who sells anything, so the
 * directory is scraped when someone opens one of its tables, and only then.
 *
 * It comes in two pages rather than one. `browse.asp` is the whole world at
 * once — every region and every country, with a store count against each — and
 * `browseStores.asp?countryID=DE` is the sellers in one country. So opening
 * Countries or Regions costs one request for all of them, and opening Stores
 * costs one more per country someone actually asks about.
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { useStoresPageStore } from '../stores/bricklink/stores-page'
import type { Country, Region, Store } from '../stores/bricklink/stores-page'
import { getAll, getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import STORES from '../../idb/stores'

/**
 * How long to wait before saying nothing is coming — the same budget an
 * inventory gets, and for the same reason: the answer arrives through the
 * browser extension, or not at all.
 */
const DEADLINE_MS = 20_000

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
  "app's behalf — check it is installed and that you are signed in to BrickLink."

export async function readRegions(): Promise<Region[]> {
  const db = await getDbConnection()
  try {
    return (await getAll<Region>(db, STORES.STORE_REGIONS)) ?? []
  } finally {
    db.close()
  }
}

export async function readCountries(): Promise<Country[]> {
  const db = await getDbConnection()
  try {
    return (await getAll<Country>(db, STORES.STORE_COUNTRIES)) ?? []
  } finally {
    db.close()
  }
}

/**
 * The sellers stored, everywhere or in one country.
 *
 * The country form is an indexed lookup rather than a filter over all of them,
 * which is also what says whether that country's page has been fetched: no
 * rows under a country is a country nobody has asked about yet.
 */
export async function readStores(countryId?: string): Promise<Store[]> {
  const db = await getDbConnection()
  try {
    if (countryId) {
      return (
        (await getAllFromIndex<Store>(db, indices.BRICK_LINK_STORES_BY_COUNTRY, countryId)) ?? []
      )
    }
    return (await getAll<Store>(db, STORES.BRICK_LINK_STORES)) ?? []
  } finally {
    db.close()
  }
}

/** Waits for a scrape to land, or says why it has not. */
async function awaitRows<T>(read: () => Promise<T[]>): Promise<T[]> {
  const deadline = Date.now() + DEADLINE_MS
  for (;;) {
    const stored = await read()
    if (stored.length) {
      return stored
    }
    if (Date.now() > deadline) {
      throw new Error(MISSING_EXTENSION)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

/** One fetch at a time per thing asked for: two tables of it are not two scrapes. */
const inFlight = new Map<string, Promise<unknown>>()

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined
  if (running) {
    return running
  }
  const attempt = run().finally(() => inFlight.delete(key))
  inFlight.set(key, attempt)
  return attempt
}

/**
 * The directory itself — every region and every country in one page.
 *
 * Regions and countries come out of the same response, so either table asking
 * for it is the same request, and `once` is what keeps it one.
 */
function scrapeDirectory(): Promise<Country[]> {
  return once('directory', async () => {
    installResponseListener()
    const store = useStoresPageStore()
    // Queues the call, or replays a cached response — the directory is held
    // for a year, so this leaves the browser about once.
    await store.fetchStoresPage()
    // Nothing drains the queue on its own here: appfr asks for exactly the
    // page someone is looking at.
    await processQueue(1)
    return await awaitRows(readCountries)
  })
}

/** The sellers in one country. */
function scrapeStores(countryId: string): Promise<Store[]> {
  return once(`stores:${countryId}`, async () => {
    installResponseListener()
    const store = useStoresPageStore()
    await store.fetchStoresInCountryPage(countryId)
    await processQueue(1)
    return await awaitRows(() => readStores(countryId))
  })
}

/** Every country BrickLink lists sellers in: read if stored, fetched if not. */
export async function countriesFor(): Promise<Country[]> {
  const stored = await readCountries()
  return stored.length ? stored : await scrapeDirectory()
}

/** Every region, which arrives with the countries and so is fetched with them. */
export async function regionsFor(): Promise<Region[]> {
  const stored = await readRegions()
  if (stored.length) {
    return stored
  }
  await scrapeDirectory()
  return await readRegions()
}

/**
 * Sellers: one country's if the query names one, and otherwise whatever is
 * already stored.
 *
 * Un-narrowed, this does not scrape. There are some two hundred countries and
 * no page that states every seller at once, so "show me all the stores" is
 * two hundred requests — a question this asks nobody to answer, and instead
 * shows the countries already fetched.
 */
export async function storesFor(countryId?: string): Promise<Store[]> {
  if (!countryId) {
    return await readStores()
  }
  const stored = await readStores(countryId)
  return stored.length ? stored : await scrapeStores(countryId)
}
