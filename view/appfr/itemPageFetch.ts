/**
 * Getting who sells an item, and the pictures of it, when neither is loaded.
 *
 * The sibling of [inventoryFetch]: an inventory is what a set is made of, and
 * this is the other half of an item's page — the lots on offer for it, and its
 * image list. Neither is in any bulk download. The lots are not in IndexedDB
 * either, because they go stale in a way a catalogue entry does not: a price
 * is only true while the lot is still there. So they live where the original
 * keeps them, in `catalogItemPageStore`'s maps. The pictures do not go stale,
 * and are kept — ITEM_IMAGES, one row per record — with the map beside them
 * saying which records landed this session.
 *
 * This is what fills both on demand. One request opens the item's page; that
 * handler fires the two that actually carry the answers, so three round trips
 * stand behind one call here.
 */
import { ref, watch } from 'vue'
import { get, getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import STORES from '../../idb/stores'
import type { StoredItemImages } from '../stores/bricklink/catalog-item-page'
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { LOTS_PER_PAGE, lotAskKey, useCatalogItemPageStore } from '../stores/bricklink/catalog-item-page'
import type { LotAsk, StoreInventory } from '../stores/bricklink/catalog-item-page'
import { fillPages } from './pageFill'
import type { Fill } from './pageFill'

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
 * The narrowing as the asks BrickLink can answer.
 *
 * What it cannot take — a condition it does not know, a region the directory
 * does not name — is left out of the ask and narrowed off the answer
 * afterwards. An ask with nothing in it is still an ask: the whole list,
 * paged, which is what an item's lots are when the query narrows by nothing
 * — thirty-seven thousand for a common plate, of which the page on its own
 * was the cheapest five hundred.
 */
export function lotAsksFor(narrowing: LotNarrowing): LotAsk[] {
  const cond = narrowing.condition === 'N' || narrowing.condition === 'U' ? narrowing.condition : undefined
  const regs = narrowing.region === undefined ? undefined : SALE_REGIONS[narrowing.region]
  if (regs) {
    return regs.map((reg) => ({
      cond,
      reg
    }))
  }
  return [cond ? {
    cond
  } : {}]
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
 * narrowing itself — or nothing, where there is no page to ask by, or where
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
  // the queue is clear and the id the asks are made by is known — and the
  // bare ask's first page is in with them, the handler filing the same
  // answer under both names.
  if (!store.inventoriesMap.has(record)) {
    await fetchRecord(record, 'inventoriesMap')
    if (keys.every((key) => store.narrowedLotsMap.has(key))) {
      return held()
    }
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

/**
 * Whether the record has a page this can read at all — see [READABLE]. A
 * fill working down a list of records asks before it asks for the page, a
 * minifigure's being one that would never land and so a twenty-second wait
 * for nothing.
 */
export function hasPage(record: string): boolean {
  const parts = splitRecord(record)
  return parts !== undefined && READABLE.has(parts.type)
}

/**
 * The pictures stored for one record — nothing where the record has not been
 * asked for, which reads the same as a record BrickLink lists none for; see
 * [hasImages] for the difference.
 */
export async function readImages(record: string): Promise<ItemImage[]> {
  const db = await getDbConnection()
  try {
    return (await get<StoredItemImages>(db, STORES.ITEM_IMAGES, record))?.images ?? []
  } finally {
    db.close()
  }
}

/** Every record's pictures stored, by record. */
export async function readAllImages(): Promise<Map<string, ItemImage[]>> {
  const db = await getDbConnection()
  try {
    const stored = (await getAll<StoredItemImages>(db, STORES.ITEM_IMAGES)) ?? []
    return new Map(stored.map((one) => [one.record, one.images]))
  } finally {
    db.close()
  }
}

/** The records whose pictures are stored — a record with none listed included. */
export async function imagedRecords(): Promise<Set<string>> {
  const db = await getDbConnection()
  try {
    return new Set((await db.getAllKeys(STORES.ITEM_IMAGES.name)) as string[])
  } finally {
    db.close()
  }
}

/** Whether the record's pictures are stored, this session or an earlier one. */
async function hasImages(record: string): Promise<boolean> {
  if (useCatalogItemPageStore().imagesMap.has(record)) {
    return true
  }
  const db = await getDbConnection()
  try {
    return (await db.getKey(STORES.ITEM_IMAGES.name, record)) !== undefined
  } finally {
    db.close()
  }
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
export async function imagesFor(record: string): Promise<ItemImage[]> {
  if (!(await hasImages(record))) {
    await fetchRecord(record, 'imagesMap')
  }
  return readImages(record)
}

/**
 * Bumped as each further page of a narrowed ask lands, for the table drawn
 * from it — see [narrowedLotsFill].
 */
export const narrowedLotsVersion = ref(0)

/**
 * The rest of a narrowed answer, fetched while the table is up.
 *
 * The first page is what [narrowedStoreInventoriesFor] draws the table from,
 * and it is one of twenty-two for a common part's new lots in Europe. The
 * rest arrive behind it a page at a time, on [pageFill]'s terms — while the
 * table is up, stopping at a page that brings nothing, with a gap between —
 * and the table redraws as each lands. A region the list files as two asks
 * is filled one ask after the other rather than side by side: two fills
 * draining one queue would each send the other's page.
 */
export function narrowedLotsFill(record: string, narrowing: LotNarrowing): Fill {
  const asks = lotAsksFor(narrowing)
  const store = useCatalogItemPageStore()
  const fills = asks.map((ask) => {
    const key = lotAskKey(record, ask)
    return fillPages(
      {
        async next() {
          const scope = store.narrowedLotsScope.get(key)
          // Nothing recorded is an ask whose first page has not landed, and
          // no page after it can be asked for until it has.
          if (!scope || scope.pages * LOTS_PER_PAGE >= scope.total) {
            return undefined
          }
          return scope.pages + 1
        },
        async fetch(page: number) {
          const item = store.itemsMap.get(record)
          if (!item?.itemId) {
            throw new Error(`no page open for ${record}`)
          }
          if (!(await store.fetchInventories(item.itemNumber, item.itemId, item.itemType, ask, page))) {
            await processQueue(1)
          }
        },
        async reach() {
          return store.narrowedLotsScope.get(key)?.pages ?? 0
        }
      },
      narrowedLotsVersion
    )
  })
  let stopped = false
  return {
    version: narrowedLotsVersion,
    stop() {
      stopped = true
      fills.forEach((fill) => fill.stop())
    },
    async run() {
      for (const fill of fills) {
        if (stopped) {
          return
        }
        await fill.run()
      }
    }
  }
}
