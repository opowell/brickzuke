/**
 * How many records each of the browse-filled types holds.
 *
 * The five bulk-download tables are counted by `setCounts` in model.ts and read
 * off `selectedCounts`. The nine below are not in any bulk download — a store
 * directory scraped when someone opens it, a set's parts written when someone
 * opens the set — so nothing was counting them, and every one of their home
 * screen cards read as a bare label.
 *
 * Counted here instead, and only when the home screen is drawn: `refreshCounts`
 * is one pass over what is actually stored, which is a `count` per store and a
 * single cursor for the two inventory types. A type nobody has fetched yet
 * counts zero, and zero is reported as no count at all — a card reading `0`
 * for a country list nobody has asked for states a number brickzuke never gave.
 */
import { ref } from 'vue'
import type { IDBPDatabase } from 'idb'
import { count } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import stores from '../../idb/stores'
import type { StoredItemInventory } from '../stores/bricklink/catalog-item-inv-page'
import { readImages, readStoreInventories } from './itemPageFetch'
import { yearCount } from './catalogSource'

/** The populations, by the entity key each card is drawn under. */
export const browsedCounts = ref<Record<string, number | undefined>>({})

/**
 * The two types read out of `itemInventories`, in one pass.
 *
 * A cursor rather than `getAll`, because the second number is how many distinct
 * variants those records name — the same fold `itemVariantRows` makes to build
 * the table — and materialising every part of every set opened just to take a
 * length would be reading the store twice over to answer one card.
 */
async function inventoryCounts(db: IDBPDatabase): Promise<{
  itemInventories: number
  itemVariants: number
}> {
  const variants = new Set<string>()
  let itemInventories = 0
  let cursor = await db.transaction(stores.ITEM_INVENTORIES.name).store.openCursor()
  while (cursor) {
    itemInventories++
    const variantId = (cursor.value as StoredItemInventory).itemVariant?.variantId
    if (variantId) {
      variants.add(variantId)
    }
    cursor = await cursor.continue()
  }
  return {
    itemInventories,
    itemVariants: variants.size
  }
}

/** One refresh at a time: the home screen draws more often than this changes. */
let running: Promise<void> | undefined

async function read(): Promise<void> {
  const db = await getDbConnection()
  try {
    browsedCounts.value = {
      ...browsedCounts.value,
      ...(await inventoryCounts(db)),
      regions: await count(db, stores.STORE_REGIONS),
      countries: await count(db, stores.STORE_COUNTRIES),
      stores: await count(db, stores.BRICK_LINK_STORES),
      // Two sources, because the lots table is filled from two pages. An
      // item's lots are held in the item page store rather than in IndexedDB,
      // going stale in a way a catalogue entry does not — see itemPageFetch —
      // so those are what has been read this session. A seller's own lots cost
      // a request per hundred and so are kept, and they count from where they
      // are kept. Together that is what the table shows.
      inventories: readStoreInventories().length + (await count(db, stores.STORE_LOTS)),
      images: readImages().length
    }
  } finally {
    db.close()
  }

  // Last, and awaited separately, because it is the one number here that costs
  // a pass over the whole items table. `yearCount` holds its answer for the
  // session, so this is paid once however often the home screen is drawn — and
  // the cheap counts above are already on screen while it runs.
  const years = await yearCount()
  browsedCounts.value = {
    ...browsedCounts.value,
    years
  }
}

export function refreshCounts(): Promise<void> {
  running ??= read().finally(() => {
    running = undefined
  })
  return running
}
