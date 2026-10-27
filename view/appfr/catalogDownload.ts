/**
 * The bulk downloads behind the small catalogue tables, fetched when a table
 * finds its store empty.
 *
 * Colours, categories and item types are not the residue of browsing, as the
 * lines and pictures are — see [catalogFill]. They are BrickLink's catalogue
 * download, three files, and until now only the old view's Update BrickLink
 * button asked for them. A browser that had never pressed it — a second one,
 * or the same one after its site data went — opened the Colors table on
 * "Nothing matches this query" and said nothing of why.
 *
 * So the table asks for its own, once a session, and only while its store is
 * empty: a store that has rows is left to the button, which is how it is
 * brought up to date. The categories need the item types first, because the
 * download states no type of its own and the tree pages that do are fetched
 * one item type at a time — see `fetchBrickLink`, which this follows.
 */
import { ref } from 'vue'
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { BOT_CHECK_MESSAGE, checkedSince } from '../assets/js/bot-check'
import { count, getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import STORES from '../../idb/stores'
import type { StoreDefinition } from '../../idb/stores'
import { BRICK_LINK_CATALOG } from '../stores/bricklink/catalog-codes'
import { useCatalogDownloadPageStore } from '../stores/bricklink/catalog-download-page'
import type { BrickLinkItemType } from '../stores/bricklink/catalog-download-page'
import { setCounts } from '../../model'
import { forgetCatalogRows } from './catalogRows'
import { reachGapMs } from './settings'

/**
 * How long to wait for a download before saying so. Longer than a page's
 * deadline elsewhere: this is a whole file, parsed and written row by row.
 */
const DEADLINE_MS = 60_000

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
  "app's behalf — check it is installed and that you are signed in to BrickLink."

/** Ticks each time a download lands, so the table up reads itself again. See [tableReach]. */
export const catalogDownloaded = ref(0)

/** BrickLink's own records of each, which only the download writes. */
const STORE_OF: Record<number, StoreDefinition> = {
  [BRICK_LINK_CATALOG.ITEM_TYPES]: STORES.BRICK_LINK_ITEM_TYPES,
  [BRICK_LINK_CATALOG.CATEGORIES]: STORES.BRICK_LINK_CATEGORIES,
  [BRICK_LINK_CATALOG.COLORS]: STORES.BRICK_LINK_COLORS
}

/** What each table is drawn from, in the order it has to be fetched. */
const DOWNLOADS: Record<string, number[]> = {
  itemTypes: [BRICK_LINK_CATALOG.ITEM_TYPES],
  categories: [BRICK_LINK_CATALOG.ITEM_TYPES, BRICK_LINK_CATALOG.CATEGORIES],
  colors: [BRICK_LINK_CATALOG.COLORS]
}

/** Done this session, so a table opened again does not ask again. */
const done = new Set<number>()

/** One download per file at a time: two tables needing the item types are not two fetches. */
const inFlight = new Map<number, Promise<boolean>>()

async function stored(viewType: number): Promise<number> {
  const db = await getDbConnection()
  try {
    return await count(db, STORE_OF[viewType])
  } finally {
    db.close()
  }
}

/** The tables up after a download: the held rows go, and the counts are taken again. */
function landed() {
  forgetCatalogRows()
  void setCounts()
  catalogDownloaded.value++
}

/** Fetches one file if its store is empty; whether it did. */
async function download(viewType: number): Promise<boolean> {
  if ((await stored(viewType)) > 0) {
    return false
  }
  installResponseListener()
  const asked = Date.now()
  await useCatalogDownloadPageStore().fetchViewType(viewType)
  // Nothing drains the queue on its own here — see [inventoryFetch].
  await processQueue(1)
  const deadline = asked + DEADLINE_MS
  for (;;) {
    if ((await stored(viewType)) > 0) {
      landed()
      return true
    }
    if (checkedSince(asked)) {
      throw new Error(BOT_CHECK_MESSAGE)
    }
    if (Date.now() > deadline) {
      throw new Error(MISSING_EXTENSION)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

function downloadOnce(viewType: number): Promise<boolean> {
  if (done.has(viewType)) {
    return Promise.resolve(false)
  }
  const running = inFlight.get(viewType)
  if (running) {
    return running
  }
  const attempt = download(viewType)
    .then((fetched) => {
      done.add(viewType)
      return fetched
    })
    .finally(() => inFlight.delete(viewType))
  inFlight.set(viewType, attempt)
  return attempt
}

/**
 * The tree pages that say which item type each category is listed under, one
 * item type at a time at the fills' pace. Not waited on page by page: a tree
 * page adds a type to categories already shown, so each read again is the
 * table a little more complete rather than a table that was empty.
 */
async function fetchTrees() {
  const db = await getDbConnection()
  let itemTypes: BrickLinkItemType[]
  try {
    itemTypes = (await getAll<BrickLinkItemType>(db, STORES.BRICK_LINK_ITEM_TYPES)) ?? []
  } finally {
    db.close()
  }
  const page = useCatalogDownloadPageStore()
  for (const itemType of itemTypes) {
    await page.fetchCatalogTree(itemType.itemTypeId)
    await processQueue(1)
    await new Promise((resolve) => setTimeout(resolve, reachGapMs.value))
    landed()
  }
}

/**
 * Fetches what this table is drawn from, where its store is empty. Resolves
 * once it has landed, or at once for a table with nothing to fetch; rejects
 * with what to do about it when nothing comes.
 */
export async function downloadIfEmpty(entityKey: string): Promise<void> {
  const downloads = DOWNLOADS[entityKey]
  if (!downloads) {
    return
  }
  for (const viewType of downloads) {
    const fetched = await downloadOnce(viewType)
    if (fetched && viewType === BRICK_LINK_CATALOG.CATEGORIES) {
      await fetchTrees()
    }
  }
}
