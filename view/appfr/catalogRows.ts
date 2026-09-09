/**
 * The three small types, as rows.
 *
 * Categories, colours and item types are thousands of records rather than the
 * items table's hundreds of thousands, and each is one `getAll` plus one
 * indexed join. So unlike `items` they are read whole rather than scanned, and
 * the shell's paging works over an array.
 *
 * Each loader is `setCategories`/`setColors`/`setItemTypes` from model.ts,
 * flattened into `fields` under the names the columns read. Where the original
 * reads a field off the stored record that nothing ever fills, this derives it
 * from where the number is really held instead — the joined BrickLink records
 * for a colour, the categories for an item type — because a column that is
 * always blank is not a wired-up column.
 */
import type { ShellRow } from 'header-content-layout'
import { SETTINGS } from './settings'
import type { IDBPDatabase } from 'idb'
import { getAll, getAllFromIndex } from '../../idb/db'
import { loadCategories } from '../../idb/category'
import { itemTypeCode, loadItemTypes } from '../../idb/itemType'
import indices from '../../idb/indices'
import stores from '../../idb/stores'
import type {BrickLinkColor,
  Color} from '../stores/bricklink/catalog-download-page'
import type {ItemVariant,
  StoredItemInventory} from '../stores/bricklink/catalog-item-inv-page'

/**
 * A sum, or nothing at all when not one of the joined records carried the
 * field. The difference matters: an item type with no `Items` stored is not an
 * item type with zero items, and `0` in that cell is a claim the catalogue
 * never made. The original leaves it blank, and so does this.
 */
function total<T>(records: T[], read: (record: T) => number | undefined): number | undefined {
  let sum: number | undefined
  for (const record of records) {
    const value = read(record)
    if (value !== undefined) {
      sum = (sum ?? 0) + value
    }
  }
  return sum
}

