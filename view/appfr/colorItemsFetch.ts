/**
 * Getting the items of a colour when they are not stored yet.
 *
 * The sibling of [inventoryFetch], and for the same reason: the bulk downloads
 * state how many parts are made in Aqua and never which ones, so the list is
 * fetched when someone presses that number, and only then. BrickLink answers
 * on the page its own colour guide links to, a page at a time.
 */
import { ref } from 'vue'
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import {COLOR_LIST_TYPES,
  colorPageCounts,
  colorScope,
  fetchColorPage} from '../stores/bricklink/catalog-list-color-page'
import type {StoredColorItem,
  StoredColorScope} from '../stores/bricklink/catalog-list-color-page'
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
 * How many pages of one colour to ask for.
 *
 * Black runs to fourteen thousand parts, which at fifty to a page is nearly
 * three hundred requests for a table nobody is going to read to the end of.
 * The common case — Aqua's 82, Chrome Green's 1 — is one or two pages and
 * costs nothing. A colour that runs past this shows what was fetched, which is
 * why `truncated` is worth knowing about.
 */
const MAX_PAGES = 20

export async function readColorItems(scope: string): Promise<StoredColorItem[]> {
  const db = await getDbConnection()
  try {
    return (
      (await getAllFromIndex<StoredColorItem>(db, indices.COLOR_ITEMS_BY_SCOPE, scope)) ?? []
    )
  } finally {
    db.close()
  }
}

/** Waits for a page's rows to land, or says why they have not. */
async function awaitPage(scope: string, before: number): Promise<StoredColorItem[]> {
  const deadline = Date.now() + DEADLINE_MS
  for (;;) {
    const stored = await readColorItems(scope)
    if (stored.length > before) {
      return stored
    }
    if (Date.now() > deadline) {
      throw new Error(
        'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
          "app's behalf — check it is installed and that you are signed in to BrickLink.",
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

async function scrape(catType: string, colorId: string): Promise<StoredColorItem[]> {
  if (!COLOR_LIST_TYPES.has(catType) || !colorId) {
    return []
  }
  const scope = colorScope(catType, colorId)

  installResponseListener()
  // Queues the call, or replays a cached response — a page read within the
  // month never leaves the browser.
  await fetchColorPage(catType, colorId, 1)
  // Nothing drains the queue on its own here: appfr asks for exactly the page
  // someone is looking at, rather than running a worker over everything queued.
  await processQueue(1)
  let stored = await awaitPage(scope, 0)

  // The first page is the one that says how many there are, so the rest are
  // only known about once it has landed.
  const pages = Math.min(colorPageCounts.get(scope) ?? 1, MAX_PAGES)
  for (let page = 2; page <= pages; page++) {
    const before = stored.length
    await fetchColorPage(catType, colorId, page)
    await processQueue(1)
    stored = await awaitPage(scope, before)
  }
  return stored
}

/**
 * How much of a colour is stored, for a view that has to say so.
 *
 * Read back rather than remembered: a colour fetched in some earlier session
 * is the case that matters, and by then nothing is left in memory to ask.
 */
export async function readColorScope(scope: string): Promise<StoredColorScope | undefined> {
  const db = await getDbConnection()
  try {
    return await get<StoredColorScope>(db, STORES.COLOR_SCOPES, scope)
  } finally {
    db.close()
  }
}

/**
 * Bumped when a colour's stored pages change.
 *
 * A view showing how much of a colour it has cannot watch IndexedDB, and the
 * pages land well after the navigation that asked for them — so this is what
 * tells it to look again.
 */
export const colorScopeVersion = ref(0)

/** One fetch per colour at a time: two views of Aqua are not two scrapes. */
const inFlight = new Map<string, Promise<StoredColorItem[]>>()

/**
 * What comes in this colour: read if it is stored, fetched if it is not.
 *
 * Stored rows are taken as the answer, so a colour is scraped once. That is
 * also what makes the cap above survivable — a truncated colour stays
 * truncated until something clears the store, rather than re-fetching twenty
 * pages every time it is opened.
 */
export function colorItemsFor(catType: string, colorId: string): Promise<StoredColorItem[]> {
  const scope = colorScope(catType, colorId)
  const running = inFlight.get(scope)
  if (running) {
    return running
  }
  const attempt = (async () => {
    const stored = await readColorItems(scope)
    return stored.length ? stored : await scrape(catType, colorId)
  })()
    .finally(() => {
      inFlight.delete(scope)
      colorScopeVersion.value++
    })
  inFlight.set(scope, attempt)
  return attempt
}
