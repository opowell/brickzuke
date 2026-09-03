/**
 * Getting a set's inventory when it is not stored yet.
 *
 * Every other type here is a bulk download read back out of IndexedDB. An
 * inventory is not: BrickLink states one item at a time, so 199,000 items is
 * 199,000 requests and there is nothing to pre-populate. It is fetched when
 * someone opens a set, and only then.
 *
 * That makes this the one place in appfr that reaches the network, and the
 * shape reflects it — one request per set, deduplicated while in flight, and a
 * deadline, because the answer arrives through the browser extension and there
 * is no answer at all if that is not installed or not signed in.
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { useCatalogItemInvPageStore } from '../stores/bricklink/catalog-item-inv-page'
import type { StoredItemInventory } from '../stores/bricklink/catalog-item-inv-page'
import { getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'

/**
 * How long to wait for the extension before saying so.
 *
 * A scrape of one page is quick; this is not a performance budget but the
 * point at which "still loading" becomes a wrong answer, because nothing is
 * coming.
 */
const DEADLINE_MS = 20_000

/**
 * Types with something to list. A part, an instruction sheet and an empty box
 * are not made of anything, so opening one should not spend a request finding
 * that out. Sets, minifigures and gear are.
 */
const HAS_INVENTORY = new Set(['S', 'M', 'G'])

/** `S-10511-1` as BrickLink addresses it: type `S`, number `10511-1`. */
function splitRecord(record: string): { type: string; number: string } | undefined {
  const at = record.indexOf('-')
  if (at < 1) {
    return undefined
  }
  return {
    type: record.slice(0, at),
    number: record.slice(at + 1)
  }
}

export async function readInventory(record: string): Promise<StoredItemInventory[]> {
  const db = await getDbConnection()
  try {
    return (
      (await getAllFromIndex<StoredItemInventory>(
        db,
        indices.ITEM_INVENTORIES_BY_RECORD,
        record
      )) ?? []
    )
  } finally {
    db.close()
  }
}

/** One fetch per record at a time: two views of one set are not two scrapes. */
const inFlight = new Map<string, Promise<StoredItemInventory[]>>()

async function scrape(record: string): Promise<StoredItemInventory[]> {
  const parts = splitRecord(record)
  if (!parts || !HAS_INVENTORY.has(parts.type)) {
    return []
  }

  installResponseListener()
  const store = useCatalogItemInvPageStore()
  // Queues the call, or replays a cached response — a page read within the day
  // never leaves the browser.
  await store.fetchItemPage(parts.type, parts.number)
  // Nothing drains the queue on its own here: appfr asks for exactly the page
  // someone is looking at, rather than running a worker over everything queued.
  await processQueue(1)

  const deadline = Date.now() + DEADLINE_MS
  for (;;) {
    const stored = await readInventory(record)
    if (stored.length) {
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
 * What this record is made of: read if it is stored, fetched if it is not.
 *
 * A set BrickLink lists as empty stays empty rather than being asked for again
 * and again — the response is cached for a day, so the second look costs
 * nothing either way.
 */
export function inventoryFor(record: string): Promise<StoredItemInventory[]> {
  const running = inFlight.get(record)
  if (running) {
    return running
  }
  const attempt = scrape(record).finally(() => inFlight.delete(record))
  inFlight.set(record, attempt)
  return attempt
}
