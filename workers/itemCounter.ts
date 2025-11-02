/// <reference lib="webworker" />

interface BrickLinkCategory {
  categoryId: string;
  'Category Name': string;
}

interface StoreDefinition {
  name: string;
}

interface IndexDefinition {
  name: string;
}
import { openDB } from 'idb';

interface WorkerMessage {
  type: 'progress' | 'complete';
  count: number;
}

let lastUpdateTime = Date.now();

const postProgress = (count: number, numCategories: number) => {
  const currentTime = Date.now();
  if (currentTime - lastUpdateTime >= 10) {
    const message: WorkerMessage = { type: 'progress', count, numCategories };
    self.postMessage(message);
    lastUpdateTime = currentTime;
  }
};

self.onmessage = async (e: MessageEvent) => {
  const { stores, indices, searchLowercase } = e.data;

  try {
    const bzDb = await openDB('brickzuke', 16, {
      upgrade() {
        console.log('upgrade db');
      },
    });

    if (!bzDb) {
      console.log('Worker could not get DB connection');
      self.postMessage({ type: 'complete', count: 0 });
      return;
    }

    let numItems = 0
    let numCategories = 0
    const store = bzDb.transaction(stores.CATEGORIES.name, 'readonly').store;
    if (!store) {
      self.postMessage({ type: 'complete', count: 0, numCategories });
      return;
    }

    const allCategories = await store.getAll();
    if (!allCategories) {
      self.postMessage({ type: 'complete', count: 0, numCategories });
      return;
    }

    for (const category of allCategories) {
      const categoryId = category.id;

      try {
        const categoryTx = bzDb.transaction(stores.BRICK_LINK_CATEGORIES.name, 'readonly');
        const categoryIndex = categoryTx.store.index(indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID.name);
        const brickLinkCategories = await categoryIndex.getAll(categoryId);

        if (!brickLinkCategories || brickLinkCategories.length === 0) {
          console.log('No BrickLink categories for category ID:', categoryId);
          continue;
        }

        for (const blCategory of brickLinkCategories) {
          try {
            if (blCategory['Category Name'].toLowerCase().includes(searchLowercase)) {
              numCategories++;
              const itemsTx = bzDb.transaction(stores.BRICK_LINK_ITEMS.name, 'readonly');
              const itemsIndex = itemsTx.store.index(indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID.name);
              const count = await itemsIndex.count(blCategory.categoryId);
              numItems += count;
              postProgress(numItems, numCategories);
              continue;
            }

            const itemsTx = bzDb.transaction(stores.BRICK_LINK_ITEMS.name, 'readonly');
            const itemsIndex = itemsTx.store.index(indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID.name);
            let cursor = await itemsIndex.openCursor(IDBKeyRange.only(blCategory.categoryId));

            while (cursor) {
              const brickLinkItem = cursor.value;
              if (brickLinkItem.Name.toLowerCase().includes(searchLowercase)) {
                numItems++;
                postProgress(numItems, numCategories);
              }
              cursor = await cursor.continue();
            }
          } catch (e) {
            console.error('Error processing BL category:', blCategory, e);
          }
        }
      } catch (e) {
        console.error('Error loading category ID:', categoryId, e);
      }
    }

    self.postMessage({ type: 'complete', count: numItems, numCategories });
    bzDb.close();
  } catch (e) {
    console.error('Worker error:', e);
    self.postMessage({ type: 'complete', count: 0, numCategories: 0});
  }
};
