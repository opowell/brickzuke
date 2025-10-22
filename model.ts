import { ref } from 'vue'
import { type BrickLinkCategory, type BrickLinkColor, type BrickLinkItem, type Category, type Item } from './view/stores/bricklink/catalog-download-page'
import type { SelectOption } from './view/components/header/TheViews.vue'
import { count, getAllFromIndex } from './idb/db'
import { getDbConnection } from './idb/idb'
import stores from './idb/stores'
import { formatInteger } from '@/assets/js/utils'
import type { IDBPDatabase } from 'idb'
import indices from './idb/indices'

interface Filter {
  key: string
  label?: string
  value: string | number
  displayValue?: string | number
}

export const selectedItemType = ref()
export const filters = ref<Filter[]>([])
export const processingCounts = ref(false)
const search = ref<string | undefined>(undefined)
export async function setCounts() {
  processingCounts.value = true
  const db = await getDbConnection()
  itemTypes.value[0].count = await count(db, stores.CATEGORIES)
  itemTypes.value[1].count = await count(db, stores.COLORS)
  itemTypes.value[2].count = await count(db, stores.ITEM_TYPES)
  itemTypes.value[3].count = await getItemsCount(db)
  itemTypes.value[4].count = await count(db, stores.PART_AND_COLOR_CODES)
  processingCounts.value = false
}

async function getItemsCount(db: IDBPDatabase): Promise<number> {
  console.log('Setting items with filters:', filters.value)
  const filteredCategories: number[] = filters.value.filter(f => f.key === 'category').map(f => Number(f.value))
  if (filteredCategories.length === 0) {
    return await count(db, stores.ITEMS)
  }
  let numItems = 0
  for (let i = 0; i < filteredCategories.length; i++) {
    const categoryId = filteredCategories[i]
    try {
      let count = 0
      const brickLinkCategories = await getAllFromIndex<BrickLinkCategory>(db, indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID, categoryId)
      if (!brickLinkCategories) {
        console.log('No BrickLink categories for category ID:', categoryId)
        continue
      }
      for (let j = 0; j < brickLinkCategories.length; j++) {
        const blCategory = brickLinkCategories[j]
        console.log('BrickLink Category:', blCategory['Category Name'])
        while (true) {
          const tx = db.transaction(stores.BRICK_LINK_ITEMS.name)
          const store = tx.objectStore(stores.BRICK_LINK_ITEMS.name)
          const dbIndex = store.index(indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID.name)
          const cursor = await dbIndex.openCursor(IDBKeyRange.only(blCategory.categoryId))
          if (!cursor) {
            console.log('No more items for BL category:', blCategory)
            break
          }
          if (count > 0) {
            await cursor.advance(count)
          }
          count++
          const brickLinkItem = cursor.value
          if (!brickLinkItem) {
            break
          }
          numItems++
        }
      }
      console.log('Loaded category:', categoryId)
    } catch (e) {
      console.error('Error loading category ID:', categoryId, e)
    }
  }
  return numItems
}

function findIndex<T extends { score: number }>(array: T[], itemToAdd: T): number {
  let low = 0,
    high = array.length;

  while (low < high) {
    const mid = low + high >>> 1
    if (array[mid].score < itemToAdd.score) low = mid + 1
    else high = mid
  }
  return low
}

export const tableItems = ref<any[]>([])
export const tableRef = ref<InstanceType<typeof TableComponent> | null>(null)

