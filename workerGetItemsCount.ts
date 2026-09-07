import type { BrickLinkCategory } from '@/stores/bricklink/catalog-download-page'
import type { IndexDefinition } from './idb/indices'
import type { StoreDefinition } from './idb/stores'

/// <reference lib="webworker" />

interface WorkerMessage {
  type: 'progress' | 'complete';
  count: number;
}

export default async function workerGetItemsCount(
  stores: { [key: string]: StoreDefinition },
  indices: { [key: string]: IndexDefinition },
  searchLowercase: string,
): Promise<number> {
  let lastUpdateTime = Date.now()
  const postProgress = (count: number) => {
    const currentTime = Date.now()
    if (currentTime - lastUpdateTime >= 500) {
      const message: WorkerMessage = {
        type: 'progress',
        count 
      }
      self.postMessage(message)
      lastUpdateTime = currentTime
    }
  }
  // Write a log entry to IndexedDB
  let openDB
  try {
    // Try dynamic import (should work in vite web worker)
    openDB = (await import('idb')).openDB
  } catch {
    // Fallback: try importScripts from CDN (UMD build)
    if (typeof importScripts === 'function') {
      importScripts('https://cdn.jsdelivr.net/npm/idb@8.0.3/build/umd.js')
      openDB = self.idb.openDB
    } else {
      throw new Error('idb not available in worker')
    }
  }
  const bzDb = await openDB('brickzuke', 16, {
    upgrade() {
      console.log('upgrade db')
    },
  })
  if (!bzDb) {
    console.log('Worker could not get DB connection')
    return 0
  }
  let numItems = 0
  const store = bzDb.transaction(stores.CATEGORIES.name, 'readonly').store
  if (!store) {
    return numItems
  }
  const allCategories = await store.getAll()
  if (!allCategories) {
    return numItems
  }
  for (let i = 0; i < allCategories.length; i++) {
    const category = allCategories[i]
    const categoryId = category.id
    console.log('Loading category:', categoryId)
    try {
      const brickLinkCategories = await getAllFromIndex<BrickLinkCategory>(bzDb, indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID, categoryId)
      console.log('Found BrickLink categories for category ID:', categoryId, typeof categoryId, brickLinkCategories)
      if (!brickLinkCategories) {
        console.log('No BrickLink categories for category ID:', categoryId)
        continue
      }
      for (let j = 0; j < brickLinkCategories.length; j++) {
        const blCategory = brickLinkCategories[j]
        console.log('BrickLink Category:', blCategory, searchLowercase)
        try {
          if (blCategory['Category Name'].toLowerCase().includes(searchLowercase!)) {
            const blItemCount = await countFromIndex(bzDb, indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID, blCategory.categoryId)
            console.log('direct match on name', blItemCount)
            numItems += blItemCount
            continue
          }
          const tx = bzDb.transaction(stores.BRICK_LINK_ITEMS.name)
          const store = tx.objectStore(stores.BRICK_LINK_ITEMS.name)
          const dbIndex = store.index(indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID.name)
          const cursor = await dbIndex.openCursor(IDBKeyRange.only(blCategory.categoryId))
          while (true) {
            if (!cursor) {
              console.log('No more items for BL category:', blCategory)
              break
            }
            const brickLinkItem = cursor.value
            if (!brickLinkItem) {
              console.log('No more items for BL category:', blCategory)
              break
            }
            if (brickLinkItem.Name.toLowerCase().includes(searchLowercase)) {
              numItems++
              postProgress(numItems)
            }
            await cursor.continue()
          }
        } catch (e: unknown) {
          console.error('Error processing BL category:', blCategory, e)
        }
      }
    } catch (e: unknown) {
      console.error('Error loading category ID:', categoryId, e)
    }
  }
  // Send final count
  postMessage({
    type: 'complete',
    count: numItems 
  })
  return numItems
}
