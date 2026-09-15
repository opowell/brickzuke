/**
 * Backfilling a category's type, the one code the bulk catalogue download
 * never carries.
 *
 * `catalog-tree-page.ts` is the only place that ever learns which item type a
 * category is listed under, and it learns it a page at a time — one request
 * per item type, `S`/`P`/`M`/`B`/`G`/`C`. The legacy screen has a button for
 * that, "Update BrickLink Categories"; `?appfr=1` has no menu to put one on,
 * so this runs it once on its own, the same way every other appfr scrape
 * queues its own calls and drains exactly that many off the queue rather than
 * waiting on the worker the legacy screen relies on.
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { useCatalogDownloadPageStore } from '../stores/bricklink/catalog-download-page'
import type { BrickLinkItemType } from '../stores/bricklink/catalog-download-page'
import { getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import STORES from '../../idb/stores'

let started = false

/**
 * Runs once per session — a second call while the first is still queuing or
 * draining would queue the same six requests twice.
 */
export async function fillCategoryTypes(): Promise<void> {
  if (started) {
    return
  }
  started = true
  const db = await getDbConnection()
  const itemTypes = (await getAll<BrickLinkItemType>(db, STORES.BRICK_LINK_ITEM_TYPES)) ?? []
  db.close()
  // Nothing to walk the tree for yet — the item types themselves have to be
  // downloaded first, same as the button's own `updateCatalogTree` requires.
  if (!itemTypes.length) {
    return
  }
  installResponseListener()
  await useCatalogDownloadPageStore().updateCatalogTree()
  await processQueue(itemTypes.length)
}
