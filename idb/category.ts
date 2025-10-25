import { sum } from './utils'
import { getAllFromIndex } from './db'
import type { BrickLinkCategory, Category } from '@/stores/bricklink/catalog-download-page'
import indices from './indices'
import type { IDBPDatabase } from 'idb'

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

