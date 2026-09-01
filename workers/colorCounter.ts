/// <reference lib="webworker" />

import { openDB } from 'idb'

interface WorkerMessage {
  type: 'progress' | 'complete';
  count: number;
}

let lastUpdateTime = Date.now()

const postProgress = (count: number, numCategories: number) => {
  const currentTime = Date.now()
  if (currentTime - lastUpdateTime >= 500) {
    const message: WorkerMessage = {
      type: 'progress',
      count,
      numCategories 
    }
    self.postMessage(message)
    lastUpdateTime = currentTime
  }
}

self.onmessage = async (e: MessageEvent) => {
  const {
    stores, indices, searchLowercase 
  } = e.data

  try {
    const bzDb = await openDB('brickzuke', 16, {
      upgrade() {
        console.log('upgrade db')
      },
    })

    if (!bzDb) {
      console.log('Worker could not get DB connection')
      self.postMessage({
        type: 'complete',
        count: 0 
      })
      return
    }

    let numItems = 0
    const numCategories = 0
    const store = bzDb.transaction(stores.COLORS.name, 'readonly').store
    if (!store) {
      self.postMessage({
        type: 'complete',
        count: 0 
      })
      return
    }

    const allColors = await store.getAll()
    if (!allColors) {
      self.postMessage({
        type: 'complete',
        count: 0 
      })
      return
    }

    for (const color of allColors) {
      const colorId = color.id

      try {
        const transaction = bzDb.transaction(stores.BRICK_LINK_COLORS.name, 'readonly')
        const colorIndex = transaction.store.index(indices.BRICK_LINK_COLORS_BY_COLOR_ID.name)
        const brickLinkColors = await colorIndex.getAll(colorId)

        if (!brickLinkColors || brickLinkColors.length === 0) {
          console.log('No BrickLink color for color ID:', colorId)
          continue
        }

        for (const blColor of brickLinkColors) {
          try {
            if (blColor['Color Name'].toLowerCase().includes(searchLowercase)) {
              numItems++
              postProgress(numItems, numCategories)
              continue
            }
          } catch (e) {
            console.error('Error processing BL color:', blColor, e)
          }
        }
      } catch (e) {
        console.error('Error loading color ID:', colorId, e)
      }
    }

    self.postMessage({
      type: 'progress',
      count: numItems 
    })
    self.postMessage({
      type: 'complete' 
    })
    bzDb.close()
  } catch (e) {
    console.error('Worker error:', e)
    self.postMessage({
      type: 'complete',
      count: 0 
    })
  }
}
