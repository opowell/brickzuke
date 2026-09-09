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
 * time — so a middling seller is sixty requests. One of them is made here, to
 * put a table on screen; the rest are made by the fill below, page by page,
 * for as long as somebody is looking at it — see [pageFill].
 */
import { ref } from 'vue'
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import {PAGE_SIZE,
  fetchStoreFront,
  fetchStoreItems,
  storeIds} from '../stores/bricklink/store-front-page'
import type {StoredStoreLot,
  StoredStoreScope} from '../stores/bricklink/store-front-page'
import { fillPages } from './pageFill'
import type { Fill } from './pageFill'
import { get, getAll, getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import STORES from '../../idb/stores'

/**
 * How long to wait for one page before saying nothing is coming — the same
 * budget an inventory gets, and for the same reason: the answer arrives
 * through the browser extension, or not at all.
 */
const DEADLINE_MS = 20_000

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
  "app's behalf — check it is installed and that you are signed in to BrickLink."

/**
 * Every lot stored, whoever is selling it.
 *
 * What the lots table shows when no seller and no item narrows it. A seller's
 * front is fetched one at a time and kept, so this is the sellers somebody has
 * already opened — the same records [catalogCounts] counts the card by, which
 * is why the table has to read them rather than only the session's own.
 */
export async function readAllStoreLots(): Promise<StoredStoreLot[]> {
  const db = await getDbConnection()
  try {
    return (await getAll<StoredStoreLot>(db, STORES.STORE_LOTS)) ?? []
  } finally {
    db.close()
  }
}

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

/**
 * The seller's numeric id, which every page of lots is addressed by.
 *
 * Learned once a session and then remembered, so a fill resuming a store
 * somebody fetched last week pays for the front page and nothing more — the
 * lots are read back by username, and by then nothing in memory knows the id.
 */
async function storeIdFor(username: string): Promise<number> {
  const known = storeIds.get(username)
  if (known !== undefined) {
    return known
  }
  installResponseListener()
  // Queues the call, or replays a cached response — a front page read within
  // the week never leaves the browser.
  await fetchStoreFront(username)
  // Nothing drains the queue on its own here: appfr asks for exactly the page
  // someone is looking at.
  await processQueue(1)
  return await awaitStoreId(username)
}

/**
 * The first hundred lots, which is what a table can be drawn from.
 *
 * Only the first: it is also the page that states how many lots there are, so
 * everything after it is known about rather than guessed at, and the fill has
 * something to count from.
 */
async function firstPage(username: string): Promise<StoredStoreLot[]> {
  const sid = await storeIdFor(username)
  await fetchStoreItems(username, sid, 1)
  await processQueue(1)
  return await awaitMore(() => readStoreLots(username), 0)
}

/**
 * The rest of a seller's inventory, fetched while the table is up.
 *
 * Which page is next comes off the stored scope rather than off a counter, so
 * this resumes a store left half fetched — including one left short by the cap
 * that used to be here — instead of starting it again. See [pageFill] for what
 * the run costs and what ends it.
 */
export function storeLotsFill(username: string): Fill {
  return fillPages(
    {
      async next() {
        const scope = await readStoreScope(username)
        // Nothing recorded is a store whose first page has not landed, and no
        // page after it can be asked for until it has.
        if (!scope || scope.fetchedLots >= scope.lots) {
          return undefined
        }
        return Math.floor(scope.fetchedLots / PAGE_SIZE) + 1
      },
      async fetch(page: number) {
        await fetchStoreItems(username, await storeIdFor(username), page)
        await processQueue(1)
      },
      async reach() {
        return (await readStoreScope(username))?.fetchedLots ?? 0
      }
    },
    storeScopeVersion
  )
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
 * What a seller has for sale: read if any of it is stored, fetched if none of
 * it is.
 *
 * Stored rows are taken as the answer, which is what keeps every redraw of the
 * table from being a request — the page after them is [storeLotsFill]'s to
 * ask for, and it asks by looking at how far the scope says the store goes.
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
    if (stored.length) {
      return stored
    }
    const fetched = await firstPage(username)
    // Bumped where a page landed and nowhere else. A read bumping it would be
    // read by the table as "there is more", and the table's answer to that is
    // to read again — which would bump it again.
    storeScopeVersion.value++
    return fetched
  })().finally(() => {
    inFlight.delete(username)
  })
  inFlight.set(username, attempt)
  return attempt
}