function toNumber(value?: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  const parsed = Number.parseInt(value.replace(/,/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function categoryRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const categories = (await getAll<{ id?: number }>(db, stores.CATEGORIES)) ?? []
  const rows: ShellRow[] = []
  // Joined in one pass rather than one lookup per category: see
  // [loadCategories] for why a couple of thousand round trips here is the home
  // screen's problem and not just this table's.
  const joined = await loadCategories(
    db,
    categories.flatMap((stored) => (stored.id === undefined ? [] : [stored.id]))
  )
  for (const category of joined) {
    // BrickLink's category id — the number an item row carries in `category`,
    // and so the number a `category:` term holds. It is the row's `id` because
    // that is what the shell looks a named record up by: it runs the term back
    // against this type and picks out the row that *has* the id, so a row
    // keyed by brickzuke's own `category.id` is a row the header can never
    // find, and `category:5` goes back to showing the bare 5.
    const brickLinkId = toNumber(category.brickLinkCategories?.[0]?.categoryId)
    rows.push({
      // A category with no BrickLink category under it has no id anything can
      // name it by. It keeps brickzuke's own key, marked as brickzuke's, so it
      // cannot land on top of a real BrickLink id that reads the same.
      id: brickLinkId === undefined ? `bz${category.id}` : String(brickLinkId),
      entityKey: 'categories',
      entityLabel: 'Categories',
      fields: {
        id: String(category.id),
        type: category.type,
        items: category.items,
        // The BrickLink id, which is what an item row carries in `category` —
        // `id` above is brickzuke's own, and the two are not the same number.
        // The first, because narrowing states one term and all but a handful
        // of categories map to a single BrickLink category.
        //
        // Named for the term rather than for the record, and held as a number,
        // for the two reasons every addressable field here is: the parser
        // lowercases a term's field, so `categoryId` never resolved, and `:`
        // compares numbers exactly where it substring-matches strings. Both
        // matter more now than they did — this is the entity's `scope`, so it
        // is also the field the header reads a `category:` term back through
        // to put a name to the id, and a substring match would name category
        // 50 as the one someone asked 5 about.
        category: brickLinkId,
        // The one-letter code an item carries in its own `type`. `type` above
        // is every BrickLink category's `catType` joined, which is a label;
        // this is the first of them, which is the one a term can be written
        // against — as `categoryId` is, and for the same reason.
        typeId: category.type?.split(',')[0].trim(),
        // The id after the name, the way the original category cell reads.
        name: category.name + ' (' + category.id + ')'
      }
    })
  }
  return rows
}

async function colorRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const colors = (await getAll<Color>(db, stores.COLORS)) ?? []
  const rows: ShellRow[] = []
  for (const color of colors) {
    const joined =
      (await getAllFromIndex<BrickLinkColor>(db, indices.BRICK_LINK_COLORS_BY_COLOR_ID, color.id)) ??
      []
    const years = joined
      .flatMap((c) => [toNumber(c['Year From']), toNumber(c['Year To'])])
      .filter((year): year is number => year !== undefined && year > 0)
    // BrickLink's own colour id, which is what the inventory and colour-item
    // rows are addressed by and what a `colorid:` term holds. The row's `id`
    // for the reason a category's is: the header names a record by running the
    // term back and finding the row that has that id, and brickzuke's
    // auto-increment key is a different number entirely.
    const brickLinkId = toNumber(joined.find((c) => c.colorId)?.colorId)
    rows.push({
      // As with a category: a colour BrickLink has no id for keeps brickzuke's
      // own key, marked, since no term can name it either way.
      id: brickLinkId === undefined ? `bz${color.id}` : String(brickLinkId),
      entityKey: 'colors',
      entityLabel: 'Colors',
      fields: {
        // A number rather than the string every other type states, because a
        // colour is narrowed to by this id and `:` compares numbers exactly
        // where it substring-matches strings — `id:"85"` must not also answer
        // for colour 185.
        id: color.id,
        // BrickLink's own colour id, which is not this one: `id` above is
        // brickzuke's auto-increment key, and asking BrickLink for its colour
        // 2 when brickzuke means Aqua gets you Tan. The same gap categories
        // carry between `id` and `category`.
        //
        // Lowercase and a number, which is how the inventory and colour-item
        // rows already hold it: those two tables are addressed by this term,
        // and it is the entity's `scope`, so it is what the header looks a
        // colour up by when it names one.
        colorid: brickLinkId,
        name: color.name ?? joined.find((c) => c['Color Name'])?.['Color Name'],
        image: joined.find((c) => c.image)?.image,
        // `countItems` is the sum of `Parts`, exactly as `setColors` computes it.
        items: total<BrickLinkColor>(joined, (c) => toNumber(c.Parts)),
        sets: total<BrickLinkColor>(joined, (c) => toNumber(c['In Sets'])),
        wanted: total<BrickLinkColor>(joined, (c) => toNumber(c.Wanted)),
        forSale: total<BrickLinkColor>(joined, (c) => toNumber(c['For Sale'])),
        yearFrom: years.length ? Math.min(...years) : undefined,
        yearTo: years.length ? Math.max(...years) : undefined
      }
    })
  }
  return rows
}

/**
 * Item types.
 *
 * `loadItemTypes` is where the name and the two counts come from, because none
 * of the three is on a stored item type — see it for where each one is really
 * held. The original reads the same loader, so the two views state the same
 * numbers.
 */
async function itemTypeRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const itemTypes = await loadItemTypes(db)
  return itemTypes.map((itemType) => ({
    // The one-letter code, for the third time and the same reason: it is what
    // a `type:` term holds, so it is what the header has to find here to say
    // that `type:P` means Part.
    id: itemTypeCode(itemType) ?? `bz${itemType.id}`,
    entityKey: 'itemTypes',
    entityLabel: 'Item types',
    fields: {
      id: String(itemType.id),
      name: itemType.name,
      // The one-letter code an item carries in its own `type` field, which is
      // what narrowing the items table by this row has to say — and so what it
      // is called here as well. Items, categories and colour items all address
      // this code as `type`, and it is this entity's `scope`, so a `type:`
      // term in any of them reads back through this field to a type's name.
      type: itemTypeCode(itemType),
      items: itemType.countItems,
      categories: itemType.categories
    }
  }))
}

/**
 * One part of one set, as fields.
 *
 * Shared with the source's `inventory` type, which is the same records under a
 * different question: this is every part of every set anyone has opened, and
 * that is the parts of the one set someone is looking at. Same records, same
 * columns, so the same fields under the same names.
 */
export function inventoryFields(stored: StoredItemInventory): Record<string, unknown> {
  const variant = stored.itemVariant
  return {
    id: stored.id,
    record: stored.record,
    quantity: stored.quantity,
    image: variant.thumbnail,
    type: variant.itemType,
    name: variant.name,
    itemId: variant.itemId,
    color: variant.colorName,
    // Lowercase because the parser lowercases a term's field, and a number
    // because `:` compares numbers exactly where it substring-matches strings
    // — `colorid:"85"` must not also answer for colour 185.
    colorid: variant.colorId === undefined ? undefined : Number(variant.colorId),
    category: variant.catString,
    categoryName: variant.categoryName,
    variant: variant.variantId
  }
}

/**
 * Every part of every set that has been opened.
 *
 * Unlike the three above this is not a bulk download but the residue of
 * browsing: a set's inventory is written when someone opens it, so this table
 * grows as the app is used and is empty in a fresh profile. That is also why
 * it is not cached — the store it reads is written while the app is running.
 */
