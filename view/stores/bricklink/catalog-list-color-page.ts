/**
 * The items of one colour, from BrickLink's own answer to that question.
 *
 * The colour guide links every count it prints at a `catalogList.asp` page —
 * `catType=P&colorPart=2` for the parts made in a colour, `catType=S&
 * colorInSet=2` for the sets containing one. Those counts are the numbers the
 * colours table shows, so asking for the same page is what keeps the count and
 * the rows from disagreeing: press `82` and you get BrickLink's 82.
 *
 * Not a pinia store, unlike its neighbours here. Nothing about this is view
 * state — it fetches, parses and stores — and appfr reads it from a data
 * source that has no pinia in it.
 */
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { ONE_MONTH } from '@/assets/js/timesToMs'
import { get, put, putAll } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'
import { listPageOptions, pageCount, parseRows } from './catalog-list'

/**
 * One item of one colour.
 *
 * `scope` is the address — `P-2` is "the parts made in colour 2" — and is
 * indexed, so reading a colour back is one lookup rather than a scan.
 */
export interface StoredColorItem {
  id: string
  scope: string
  colorId: string
  catType: string
  /** BrickLink's numeric id, which is what the list page is keyed by. */
  blItemId: string
  /** The catalogue number, `3001`. */
  itemNumber: string
  itemName: string
  image?: string
}

/**
 * How much of one colour is stored.
 *
 * `pages` is what BrickLink says the list runs to; `fetchedPages` is how far
 * up that the store actually goes. They differ when a colour ran past what
 * appfr was willing to fetch, and the difference is the whole reason this is
 * written down rather than held in memory: the rows outlive the session that
 * fetched them, so the caveat has to as well.
 */
export interface StoredColorScope {
  scope: string
  pages: number
  fetchedPages: number
}

/**
 * The two types the colour guide lists. `Wanted` and `For sale` are counts of
 * other people's lots rather than of catalogue items, and lead to a different
 * page entirely, so they are not this.
 */
export const COLOR_LIST_TYPES = new Set(['P', 'S'])

/** `P` and `2` as one string, which is how a stored row names its colour. */
export function colorScope(catType: string, colorId: string): string {
  return `${catType}-${colorId}`
}

/**
 * The page BrickLink's own colour guide links to.
 *
 * Two different parameters for the two types, because they are two different
 * questions: `colorPart` is "made in this colour", `colorInSet` is "contains
 * this colour".
 */
export function colorPageUrl(catType: string, colorId: string, page: number): string {
  const parameter = catType === 'S' ? 'colorInSet' : 'colorPart'
  return `https://www.bricklink.com/catalogList.asp?catType=${catType}&${parameter}=${colorId}&pg=${page}`
}

/**
 * How many pages a colour ran to, learned from the first page of it.
 *
 * Held here rather than stored because it is only wanted while a fetch is in
 * flight: once the rows are in IndexedDB, they are read back by scope and the
 * paging is over.
 */
export const colorPageCounts = new Map<string, number>()

export async function fetchColorPage(catType: string, colorId: string, page: number) {
  return await makeTextCall(
    Call.GET_CATALOG_LIST_COLOR_PAGE,
    colorPageUrl(catType, colorId, page),
    listPageOptions(),
    {
      catType,
      colorId,
      page,
    },
    ONE_MONTH,
  )
}

/**
 * One fetched page, stored.
 *
 * The rows carry the colour asked for rather than the one on the row: a set
 * listed under `colorInSet=2` contains colour 2, but the list page prints
 * whatever colour the set's own thumbnail happens to be.
 */
/**
 * How far this colour now goes.
 *
 * The highest page seen rather than a count of them, because pages are fetched
 * in order and a page re-read from the call cache must not make the list look
 * longer than it is.
 */
async function recordScope(scope: string, pages: number, page: number) {
  const db = await getDbConnection()
  try {
    const held = await get<StoredColorScope>(db, STORES.COLOR_SCOPES, scope)
    await put<StoredColorScope>(db, STORES.COLOR_SCOPES, {
      scope,
      pages,
      fetchedPages: Math.max(held?.fetchedPages ?? 0, page)
    })
  } finally {
    db.close()
  }
}

export async function handlePageResponse(detail: EventDetail) {
  const catType = String(detail.request.extraParams?.catType ?? '')
  const colorId = String(detail.request.extraParams?.colorId ?? '')
  if (!catType || !colorId) {
    return
  }
  const scope = colorScope(catType, colorId)
  const pages = pageCount(detail.response)
  colorPageCounts.set(scope, pages)
  await recordScope(scope, pages, Number(detail.request.extraParams?.page ?? 1))

  const rows = parseRows(detail.response)
  if (!rows.length) {
    return
  }
  const db = await getDbConnection()
  try {
    await putAll<StoredColorItem>(
      db,
      STORES.COLOR_ITEMS,
      rows.map((row) => ({
        id: `${scope}|${row.itemId}`,
        scope,
        colorId,
        catType,
        blItemId: row.itemId,
        itemNumber: row.itemNumber,
        itemName: row.itemName,
        image: row.image,
      })),
    )
  } finally {
    db.close()
  }
}
