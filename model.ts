import type { CountsState } from './types/counts-state'
import { ref } from 'vue'
import { count } from './idb/db'
import { getDbConnection } from './idb/idb'
import stores from './idb/stores'

/**
 * The bulk catalogue's counts — the stores BrickLink's downloads fill — taken
 * afresh. Item types are written onto their table in [itemTypes]; the rest
 * into [selectedCounts].
 */
export async function setCounts() {
  processingCounts.value = true
  const db = await getDbConnection()
  itemTypes.value[2].count = await count(db, stores.ITEM_TYPES)
  selectedCounts.value.items = await count(db, stores.ITEMS)
  selectedCounts.value.categories = await count(db, stores.CATEGORIES)
  selectedCounts.value.colors = await count(db, stores.COLORS)
  selectedCounts.value.updated = Date.now()
  db.close()
  processingCounts.value = false
}

export const processingCounts = ref(false)

/** The four bulk-downloaded tables, by the key the shell knows each by. */
export const itemTypes = ref<{ id: string; label: string; count?: number }[]>([
  {
    id: 'categories',
    label: 'Categories'
  },
  {
    id: 'colors',
    label: 'Colors'
  },
  {
    id: 'itemTypes',
    label: 'Item types'
  },
  {
    id: 'items',
    label: 'Items'
  }
])

export const selectedCounts = ref<CountsState>({
  items: 0,
  categories: 0,
  colors: 0,
  updated: Date.now(),
  finished: false
})
