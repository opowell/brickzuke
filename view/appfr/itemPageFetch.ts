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
import { watch } from 'vue'
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { lotAskKey, useCatalogItemPageStore } from '../stores/bricklink/catalog-item-page'
import type { LotAsk, StoreInventory } from '../stores/bricklink/catalog-item-page'

/** The same budget an inventory gets, over a chain of three requests. */
const DEADLINE_MS = 30_000

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
  "app's behalf — check it is installed and that you are signed in to BrickLink."

/**
 * The two halves of an item's page, by the map each lands in.
 *
 * A caller waits on the one it asked for and no other. They used to share one
 * wait that ended when *either* had landed, on the argument that an item with
 * no lots is an ordinary answer — and so it is, but the two answers land
 * apart: the image list is replayed from the cache in the same tick the page
 * is, and the lots come back a round trip later. So `storeInventoriesFor` was
 * regularly woken by the pictures, read the lots before they were there, and
 * handed the table an empty page that then closed — and stayed empty, nothing
 * being left to push the lots in when they arrived.
 */
type Half = 'inventoriesMap' | 'imagesMap' | 'narrowedLotsMap'

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

/**
 * What a lots query asks BrickLink to leave out: the condition, and the part
 * of the world the seller is in, under the names the query uses — `N` or
 * `U`, and a region as the store directory files countries by it.
 */
export interface LotNarrowing {
  condition?: string
  region?: string
}

/**
 * BrickLink's ids for the seller regions its lot list can be narrowed to,
 * under the directory's names. The directory files the world in four; the
 * lot list takes eight, so two of the four are two ids each — and two asks.
 */
const SALE_REGIONS: Record<string, number[]> = {
  Europe: [6],
  Americas: [3, 4],
  'Asia/Oceania': [1, 7],
  'Africa/Middle East': [2, 5]
}

/**
 * The narrowing as the asks BrickLink can answer, or none where it can take
 * no part of it — a condition it does not know, a region the directory does
 * not name — and the un-narrowed list is what there is to narrow.
 */
export function lotAsksFor(narrowing: LotNarrowing): LotAsk[] {
  const cond = narrowing.condition === 'N' || narrowing.condition === 'U' ? narrowing.condition : undefined
  const regs = narrowing.region === undefined ? undefined : SALE_REGIONS[narrowing.region]
  if (!cond && !regs) {
    return []
  }
  return regs ? regs.map((reg) => ({
    cond,
    reg 
  })) : [{
    cond 
  }]
}

/** Each lot once, whichever lists it was on. */
function distinctLots(lists: StoreInventory[][]): StoreInventory[] {
  const seen = new Map<string, StoreInventory>()
  for (const list of lists) {
    for (const lot of list) {
      seen.set(lot.invId, lot)
    }
  }
  return [...seen.values()]
}

/** The narrowed lists held for one record: every ask made of it so far. */
function narrowedListsOf(record: string): StoreInventory[][] {
  const store = useCatalogItemPageStore()
  const lists: StoreInventory[][] = []
  for (const [key, lots] of store.narrowedLotsMap) {
    if (key.startsWith(`${record}|`)) {
      lists.push(lots)
    }
  }
  return lists
}

/**
 * The lots loaded for one record, or for every record loaded so far —
 * whatever was asked for them, narrowed or not, each lot once.
 */
export function readStoreInventories(record?: string): StoreInventory[] {
  const store = useCatalogItemPageStore()
  if (record) {
    return distinctLots([store.inventoriesMap.get(record) ?? [], ...narrowedListsOf(record)])
  }
  return distinctLots([...store.inventoriesMap.values(), ...store.narrowedLotsMap.values()])
}

/**
 * The lots of one record under a narrowing, as BrickLink answers that
 * narrowing itself — or nothing, where it can answer no part of it, or where
 * this is only reading and the asks have not been made.
 *
 * The page is opened first where it has not been, that being where the
 * numeric id the lot list is asked by comes from. The asks are then queued
 * together and waited for together, and what comes back is the lists joined.
 */
