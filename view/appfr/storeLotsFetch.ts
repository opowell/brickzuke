/**
 * Getting what a seller has for sale when it is not stored yet.
 *
 * The fourth of the same shape as [inventoryFetch], [colorItemsFetch] and
 * [storesFetch], and for the same reason: no bulk download states who sells
 * what, so a store's inventory is scraped when someone presses the count
 * beside it, and only then.
 *
 * Three deep rather than two. The front page is fetched for the numeric id
 * BrickLink's item search insists on, and then the lots come a hundred at a
 * time — so a middling seller is sixty requests, which is what the cap below
 * is about.
 */
import { ref } from 'vue'
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import {PAGE_SIZE,
  fetchStoreFront,
  fetchStoreItems,
  storeIds,
  storeLotCounts} from '../stores/bricklink/store-front-page'
import type {StoredStoreLot,
  StoredStoreScope} from '../stores/bricklink/store-front-page'
import { get, getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import STORES from '../../idb/stores'

/**
 * How long to wait for one page before saying nothing is coming — the same
 * budget an inventory gets, and for the same reason: the answer arrives
 * through the browser extension, or not at all.
 */
const DEADLINE_MS = 20_000

/**
 * How many pages of one seller to ask for.
 *
 * At a hundred lots a page this is three thousand of them, which covers most
 * of BrickLink outright: the median German seller has some twenty-five
 * thousand items spread over far fewer lots than that. The sellers it does not
 * cover are the warehouses — six thousand lots is sixty-three requests, and
 * the biggest run past that again — and a table nobody will read to the end of
 * is not worth several hundred round trips. A store that runs past this shows
 * what was fetched, which is why `storeLotsNotice` exists.
 */
const MAX_PAGES = 30

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
  "app's behalf — check it is installed and that you are signed in to BrickLink."

/** The lots stored for one seller. */
export async function readStoreLots(username: string): Promise<StoredStoreLot[]> {
  const db = await getDbConnection()
  try {
    return (
      (await getAllFromIndex<StoredStoreLot>(db, indices.STORE_LOTS_BY_STORE, username)) ?? []
    )
  } finally {
    db.close()
  }
}

/**
 * How much of a seller is stored, for a view that has to say so.
 *
 * Read back rather than remembered: a store fetched in some earlier session is
 * the case that matters, and by then nothing is left in memory to ask.
 */
export async function readStoreScope(username: string): Promise<StoredStoreScope | undefined> {
  const db = await getDbConnection()
  try {
    return await get<StoredStoreScope>(db, STORES.STORE_LOT_SCOPES, username)
  } finally {
    db.close()
  }
}

/** Waits for something to land, or says why it has not. */
async function awaitMore<T>(read: () => Promise<T[]>, before: number): Promise<T[]> {
  const deadline = Date.now() + DEADLINE_MS
  for (;;) {
    const stored = await read()
    if (stored.length > before) {
      return stored
    }
    if (Date.now() > deadline) {
      throw new Error(MISSING_EXTENSION)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

/** Waits for the front page to give up the seller's numeric id. */
async function awaitStoreId(username: string): Promise<number> {
  const deadline = Date.now() + DEADLINE_MS
  for (;;) {
    const sid = storeIds.get(username)
    if (sid !== undefined) {
      return sid
    }
    if (Date.now() > deadline) {
      throw new Error(MISSING_EXTENSION)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

async function scrape(username: string): Promise<StoredStoreLot[]> {
  installResponseListener()
  // Queues the call, or replays a cached response — a front page read within
  // the week never leaves the browser.
  await fetchStoreFront(username)
  // Nothing drains the queue on its own here: appfr asks for exactly the page
  // someone is looking at.
  await processQueue(1)
  const sid = await awaitStoreId(username)

  await fetchStoreItems(username, sid, 1)
  await processQueue(1)
  let stored = await awaitMore(() => readStoreLots(username), 0)

  // The first page is the one that says how many lots there are, so the rest
  // are only known about once it has landed.
  const lots = storeLotCounts.get(username) ?? stored.length
  const pages = Math.min(Math.ceil(lots / PAGE_SIZE), MAX_PAGES)
  for (let page = 2; page <= pages; page++) {
    const before = stored.length
    await fetchStoreItems(username, sid, page)
    await processQueue(1)
    stored = await awaitMore(() => readStoreLots(username), before)
  }
  return stored
}

/**
 * Bumped when a seller's stored lots change.
 *
 * A view showing how much of a store it has cannot watch IndexedDB, and the
 * pages land well after the press that asked for them — so this is what tells
 * it to look again.
 */
export const storeScopeVersion = ref(0)

/** One fetch per seller at a time: two views of one store are not two scrapes. */
const inFlight = new Map<string, Promise<StoredStoreLot[]>>()

/**
 * What a seller has for sale: read if it is stored, fetched if it is not.
 *
 * Stored rows are taken as the answer, so a store is scraped once. That is
 * also what makes the cap above survivable — a truncated store stays truncated
 * until something clears the store, rather than re-fetching thirty pages every
 * time it is opened.
 */
export function storeLotsFor(username: string): Promise<StoredStoreLot[]> {
  if (!username) {
    return Promise.resolve([])
  }
  const running = inFlight.get(username)
  if (running) {
    return running
  }
  const attempt = (async () => {
    const stored = await readStoreLots(username)
    return stored.length ? stored : await scrape(username)
  })().finally(() => {
    inFlight.delete(username)
    storeScopeVersion.value++
  })
  inFlight.set(username, attempt)
  return attempt
}
