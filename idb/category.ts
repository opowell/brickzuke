import { sum } from './utils'
import { getAll, getAllFromIndex } from './db'
import type { BrickLinkCategory, Category } from '@/stores/bricklink/catalog-download-page'
import indices from './indices'
import stores from './stores'
import type { IDBPDatabase } from 'idb'

/** The joined records a category is built from, as `loadCategory` reads them. */
function joinCategory(id: number, brickLinkCategories: BrickLinkCategory[]): Category {
  const category: Category = {
    id
  }
  category.brickLinkCategories = brickLinkCategories
  category.items = sum<BrickLinkCategory>(brickLinkCategories, c => c.items)
  category.score = category.items
  category.name = brickLinkCategories.map((c: BrickLinkCategory) => c['Category Name']).join(', ')
  category.type = brickLinkCategories.map((c: BrickLinkCategory) => c.catType).join(', ')
  return category
}

/**
 * Every category the store holds, joined in one pass.
 *
 * `loadCategory` is an indexed lookup, which is a transaction, which is a
 * round trip — and the catalogue lists a couple of thousand categories, so
 * building the table one at a time is a couple of thousand of them in a row.
 * That is paid on the home screen before its first card can draw anything, and
 * the pictures on the categories card are indexed reads waiting behind it.
 *
 * The index is over `bzCategoryId`, so reading the BrickLink records whole and
 * grouping by that field is the same join the other way round. Within a group
 * the order is the store's own key order, which is the order the index hands
 * them back in as well, so the joined strings read identically.
 */
export async function loadCategories(db: IDBPDatabase, ids: number[]): Promise<Category[]> {
  const joined = new Map<number, BrickLinkCategory[]>()
  for (const record of (await getAll<BrickLinkCategory>(db, stores.BRICK_LINK_CATEGORIES)) ?? []) {
    const owner = Number(record.bzCategoryId)
    if (!Number.isFinite(owner)) {
      continue
    }
    const group = joined.get(owner)
    if (group) {
      group.push(record)
    } else {
      joined.set(owner, [record])
    }
  }
  return ids.map((id) => joinCategory(id, joined.get(id) ?? []))
}

export async function loadCategory(db: IDBPDatabase, id: number) {
  const category: Category = {
    id
  }
  category.brickLinkCategories = await getAllFromIndex<BrickLinkCategory>(db, indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID, category.id)
  category.items = sum<BrickLinkCategory>(category.brickLinkCategories, c => c.items)
  category.score = category.items
  category.name = category.brickLinkCategories?.map((c: BrickLinkCategory) => c['Category Name']).join(', ')
  category.type = category.brickLinkCategories?.map((c: BrickLinkCategory) => c.catType).join(', ')
  return category
}

