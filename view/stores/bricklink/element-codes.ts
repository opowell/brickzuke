/**
 * Which BrickLink part and colour each LEGO element number is.
 *
 * LEGO sells a part by its element number — `300101` — and BrickLink files it
 * as a part number and a colour: `3001` in White. The two agree on most part
 * numbers and differ on enough to matter: BrickLink's `3070b` is LEGO's design
 * `3070`, and a printed torso is a BrickLink number LEGO never uses at all. So
 * a price read off Pick a Brick is filed against a BrickLink record through
 * BrickLink's own table of element numbers, and not by guessing from the
 * design.
 *
 * That table is one of the catalogue downloads — "Part and Color Codes" — and
 * like them it needs somebody signed in to BrickLink: logged out, the download
 * page sends the browser to LEGO's sign-in instead.
 *
 * Not a pinia store: nothing here is view state. The same shape as
 * [store-front-page].
 */
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { ONE_MONTH } from '@/assets/js/timesToMs'
import { getAll } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'
import { BRICK_LINK_CATALOG } from './catalog-codes'
import { getOptions, type BrickLinkColor } from './catalog-download-page'

/** One LEGO element, as the BrickLink part and colour it is. */
export interface ElementCode {
  /** LEGO's element number — `300101`. */
  code: string
  /** The BrickLink part it is an element of, addressed as every table here does — `P-3001`. */
  record: string
  itemNumber: string
  colorName: string
  /**
   * BrickLink's colour id, as a string the way a lot carries it. Missing where
   * the colour's name is not in the colour download — which is only the case
   * before that download has been made at all.
   */
  colorId?: string
}

/** The download, by the one field in its body that says which one it is. */
const DOWNLOAD_URL = 'https://www.bricklink.com/catalogDownload.asp?a=a'

export async function fetchElementCodes() {
  return await makeTextCall(
    Call.GET_ELEMENT_CODES,
    DOWNLOAD_URL,
    getOptions('S', BRICK_LINK_CATALOG.PART_AND_COLOR_CODES),
    undefined,
    // Element numbers are added as LEGO makes new ones, a few a week; a month
    // is what the other catalogue downloads here are held for.
    ONE_MONTH,
  )
}

/** Which column holds what, found by the header rather than by position. */
function columns(header: string[]): { item: number; color: number; code: number } | undefined {
  const find = (pattern: RegExp) => header.findIndex((name) => pattern.test(name.trim()))
  const item = find(/^item\s*(no|number)/i)
  const color = find(/^colou?r/i)
  const code = find(/^(element\s*)?code/i)
  return item === -1 || color === -1 || code === -1 ? undefined : {
    item,
    color,
    code
  }
}

/**
 * The download's rows as element codes, with each colour's name looked up in
 * `colorIds` — BrickLink's colour download, by name.
 *
 * Tab-separated with a header row, as every catalogue download is. A colour
 * column that already holds a number is taken as the id itself.
 */
export function parseElementCodes(text: string, colorIds: Map<string, string>): ElementCode[] {
  const rows = text.split('\n').map((row) => row.replaceAll('\r', '').split('\t'))
  const at = columns(rows.shift() ?? [])
  if (!at) {
    return []
  }
  const codes: ElementCode[] = []
  for (const row of rows) {
    const code = row[at.code]?.trim()
    const itemNumber = row[at.item]?.trim()
    const colorName = row[at.color]?.trim() ?? ''
    if (!code || !itemNumber) {
      continue
    }
    codes.push({
      code,
      record: `P-${itemNumber}`,
      itemNumber,
      colorName,
      colorId: /^\d+$/.test(colorName) ? colorName : colorIds.get(colorName.toLowerCase())
    })
  }
  return codes
}

/** BrickLink's colour ids, by the colour's name in lower case. */
async function colorIdsByName(): Promise<Map<string, string>> {
  const db = await getDbConnection()
  try {
    const colors = (await getAll<BrickLinkColor>(db, STORES.BRICK_LINK_COLORS)) ?? []
    return new Map(colors.map((color) => [String(color['Color Name']).toLowerCase(), String(color.colorId)]))
  } finally {
    db.close()
  }
}

/**
 * Replaces the stored codes with the download's, in one transaction: the
 * table is read as a whole — "which elements are this part" — and half an old
 * one beside half a new one would answer that wrongly for a while.
 */
export async function handleElementCodesResponse(detail: EventDetail) {
  const codes = parseElementCodes(String(detail.response ?? ''), await colorIdsByName())
  if (!codes.length) {
    return
  }
  const db = await getDbConnection()
  try {
    const tx = db.transaction(STORES.ELEMENT_CODES.name, 'readwrite')
    await Promise.all([tx.store.clear(), ...codes.map((code) => tx.store.put(code)), tx.done])
  } finally {
    db.close()
  }
}
