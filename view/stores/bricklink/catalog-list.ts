/**
 * One `catalogList.asp` page: how to ask for it, and how to read it.
 *
 * Lifted out of the pinia store so its two callers share a definition. The
 * legacy categories view asks for a category's items; appfr asks for a
 * colour's. Only the query string differs — the page is the same template
 * either way, so the extraction is the same too, and a fix to one is a fix to
 * both.
 */
import { extractValueFromHtml, extractValuesFromHtml } from '~/assets/js/utils'

export interface CatalogListRow {
  /** BrickLink's own numeric id for the item, from `data-itemid`. */
  itemId: string
  colorId: string
  image: string
  /** The catalogue number, `3001` — what an item record is keyed by. */
  itemNumber: string
  itemName: string
}

/** The headers BrickLink expects of a browser asking for a catalogue page. */
export function listPageOptions() {
  return {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
      'cache-control': 'max-age=0',
      priority: 'u=0, i',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: null,
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
  }
}

/**
 * How many pages the list runs to.
 *
 * One when the page does not say, which is the honest reading: a list short
 * enough to have no pager is one page, and so is a page this failed to parse —
 * the alternative is queueing `NaN` more requests.
 */
export function pageCount(html: string): number {
  const extraction = extractValueFromHtml(
    html,
    [
      'Items Found.  Page <B>',
      '<B>', // numPages
    ],
    ['</B> (Showing', ''],
  )
  const pages = Number.parseInt(extraction?.[0]?.[0])
  return Number.isFinite(pages) && pages > 0 ? pages : 1
}

/** The item rows of one page, in the order BrickLink lists them. */
export function parseRows(html: string): CatalogListRow[] {
  const rows = extractValueFromHtml(
    html,
    ['<TR class="catalog-list__body-header">', '<TR'],
    ['</TABLE>', '</TR>'],
  )
  if (!rows[0]) {
    return []
  }
  return rows[0].map((rowHtml: string) => {
    const values = extractValuesFromHtml(
      rowHtml,
      [
        "data-itemid='", // item id
        "data-itemcolorid='", // color id,
        "SRC='", // image
        '<A HREF="',
        '>', // item number
        '<strong>', // item name
      ],
      ["' ", "'", "'", '"', '</A>', '</strong>'],
    )
    return {
      itemId: values[0],
      colorId: values[1],
      image: values[2],
      itemNumber: values[4],
      itemName: values[5],
    }
  })
}