export async function setItems(db: IDBPDatabase) {
  console.log('Setting items with filters:', filters.value)
  const filteredCategories: number[] = filters.value.filter(f => f.key === 'category').map(f => Number(f.value))
  if (filteredCategories.length > 0) {
    const items: Item[] = []
    tableItems.value = []
    for (let i = 0; i < filteredCategories.length; i++) {
      const categoryId = filteredCategories[i]
      try {
        console.log('Loading category for ID:', categoryId)
        let count = 0
        const brickLinkCategories = await getAllFromIndex<BrickLinkCategory>(db, indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID, categoryId)
        if (!brickLinkCategories) {
          console.log('No BrickLink categories for category ID:', categoryId)
          continue
        }
        for (let j = 0; j < brickLinkCategories.length; j++) {
          const blCategory = brickLinkCategories[j]
          console.log('BrickLink Category:', blCategory['Category Name'])
          while (true) {
            const tx = db.transaction(stores.BRICK_LINK_ITEMS.name)
            const store = tx.objectStore(stores.BRICK_LINK_ITEMS.name)
            const dbIndex = store.index(indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID.name)
            const cursor = await dbIndex.openCursor(IDBKeyRange.only(blCategory.categoryId))
            if (!cursor) {
              console.log('No more items for BL category:', blCategory)
              break
            }
            if (count > 0) {
              await cursor.advance(count)
            }
            count++
            const brickLinkItem = cursor.value
            if (!brickLinkItem) {
              break
            }
            console.log('Processing item:', brickLinkItem.id)
            const brickLinkItems = [brickLinkItem]
            const item: Item = {
              id: brickLinkItem.itemId,
            }
            item.brickLinkItems = brickLinkItems
            item.name = brickLinkItems?.map((bi: BrickLinkItem) => bi.Name + ' (' + bi.id + ')').join(', ')
            item.itemType = brickLinkItems?.map((bi: BrickLinkItem) => bi.itemType).join(', ')
            item.category = brickLinkItems?.map((bi: BrickLinkItem) => bi['Category Name']).join(', ')
            item.image = brickLinkItems?.find((bi: BrickLinkItem) => bi.image)?.image
            item.score = Math.random()
            const index = findIndex(items, item)
            items.splice(index, 0, item)
            if (count % 1000 === 0) {
              console.log('Processed items:', count)
            }
            if (index < 200) {
              tableRef.value?.addRow(item, index)
            }
          }
        }
        console.log('Loaded category:', categoryId)
      } catch (e) {
        console.error('Error loading category ID:', categoryId, e)
      }
    }
  } else {
    const items: Item[] = []
    let count = 0
    tableItems.value = []
    while (true) {
      const cursor = await db.transaction(stores.ITEMS.name).store.openCursor()
      if (!cursor) {
        break
      }
      if (count > 0) {
        await cursor.advance(count)
      }
      count++
      const item = cursor.value
      if (!item) {
        break
      }
      const brickLinkItems = await getAllFromIndex<BrickLinkItem>(db, indices.BRICK_LINK_ITEMS_BY_ITEM_ID, item.id)
      if (brickLinkItems?.length === 0) {
        continue
      }
      item.brickLinkItems = brickLinkItems
      item.name = brickLinkItems?.map((bi: BrickLinkItem) => bi.Name + ' (' + bi.id + ')').join(', ')
      item.itemType = brickLinkItems?.map((bi: BrickLinkItem) => bi.itemType).join(', ')
      item.category = brickLinkItems?.map((bi: BrickLinkItem) => bi['Category Name']).join(', ')
      item.image = brickLinkItems?.find((bi: BrickLinkItem) => bi.image)?.image
      item.score = Math.random()
      const index = findIndex(items, item)
      items.splice(index, 0, item)
      console.log('Processed items:', count)
      if (count % 1000 === 0) {
        console.log('Processed items:', count)
      }
      if (index < 1000) {
        tableRef.value?.addRow(item, index)
      }
    }
  }
}

const clickCategoryItemsFn = async (category: Category) => {
  if (!category.id) {
    return
  }
  selectedItemType.value = itemTypes.value.find(t => t.id === 'items')
  filters.value.push({
    key: 'category',
    label: 'Category',
    value: category.id,
    displayValue: category.name,
  })
  search.value = undefined
  const db = await getDbConnection()
  setItems(db)
  setCounts()
}

