/**
 * Getting who sells an item, and the pictures of it, when neither is loaded.
 *
 * The sibling of [inventoryFetch]: an inventory is what a set is made of, and
 * this is the other half of an item's page — the lots on offer for it, and its
 * image list. Neither is in any bulk download and neither is in IndexedDB,
 * because both go stale in a way a catalogue entry does not: a price is only
 * true while the lot is still there.
 *
 * So they live where the original keeps them, in `catalogItemPageStore`'s
 * maps, and this is what fills those maps on demand. One request opens the
 * item's page; that handler fires the two that actually carry the answers, so
 * three round trips stand behind one call here.
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { useCatalogItemPageStore } from '../stores/bricklink/catalog-item-page'
import type { StoreInventory } from '../stores/bricklink/catalog-item-page'

/** The same budget an inventory gets, over a chain of three requests. */
const DEADLINE_MS = 30_000

/**
 * Types whose page this can read.
 *
 * `handlePageResponse` works out which item it is looking at by testing the
 * URL for `P=` and falling back to `S=`, so a minifigure's page would be
 * parsed as a set's and filed under the wrong key. Rather than half-read one,
 * this asks only for the two the original parses.
 */
const READABLE = new Set(['P', 'S'])

/** One picture of an item, as the image list states it. */
export interface ItemImage {
  id: string
  image: string
}

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

/** The lots loaded for one record, or for every record loaded so far. */
export function readStoreInventories(record?: string): StoreInventory[] {
  const store = useCatalogItemPageStore()
  if (record) {
    return store.inventoriesMap.get(record) ?? []
  }
  return Array.from(store.inventoriesMap.values()).flat()
}

/** The pictures loaded for one record, or for every record loaded so far. */
export function readImages(record?: string): ItemImage[] {
  const store = useCatalogItemPageStore()
  if (record) {
    return (store.imagesMap.get(record) as ItemImage[] | undefined) ?? []
  }
  return Array.from(store.imagesMap.values()).flat() as ItemImage[]
}

/** One fetch per record at a time: lots and pictures are one page between them. */
const inFlight = new Map<string, Promise<void>>()

async function scrape(record: string): Promise<void> {
  const parts = splitRecord(record)
  if (!parts || !READABLE.has(parts.type)) {
    return
  }
  installResponseListener()
  const store = useCatalogItemPageStore()
  // Queues the call, or replays a cached response — a page read within the
  // week never leaves the browser.
  await store.fetchItemPage(parts.type, parts.number)
  // Three deep: the page's own handler queues the image and inventory calls
  // once it has the numeric item id, and drains them itself.
  await processQueue(1)

  const deadline = Date.now() + DEADLINE_MS
  for (;;) {
    // Either half arriving is enough to stop waiting. An item with no lots on
    // offer is an ordinary answer, and so is one with no extra pictures, so
    // waiting for both would hang on the commonplace.
    if (readStoreInventories(record).length || readImages(record).length) {
      return
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

function fetchRecord(record: string): Promise<void> {
  const running = inFlight.get(record)
  if (running) {
    return running
  }
  const attempt = scrape(record).finally(() => inFlight.delete(record))
  inFlight.set(record, attempt)
  return attempt
}

/**
 * The lots for one record, fetched if that record has none — and otherwise
 * everything loaded so far, across every item anyone has opened.
 *
 * Un-narrowed this fetches nothing, for the reason the stores table does not
 * either: there is no page that states every lot on BrickLink, and asking for
 * one item at a time until there is would be two hundred thousand requests.
 */
export async function storeInventoriesFor(record?: string): Promise<StoreInventory[]> {
  if (!record) {
    return readStoreInventories()
  }
  const held = readStoreInventories(record)
  if (held.length) {
    return held
  }
  await fetchRecord(record)
  return readStoreInventories(record)
}

/** The pictures of one record, on the same terms. */
export async function imagesFor(record?: string): Promise<ItemImage[]> {
  if (!record) {
    return readImages()
  }
  const held = readImages(record)
  if (held.length) {
    return held
  }
  await fetchRecord(record)
  return readImages(record)
}
