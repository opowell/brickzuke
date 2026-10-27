/**
 * Bringing the catalogue downloads up to date, on request.
 *
 * [catalogDownload] fetches a file only while its store is empty, so once a
 * store has rows these are the only way to read it again. They were the old
 * screen's four Update BrickLink buttons, and are Settings' actions now — see
 * [SETTINGS].
 *
 * Each queues what it asks for, then drains exactly that many calls off the
 * queue at the fills' pace, the way every appfr scrape does: nothing drains it
 * on its own — see [inventoryFetch]. A page read recently enough to be cached
 * is not fetched again but replayed through the same handler.
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { count } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import STORES from '../../idb/stores'
import { fetchBrickLink, fetchCatalogPage, updateCatalogTree } from '../../sources/bricklink'
import { makeCall as fetchColorGuide } from '../../sources/bricklink/color-guide'
import { landed } from './catalogDownload'
import { reachGapMs } from './settings'

async function queued(): Promise<number> {
  const db = await getDbConnection()
  try {
    return await count(db, STORES.QUEUED_CALLS)
  } finally {
    db.close()
  }
}

/** Runs [ask], then makes the calls it queued, one at a time, the tables read again after each. */
async function refresh(ask: () => Promise<unknown>): Promise<void> {
  installResponseListener()
  const before = await queued()
  await ask()
  const asked = (await queued()) - before
  for (let i = 0; i < asked; i++) {
    await processQueue(1)
    await new Promise((resolve) => setTimeout(resolve, reachGapMs.value))
    landed()
  }
  landed()
}

/** The item types, categories, colours and part-colour codes, and the category tree. */
export const refreshCatalog = () => refresh(fetchBrickLink)

/** Which item type each category is listed under. */
export const refreshCategoryTypes = () => refresh(updateCatalogTree)

/** Each colour's swatch, off BrickLink's colour guide. */
export const refreshColorGuide = () => refresh(fetchColorGuide)

/** The item types, off BrickLink's catalogue page. */
export const refreshItemTypes = () => refresh(fetchCatalogPage)