export const itemTypes = ref<SelectOption<any>[]>([
  {
    id: 'categories',
    label: 'Categories',
    description: 'A category of items.',
    count: 0,
    columns: [
      // {
      //   id: 'image',
      //   width: '100px',
      //   type: 'image',
      //   hideLabel: true,
      // },
      {
        id: 'type',
        label: 'Type',
        valueField: 'type',
        width: '60px',
        clickKey: 'catType',
        clickValue: (category: BrickLinkCategory) => category.catType,
      },
      {
        id: 'items',
        label: 'Items',
        width: '60px',
        type: 'number',
        clickFn: clickCategoryItemsFn,
      },
      {
        id: 'name',
        label: 'Name',
        itemValue: (category: Category) => {
          return category.name + ' (' + category.id + ')'
        },
        width: '300px',
        clickValue: (category: Category) => {
          return {
            key: 'category',
            label: 'Category',
            value: category.id,
            displayValue: category.name,
          }
        },
      },
    ],
  },
  {
    id: 'colors',
    label: 'Colors',
    count: 0,
    idField: 'colorID',
    columns: [
      {
        id: 'image',
        width: '100px',
        type: 'image',
        hideLabel: true,
      },
      {
        id: 'name',
        label: 'Name',
        width: '150px',
        clickFn: (color: BrickLinkColor) => {
          // selectedItem.value = undefined
          // filters.value = []
          // filters.value.push({
          //   key: 'color',
          //   value: color.colorID,
          // })
          // search.value = undefined
        },
      },
      {
        id: 'countItems',
        label: 'Items',
        type: 'number',
        clickFn: (color: BrickLinkColor) => {
          selectedItem.value = undefined
          filters.value.push({
            key: 'color',
            value: color.colorID,
          })
          search.value = undefined
        },
      },
      {
        id: 'countParts',
        label: 'Parts',
        type: 'number',
        clickFn: (color: BrickLinkColor) => {
          selectedItem.value = 'items'
          filters.value.push(
            {
              key: 'color',
              value: color.colorID,
            },
            {
              key: 'itemType',
              value: 'P',
            },
          )
          search.value = undefined
        },
      },
      {
        id: 'countSets',
        label: 'Sets',
        type: 'number',
        clickFn: (color: BrickLinkColor) => {
          selectedItem.value = 'items'
          filters.value.push(
            {
              key: 'color',
              value: color.colorID,
            },
            {
              key: 'itemType',
              value: 'S',
            },
          )
          search.value = undefined
        },
      },
      {
        id: 'countWanted',
        label: 'Wanted',
        type: 'number',
      },
      {
        id: 'countForSale',
        label: 'For sale',
        type: 'number',
      },
      {
        id: 'yearFrom',
        label: 'Year from',
      },
      {
        id: 'yearTo',
        label: 'Year to',
      },
    ],
  },
  {
    id: 'itemTypes',
    label: 'Item types',
    count: 0,
    columns: [
      {
        id: 'name',
        label: 'Name',
        width: '105px',
        clickFn: (type: ItemType) => {
          selectedItem.value = undefined
          filters.value.push({
            key: 'itemType',
            value: type.catType,
          })
          search.value = undefined
        },
      },
      {
        id: 'countItems',
        label: 'Items',
        width: '100px',
        type: 'number',
        clickFn: (type: ItemType) => {
          selectedItemType.value = 'items'
          filters.value.push({
            key: 'itemType',
            value: type.catType,
          })
          search.value = undefined
        },
      },
      {
        id: 'categories',
        label: 'Categories',
        width: '105px',
        type: 'number',
        clickFn: (type) => {
          selectedItem.value = 'categories'
          filters.value.push({
            key: 'itemType',
            value: type.catType,
          })
          search.value = undefined
        },
      },
    ],
  },
  {
    id: 'items',
    idField: 'id',
    label: 'Items',
    count: 0,
    columns: [
      {
        id: 'image',
        width: '180px',
        height: '100px',
        type: 'image',
        hideLabel: true,
        clickKey: 'item',
        clickValue: (item: Item) => item.id,
        clickSelection: 'images',
      },
      {
        id: 'itemType',
        label: 'Type',
        width: '60px',
        clickKey: 'itemType',
        clickValue: (item: Item) => item.itemType,
      },
      {
        id: 'name',
        label: 'Name',
        width: '300px',
        clickKey: 'item',
        clickValue: (item: Item) => item.id,
      },
      {
        id: 'category',
        label: 'Category',
        width: '200px',
        clickKey: 'category',
        clickValue: (item: BrickLinkItem) => item['Category ID'],
      },
      {
        id: 'Year Released',
        label: 'Year',
        width: '70px',
      },
      {
        id: 'weight',
        label: 'Weight',
        width: '75px',
        itemValue: (item: BrickLinkItem) =>
          formatInteger(Number.parseFloat(item.weight) * 100, [
            {
              start: 0,
              end: 100,
              suffix: 'cg',
            },
            {
              start: 100,
              end: 10000,
              modifier: 0.01,
              decimalPlaces: 1,
              suffix: 'g',
            },
            {
              start: 10000,
              end: 100000,
              modifier: 0.01,
              decimalPlaces: 0,
              suffix: 'g',
            },
            {
              start: 100000,
              modifier: 0.00001,
              decimalPlaces: 1,
              suffix: 'kg',
            },
          ]),
      },
      {
        id: 'dimensions',
        label: 'Dimensions',
        width: '115px',
        valueField: 'Dimensions',
      },
    ],
  },
  {
    id: 'partAndColorCodes',
    label: 'Part and color codes',
    count: 0
  }
])
