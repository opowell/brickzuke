/**
 * What a part is in, off the part's own "appears in" page.
 *
 * `catalogItemIn.asp?P=87615&in=S` is every set the part is in, and `in=M`
 * every minifigure, each with how many and in which colour — the lines of those
 * sets' inventories, read from the part's side and in one request. Opening
 * every set to find the ones with a part in it is twenty thousand requests;
 * this is two.
 *
 * The page groups its rows under a section (`Appears As Regular:`, as
 * `Counterpart`, `Alternate`, `Extra`) and, within that, under the colour's
 * name (`White:`). Every section is kept, as a set's own inventory keeps them:
 * both file a line under `set|part-colour`, so the two agree on what a line is
 * and a line stated by both is one line.
 */
import { getDbConnection } from '../../../idb/idb'
import { get, putAll, put } from '../../../idb/db'
import STORES from '../../../idb/stores'
import type { EventDetail } from '@/assets/js/make-call'
import type { BrickLinkItem } from './catalog-download-page'
import type { ItemVariant, StoredItemInventory } from './catalog-item-inv-page'
import { colorIdsByName } from './element-codes'

/** The kinds of item a part's page can say it is in. */
export type Container = 'S' | 'M'

/** One row of the page: the set or minifigure, how many, and in what colour. */
export interface Appearance {
  /** `S-60465-1` — the container, as every table here names an item. */
  record: string
  quantity: number
  /** The colour's name as the page heads it, or nothing for a part with none. */
  colorName?: string
  /** `Regular`, `Counterpart`, `Alternate` or `Extra`. */
  section: string
}

/** A line of a set's inventory, as the part's page states it. */
export interface StoredAppearance extends StoredItemInventory {
  /** `P-87615`, the part whose page said so. */
  part: string
}

/** How much of a part's page has been read. */
export interface StoredAppearanceScope {
  /** `P-87615|S`. */
  id: string
  part: string
  within: Container
  /** How many lines the page gave. */
  lines: number
  fetchedAt: number
}

export function appearsInUrl(part: string, within: Container): string {
  const [type, ...rest] = part.split('-')
  return `https://www.bricklink.com/catalogItemIn.asp?${type}=${rest.join('-')}&in=${within}`
}

export function appearanceScopeId(part: string, within: Container): string {
  return `${part}|${within}`
}

/**
 * The rows of the page, in order.
 *
 * One pass over the markup, taking three things as they come: a section's
 * heading, a colour's heading — a bold name ending in a colon, which is also
 * what a section's is, told apart by its `Appears As` — and a row, which is a
 * quantity `&nbsp;2&nbsp;in` followed by the item's link. The raw page is
 * upper-case HTML and the rendered one lower-case, so neither is assumed.
 */
export function parseAppearances(html: string): Appearance[] {
  const end = html.search(/<B>Summary:<\/B>/i)
  const body = end === -1 ? html : html.slice(0, end)
  const pattern =
    /<B>Appears As ([^<:]+):<\/B>|<B>([^<]+?):<\/B><\/FONT><\/TD><\/TR>|&nbsp;(\d+)&nbsp;in<\/TD>[\s\S]*?catalogitem\.page\?([A-Z])=([^"'&]+)["']/gi
  const found: Appearance[] = []
  let section = 'Regular'
  let colorName: string | undefined
  for (const match of body.matchAll(pattern)) {
    if (match[1]) {
      section = match[1].trim()
      colorName = undefined
    } else if (match[2]) {
      colorName = decode(match[2].trim())
    } else if (match[3]) {
      found.push({
        record: `${match[4].toUpperCase()}-${match[5]}`,
        quantity: Number(match[3]),
        colorName,
        section
      })
    }
  }
  return found
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCharCode(Number(code)))
    .trim()
}

/**
 * The page's rows as the lines a set's inventory would give — the same id,
 * the same variant — made from the part's own catalogue record and BrickLink's
 * colour ids by name.
 */
export function appearanceLines(
  part: string,
  appearances: readonly Appearance[],
  item: BrickLinkItem | undefined,
  colorIds: ReadonlyMap<string, string>
): StoredAppearance[] {
  const [itemType, ...rest] = part.split('-')
  const itemId = rest.join('-')
  const lines = new Map<string, StoredAppearance>()
  for (const appearance of appearances) {
    const named = appearance.colorName?.toLowerCase()
    // `(Not Applicable)` is colour 0 to BrickLink and no colour to a set's own
    // inventory, which files such a line under `3626-undefined`: the same.
    const found = named ? colorIds.get(named) : undefined
    const colorId = found && found !== '0' ? found : undefined
    const variant: ItemVariant = {
      itemType,
      itemId,
      name: item?.Name ?? itemId,
      thumbnail: colorId
        ? `https://img.bricklink.com/ItemImage/${itemType}N/${colorId}/${itemId}.png`
        : (item?.image ?? ''),
      colorId,
      colorName: colorId ? appearance.colorName : undefined,
      catType: itemType,
      catString: String(item?.['Category ID'] ?? ''),
      categoryName: item?.['Category Name'] ?? '',
      variantId: `${itemId}-${colorId}`
    }
    const id = `${appearance.record}|${variant.variantId}`
    // A part in one set under two sections is one line, as the set's own page
    // has it — the later section's figure standing, as it does there.
    lines.set(id, {
      id,
      record: appearance.record,
      quantity: appearance.quantity,
      itemVariant: variant,
      part
    })
  }
  return [...lines.values()]
}

/** Files a part's page: its lines, and that the page was read. */
export async function handleItemInResponse(detail: EventDetail): Promise<void> {
  const part = String(detail.request.extraParams?.part ?? '')
  const within = String(detail.request.extraParams?.within ?? '') as Container
  if (!part || !within) {
    return
  }
  const appearances = parseAppearances(String(detail.response ?? ''))
  const colorIds = await colorIdsByName()
  const db = await getDbConnection()
  try {
    const item = await get<BrickLinkItem>(db, STORES.BRICK_LINK_ITEMS, part)
    const lines = appearanceLines(part, appearances, item, colorIds)
    if (lines.length) {
      await putAll<StoredAppearance>(db, STORES.PART_APPEARANCES, lines)
    }
    await put<StoredAppearanceScope>(db, STORES.PART_APPEARANCE_SCOPES, {
      id: appearanceScopeId(part, within),
      part,
      within,
      lines: lines.length,
      fetchedAt: Date.now()
    })
  } finally {
    db.close()
  }
}
