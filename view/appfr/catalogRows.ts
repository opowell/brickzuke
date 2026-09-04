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
import type { IDBPDatabase } from 'idb'
import { getAll, getAllFromIndex } from '../../idb/db'
import { loadCategory } from '../../idb/category'
import { itemTypeCode, loadItemTypes } from '../../idb/itemType'
import indices from '../../idb/indices'
import stores from '../../idb/stores'
import type {BrickLinkColor,
  Color} from '../stores/bricklink/catalog-download-page'

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
  for (const stored of categories) {
    if (stored.id === undefined) {
      continue
    }
    const category = await loadCategory(db, stored.id)
    rows.push({
      id: String(category.id),
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
        categoryId: category.brickLinkCategories?.[0]?.categoryId,
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
    rows.push({
      id: String(color.id),
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
        // carry between `id` and `categoryId`.
        colorId: joined.find((c) => c.colorId)?.colorId,
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
    id: String(itemType.id),
    entityKey: 'itemTypes',
    entityLabel: 'Item types',
    fields: {
      id: String(itemType.id),
      name: itemType.name,
      // The one-letter code an item carries in its own `type` field, which is
      // what narrowing the items table by this row has to say.
      code: itemTypeCode(itemType),
      items: itemType.countItems,
      categories: itemType.categories
    }
  }))
}

const loaders: Record<string, (db: IDBPDatabase) => Promise<ShellRow[]>> = {
  categories: categoryRows,
  colors: colorRows,
  itemTypes: itemTypeRows
}

/** The types this module serves — `items` scans, and nothing serves the codes. */
export const SMALL_ENTITIES = Object.keys(loaders)

/**
 * Rows for one small type, read once and held.
 *
 * The catalogue only changes when an update run rewrites it, and every query
 * over these types filters and sorts the same few thousand records — so the
 * join is paid once rather than on every keystroke.
 */
const cache = new Map<string, Promise<ShellRow[]>>()

export function rowsFor(entityKey: string, db: () => Promise<IDBPDatabase>) {
  const loader = loaders[entityKey]
  if (!loader) {
    return undefined
  }
  let rows = cache.get(entityKey)
  if (!rows) {
    rows = (async () => {
      const connection = await db()
      try {
        return await loader(connection)
      } finally {
        connection.close()
      }
    })().catch((thrown) => {
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