async function itemInventoryRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const stored = (await getAll<StoredItemInventory>(db, stores.ITEM_INVENTORIES)) ?? []
  return stored.map((record) => ({
    id: record.id,
    entityKey: 'itemInventories',
    entityLabel: 'Item inventories',
    fields: inventoryFields(record)
  }))
}

/**
 * An item in one colour, which is what an inventory row is a quantity of.
 *
 * The same records as above with the quantities dropped and the duplicates
 * folded together: a red 2x4 brick is one variant however many sets it turns
 * up in, so `variantId` is the key and `sets` is how many rows collapsed into
 * it — a count the original does not draw and which is the one thing this
 * table knows that the inventories do not.
 */
async function itemVariantRows(db: IDBPDatabase): Promise<ShellRow[]> {
  const stored = (await getAll<StoredItemInventory>(db, stores.ITEM_INVENTORIES)) ?? []
  const variants = new Map<string, { variant: ItemVariant; records: Set<string> }>()
  for (const record of stored) {
    const variant = record.itemVariant
    const held = variants.get(variant.variantId)
    if (held) {
      held.records.add(record.record)
      continue
    }
    variants.set(variant.variantId, {
      variant,
      records: new Set([record.record])
    })
  }
  return Array.from(variants.values()).map(({
    variant, records
  }) => ({
    id: variant.variantId,
    entityKey: 'itemVariants',
    entityLabel: 'Item variants',
    fields: {
      id: variant.variantId,
      variant: variant.variantId,
      image: variant.thumbnail,
      type: variant.itemType,
      name: variant.name,
      itemId: variant.itemId,
      color: variant.colorName,
      colorid: variant.colorId === undefined ? undefined : Number(variant.colorId),
      category: variant.catString,
      categoryName: variant.categoryName,
      sets: records.size
    }
  }))
}

const loaders: Record<string, (db: IDBPDatabase) => Promise<ShellRow[]>> = {
  categories: categoryRows,
  colors: colorRows,
  itemTypes: itemTypeRows
}

/**
 * The types read fresh every time.
 *
 * The three above are a bulk download and change only when an update run
 * rewrites them, so holding their rows costs nothing. These two are written
 * while someone is browsing — open a set and its parts appear — and a held
 * answer would be one that never grows.
 */
const liveLoaders: Record<string, (db: IDBPDatabase) => Promise<ShellRow[]>> = {
  itemInventories: itemInventoryRows,
  itemVariants: itemVariantRows,
  settings: settingRows
}

/**
 * The knobs, as records.
 *
 * Live for the third reason a type is: these change because somebody just
 * changed one, and a held answer would be the value before the edit. They come
 * from no store and touch no connection — the settings live in `localStorage`,
 * where a schema computed from them can read them without awaiting anything —
 * so the database handed in goes unused, which is what the argument is for.
 */
async function settingRows(): Promise<ShellRow[]> {
  return SETTINGS.map((setting) => ({
    id: setting.key,
    entityKey: 'settings',
    entityLabel: 'Settings',
    fields: {
      id: setting.key,
      // The field a `setting:` term names one by, and this type's scope — so
      // the cell that writes a value can find its setting from the row alone.
      setting: setting.key,
      name: setting.name,
      value: setting.value.value,
      detail: setting.detail
    }
  }))
}

/** The types this module serves — `items` scans, and nothing serves the codes. */
export const SMALL_ENTITIES = [...Object.keys(loaders), ...Object.keys(liveLoaders)]

/**
 * Rows for one small type, read once and held.
 *
 * The catalogue only changes when an update run rewrites it, and every query
 * over these types filters and sorts the same few thousand records — so the
 * join is paid once rather than on every keystroke.
 */
const cache = new Map<string, Promise<ShellRow[]>>()

/** One connection, opened for the loader and given back whatever it does. */
async function read(
  loader: (db: IDBPDatabase) => Promise<ShellRow[]>,
  db: () => Promise<IDBPDatabase>
): Promise<ShellRow[]> {
  const connection = await db()
  try {
    return await loader(connection)
  } finally {
    connection.close()
  }
}

export function rowsFor(entityKey: string, db: () => Promise<IDBPDatabase>) {
  const live = liveLoaders[entityKey]
  if (live) {
    return read(live, db)
  }
  const loader = loaders[entityKey]
  if (!loader) {
    return undefined
  }
  let rows = cache.get(entityKey)
  if (!rows) {
    rows = read(loader, db).catch((thrown) => {
      // A failed load must not be the answer forever.
      cache.delete(entityKey)
      throw thrown
    })
    cache.set(entityKey, rows)
  }
  return rows
}

/** Drops the held rows, for when an update run has rewritten the catalogue. */
export function forgetCatalogRows() {
  cache.clear()
}