export async function narrowedStoreInventoriesFor(
  record: string,
  narrowing: LotNarrowing,
  fetching = true
): Promise<StoreInventory[] | undefined> {
  const asks = lotAsksFor(narrowing)
  if (!asks.length) {
    return undefined
  }
  const store = useCatalogItemPageStore()
  const keys = asks.map((ask) => lotAskKey(record, ask))
  const held = () => distinctLots(keys.map((key) => store.narrowedLotsMap.get(key) ?? []))
  // Answered already, so no page to open: the id it is asked by is not needed.
  if (keys.every((key) => store.narrowedLotsMap.has(key))) {
    return held()
  }
  if (!fetching) {
    return undefined
  }
  // The page's own lots first, not just the page: its handler queues the
  // image list and the un-narrowed lots behind the page and drains the two
  // itself, and asks queued beside those would be drained by both drains —
  // each sending the newest, neither the rest. Once the page's lots are in,
  // the queue is clear and the id the asks are made by is known.
  if (!store.inventoriesMap.has(record)) {
    await fetchRecord(record, 'inventoriesMap')
  }
  const item = store.itemsMap.get(record)
  if (!item?.itemId) {
    return undefined
  }
  // Queued together and drained together: `processQueue` sends the newest
  // call first and as many as it is told, so two asks each draining one
  // would both send the same one and leave the other sitting there.
  const missing = keys.filter((key) => !store.narrowedLotsMap.has(key) && !inFlight.has(key))
  if (missing.length) {
    const batch = askLots(
      item.itemNumber,
      item.itemId,
      item.itemType,
      asks.filter((_ask, at) => missing.includes(keys[at])),
      missing
    ).finally(() => missing.forEach((key) => inFlight.delete(key)))
    missing.forEach((key) => inFlight.set(key, batch))
  }
  await Promise.all(keys.map((key) => inFlight.get(key) ?? landed(key, 'narrowedLotsMap')))
  return held()
}

/** The asks, sent — or replayed from the cache, which lands at once — and waited for. */
async function askLots(
  itemNumber: string,
  itemId: string,
  itemType: string,
  asks: LotAsk[],
  keys: string[]
): Promise<boolean> {
  installResponseListener()
  const store = useCatalogItemPageStore()
  let queued = 0
  for (const ask of asks) {
    if (!(await store.fetchInventories(itemNumber, itemId, itemType, ask))) {
      queued++
    }
  }
  if (queued) {
    await processQueue(queued)
  }
  await Promise.all(keys.map((key) => landed(key, 'narrowedLotsMap')))
  return true
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
const inFlight = new Map<string, Promise<boolean>>()

/** Opens the page. False where there is no page this can read, and so nothing to wait for. */
async function scrape(record: string): Promise<boolean> {
  const parts = splitRecord(record)
  if (!parts || !READABLE.has(parts.type)) {
    return false
  }
  installResponseListener()
  const store = useCatalogItemPageStore()
  // Queues the call, or replays a cached response — a page read within the
  // week never leaves the browser. Three deep either way: the page's own
  // handler queues the image and inventory calls once it has the numeric
  // item id, and drains them itself. Replayed, that handler has already run
  // by the time this returns, so there is nothing here to send; queued, the
  // page call is sitting in the queue and this is what sends it.
  const replayed = await store.fetchItemPage(parts.type, parts.number)
  if (!replayed) {
    await processQueue(1)
  }
  return true
}

/**
 * Resolves once the half of the page a caller wants is in its map — an empty
 * list included, an item with no lots on offer being an ordinary answer — and
 * fails once nothing has come back within the budget.
 *
 * Watched rather than polled: the old loop looked every 400ms, so a reply that
 * had already landed still cost up to that long before the table drew it.
 */
function landed(record: string, half: Half): Promise<void> {
  const store = useCatalogItemPageStore()
  if (store[half].has(record)) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error(MISSING_EXTENSION))
    }, DEADLINE_MS)
    const stop = watch(
      () => store[half].has(record),
      (has) => {
        if (has) {
          clearTimeout(timer)
          stop()
          resolve()
        }
      }
    )
  })
}

/** Opens the page once for however many callers want a half of it. */
function fetchRecord(record: string, half: Half): Promise<void> {
  let running = inFlight.get(record)
  if (!running) {
    running = scrape(record).finally(() => inFlight.delete(record))
    inFlight.set(record, running)
  }
  return running.then((asked) => (asked ? landed(record, half) : undefined))
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
  // Held, whether or not there was anything to hold: an item with no lots on
  // offer has been answered, and is not asked about again on every read.
  if (!useCatalogItemPageStore().inventoriesMap.has(record)) {
    await fetchRecord(record, 'inventoriesMap')
  }
  return readStoreInventories(record)
}

/** The pictures of one record, on the same terms. */
export async function imagesFor(record?: string): Promise<ItemImage[]> {
  if (!record) {
    return readImages()
  }
  if (!useCatalogItemPageStore().imagesMap.has(record)) {
    await fetchRecord(record, 'imagesMap')
  }
  return readImages(record)
}
