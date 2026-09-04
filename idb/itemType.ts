import type { IDBPDatabase } from 'idb'
import type { BrickLinkCategory, BrickLinkItemType, ItemType } from '@/stores/bricklink/catalog-download-page'
import { getAll, getAllFromIndex } from './db'
import indices from './indices'
import stores from './stores'

/** The one-letter code an item carries in its type — `S`, `P`, `M`. */
export function itemTypeCode(type: ItemType): string | undefined {
  const first = type.brickLinkItemTypes?.[0]
  return first?.itemTypeId ?? first?.['Item Type ID']
}

/** What one item type holds: the items catalogued in it, and the categories. */
export interface ItemTypeTotals {
  items?: number
  categories?: number
}

/**
 * Both numbers, per one-letter code, counted off the categories.
 *
 * Neither is on an item type. The catalogue download for item types states an
 * id and a name and nothing else, so `Items` — the field the tables read — was
 * never on a stored record; `categories` is written by the catalogue front
 * page alone, and only for the types it has been fetched for. Both are on the
 * categories, which carry their type in `catType` and their own item count
 * from the catalogue tree, so this counts them there — as the original's
 * `filteredItemTypes` counts the categories it has in memory.
 *
 * Counting them there also means the two tables cannot disagree: pressing
 * `Categories` on a row lands on exactly as many rows as the number promised,
 * and each row's `Items` is one of the numbers this summed.
 *
 * A category is counted once per type it is in, and its items are attributed
 * to the type of the BrickLink record carrying them — a category listed under
 * two types is a row in both tables, and its parts are parts of both.
 */
export async function loadItemTypeTotals(db: IDBPDatabase): Promise<Map<string, ItemTypeTotals>> {
  const categories = (await getAll<BrickLinkCategory>(db, stores.BRICK_LINK_CATEGORIES)) ?? []
  const items = new Map<string, number>()
  const counted = new Map<string, Set<string>>()
  for (const category of categories) {
    const code = category.catType
    if (!code) {
      continue
    }
    // The brickzuke category this record belongs to, which is what the
    // categories table draws a row for: two BrickLink records joined to one
    // are one row there, and so one category here.
    const owner = String(category.bzCategoryId ?? category.categoryId)
    const seen = counted.get(code) ?? new Set<string>()
    seen.add(owner)
    counted.set(code, seen)
    if (Number.isFinite(category.items)) {
      items.set(code, (items.get(code) ?? 0) + Number(category.items))
    }
  }
  const totals = new Map<string, ItemTypeTotals>()
  for (const [code, seen] of counted) {
    totals.set(code, {
      // Absent rather than zero when not one category carried a count: an item
      // type nothing has been counted for is not an item type with no items,
      // and `0` in that cell is a claim the catalogue never made.
      items: items.get(code),
      categories: seen.size
    })
  }
  return totals
}

/**
 * Every item type, with the fields the tables draw.
 *
 * The name is on the BrickLink record rather than on brickzuke's own:
 * `handleDownload` files every downloaded field there and puts an empty object
 * in `itemTypes`, so a stored item type is an id and nothing else.
 */
export async function loadItemTypes(db: IDBPDatabase): Promise<ItemType[]> {
  const itemTypes = (await getAll<ItemType>(db, stores.ITEM_TYPES)) ?? []
  const totals = await loadItemTypeTotals(db)
  for (const itemType of itemTypes) {
    itemType.brickLinkItemTypes = await getAllFromIndex<BrickLinkItemType>(
      db,
      indices.BRICK_LINK_ITEM_TYPES_BY_ITEM_TYPE_ID,
      itemType.id
    )
    itemType.name = itemType.name ?? itemType.brickLinkItemTypes?.[0]?.['Item Type Name']
    const code = itemTypeCode(itemType)
    const held = code ? totals.get(code) : undefined
    itemType.countItems = held?.items
    itemType.categories = held?.categories
  }
  return itemTypes
}
