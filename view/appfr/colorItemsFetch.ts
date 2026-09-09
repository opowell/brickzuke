/**
 * Getting the items of a colour when they are not stored yet.
 *
 * The sibling of [inventoryFetch], and for the same reason: the bulk downloads
 * state how many parts are made in Aqua and never which ones, so the list is
 * fetched when someone presses that number, and only then. BrickLink answers
 * on the page its own colour guide links to, a page at a time — the first of
 * them here, to put a table on screen, and the rest in the fill below for as
 * long as somebody is looking at it. See [pageFill].
 */
import { ref } from 'vue'
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import {COLOR_LIST_TYPES,
  colorScope,
  fetchColorPage} from '../stores/bricklink/catalog-list-color-page'
import type {StoredColorItem,
  StoredColorScope} from '../stores/bricklink/catalog-list-color-page'
import { fillPages } from './pageFill'
import type { Fill } from './pageFill'
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

/**
 * The first page of a colour, which is what a table can be drawn from.
 *
 * Only the first: it is also the page that says how many pages there are, so
 * everything after it is known about rather than guessed at, and the fill has
 * something to count from.
 */
async function firstPage(catType: string, colorId: string): Promise<StoredColorItem[]> {
  if (!COLOR_LIST_TYPES.has(catType) || !colorId) {
    return []
  }
  installResponseListener()
  // Queues the call, or replays a cached response — a page read within the
  // month never leaves the browser.
  await fetchColorPage(catType, colorId, 1)
  // Nothing drains the queue on its own here: appfr asks for exactly the page
  // someone is looking at, rather than running a worker over everything queued.
  await processQueue(1)
  return await awaitPage(colorScope(catType, colorId), 0)
}

/**
 * The rest of a colour's list, fetched while the table is up.
 *
 * Which page is next comes off the stored scope rather than off a counter, so
 * this resumes a colour left half fetched — including one left short by the
 * cap that used to be here — instead of starting it again. Black's fourteen
 * thousand parts are still nearly three hundred requests; what changed is that
 * they are spread across the time somebody spends reading, and stop the moment
 * that person leaves. See [pageFill].
 */
export function colorItemsFill(catType: string, colorId: string): Fill {
  const scope = colorScope(catType, colorId)
  return fillPages(
    {
      async next() {
        const held = await readColorScope(scope)
        // Nothing recorded is a colour whose first page has not landed, and no
        // page after it can be asked for until it has.
        if (!held || held.fetchedPages >= held.pages) {
          return undefined
        }
        return held.fetchedPages + 1
      },
      async fetch(page: number) {
        await fetchColorPage(catType, colorId, page)
        await processQueue(1)
      },
      async reach() {
        return (await readColorScope(scope))?.fetchedPages ?? 0
      }
    },
    colorScopeVersion
  )
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
 * What comes in this colour: read if any of it is stored, fetched if none of
 * it is.
 *
 * Stored rows are taken as the answer, which is what keeps every redraw of the
 * table from being a request — the page after them is [colorItemsFill]'s to
 * ask for, and it asks by looking at how far the scope says the colour goes.
 */
export function colorItemsFor(catType: string, colorId: string): Promise<StoredColorItem[]> {
  const scope = colorScope(catType, colorId)
  const running = inFlight.get(scope)
  if (running) {
    return running
  }
  const attempt = (async () => {
    const stored = await readColorItems(scope)
    if (stored.length) {
      return stored
    }
    const fetched = await firstPage(catType, colorId)
    // Bumped where a page landed and nowhere else. A read bumping it would be
    // read by the table as "there is more", and the table's answer to that is
    // to read again — which would bump it again.
    colorScopeVersion.value++
    return fetched
  })()
    .finally(() => {
      inFlight.delete(scope)
    })
  inFlight.set(scope, attempt)
  return attempt
}
