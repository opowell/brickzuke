import { computed, ref } from 'vue'
import { type BrickLinkCategory, type BrickLinkColor, type BrickLinkItem, type BrickLinkItemType, type Category, type Color, type Item, type ItemType, type UiItem } from './view/stores/bricklink/catalog-download-page'
import type { SelectOption } from './view/components/header/TheViews.vue'
import { count, getAll, getAllFromIndex } from './idb/db'
import { getDbConnection } from './idb/idb'
import stores from './idb/stores'
import { formatInteger } from '@/assets/js/utils'
import { type IDBPDatabase } from 'idb'
import indices from './idb/indices'
import { sum } from './idb/utils'
import { loadCategory } from './idb/category'
import router from '@/router'
import ItemCounterWorker from './workers/itemCounter?worker'
import ColorCounterWorker from './workers/colorCounter?worker'
interface Filter {
  key: string
  label?: string
  value: string | number
  displayValue?: string | number
}

export const selectedItemType = ref()
export const filters = ref<Filter[]>([])
export const processingCounts = ref(false)
export const search = ref<string | undefined>(undefined)
export const hasSearch = computed(() => {
  if (!search.value) {
    return false
  }
  return search.value.length > 0
})
export async function setCounts() {
  processingCounts.value = true
  const db = await getDbConnection()
  itemTypes.value[2].count = await count(db, stores.ITEM_TYPES)
  itemTypes.value[4].count = await count(db, stores.PART_AND_COLOR_CODES)
  db.close()
  processingCounts.value = false
  getItemsCount()
  getColorsCount()
  // itemTypes.value[0].previewItems = await getPreviewItems<Category>(db, stores.CATEGORIES, 10)
  // itemTypes.value[1].previewItems = await getPreviewItems<Color>(db, stores.COLORS, 10)
  // itemTypes.value[2].previewItems = await getPreviewItems<ItemType>(db, stores.ITEM_TYPES, 10)
  // itemTypes.value[3].previewItems = await getPreviewItems<Item>(db, stores.ITEMS, 10)
  // itemTypes.value[4].previewItems = await getPreviewItems<PartAndColorCode>(db, stores.PART_AND_COLOR_CODES, 10)
}

async function getPreviewItems(db: IDBPDatabase, storeName: string, limit: number): Promise<any[]> {
  const items = await db.transaction(storeName).store.getAll(undefined, limit);
  processingCounts.value = false;
  return items || [];
}

export const pauseRedirect = ref(false)
export const selectedItemTypeId = ref<string | undefined>(undefined)

async function getColorsCount() {
  const filteredColors: number[] = filters.value.filter(f => f.key === 'color').map(f => Number(f.value))
  if (filteredColors.length === 0 && !hasSearch.value) {
    const db = await getDbConnection()
    itemTypes.value[1].count = await count(db, stores.COLORS)
    db.close()
    return
  }

  const searchLowercase = search.value?.toLowerCase()
  const worker = new ColorCounterWorker();

  worker.onmessage = (e) => {
    if (e.data.type === 'progress') {
      itemTypes.value[1].count = e.data.count;
    } else if (e.data.type === 'complete') {
      itemTypes.value[1].count = e.data.count;
      worker.terminate();
    }
  };

  worker.postMessage({
    stores,
    indices,
    searchLowercase
  });
}

async function getItemsCount() {
  const filteredCategories: number[] = filters.value.filter(f => f.key === 'category').map(f => Number(f.value))
  // No filters or search
  if (filteredCategories.length === 0 && !hasSearch.value) {
    const db = await getDbConnection()
    itemTypes.value[3].count = await count(db, stores.ITEMS)
    db.close()
    return
  }
  let numItems = 0
  const searchLowercase = search.value?.toLowerCase()
  // Filters and maybe search
  if (filteredCategories.length > 0) {
    const db = await getDbConnection()
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
            const brickLinkItem = cursor.value
            if (!brickLinkItem) {
              break
            }
            if (hasSearch.value) {
              if (brickLinkItem.name.includes(search.value!.toLowerCase())) {
                continue
              }
            }
            count++
            numItems++
          }
        }
        console.log('Loaded category:', categoryId)
      } catch (e) {
        console.error('Error loading category ID:', categoryId, e)
      }
    }
    itemTypes.value[3].count = numItems
    db.close()
  }
  // Only search
  else {
    console.log('Counting items with search only:', searchLowercase)
    const worker = new ItemCounterWorker();

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        itemTypes.value[3].count = e.data.count;
        itemTypes.value[0].count = e.data.numCategories;
      } else if (e.data.type === 'complete') {
        itemTypes.value[3].count = e.data.count;
        itemTypes.value[0].count = e.data.numCategories;
        worker.terminate();
      }
    };

    worker.postMessage({
      stores,
      indices,
      searchLowercase
    });
  }
}

export function findIndex<T extends { score: number }>(array: T[], itemToAdd: T): number {
  let low = 0,
    high = array.length;

  while (low < high) {
    const mid = low + high >>> 1
    if (array[mid].score > itemToAdd.score) low = mid + 1
    else high = mid
  }
  return low
}

export const tableItems = ref<any[]>([])
export const tableRef = ref<InstanceType<typeof TableComponent> | null>(null)

function processItem(brickLinkItems: BrickLinkItem[], items: UiItem[]) {
  console.log('Processing items:', brickLinkItems.map(bl => bl.id))
  const item: UiItem = {
    id: brickLinkItems[0].itemId,
    score: Math.random(),
    brickLinkItems,
    name: brickLinkItems?.map((bi: BrickLinkItem) => bi.Name + ' (' + bi.id + ')').join(', '),
    itemTypeId: brickLinkItems?.map((bi: BrickLinkItem) => bi.itemType).join(', '),
    itemTypeName: 'todo',
    category: brickLinkItems?.map((bi: BrickLinkItem) => bi['Category Name']).join(', '),
    image: brickLinkItems?.find((bi: BrickLinkItem) => bi.image)?.image
  }
  console.log('check search', search.value, item.name)
  if (search.value) {
    const searchLower = search.value.toLowerCase()
    if (!item.name?.toLowerCase().includes(searchLower)) {
      console.log('Skipping item due to search filter:', item.name)
      return
    }
  }
  const index = findIndex(items, item)
  items.splice(index, 0, item)
  if (index < 200) {
    tableRef.value?.addRow(item, index)
  }
}

export async function setItems(db: IDBPDatabase) {
  const filteredCategories: number[] = filters.value.filter(f => f.key === 'category').map(f => Number(f.value))
  console.log('Setting items with filters:', filters.value, filteredCategories.length)
  if (filteredCategories.length > 0) {
    const items: UiItem[] = []
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
            processItem(brickLinkItem, items)
          }
        }
        console.log('Loaded category:', categoryId)
      } catch (e) {
        console.error('Error loading category ID:', categoryId, e)
      }
    }
  } else {
    const items: UiItem[] = []
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
      if (!brickLinkItems || brickLinkItems?.length === 0) {
        continue
      }
      processItem(brickLinkItems, items)
    }
  }
}

async function setCategories(db: IDBPDatabase) {
  const currentSearch = search.value
  console.log('setCategories')
  const categories = await getAll<Category>(db, stores.CATEGORIES)
  if (!categories) {
    return
  }
  tableItems.value = []
  const searchLower = search.value?.toLowerCase() || ''
  for (let i = 0; i < categories.length; i++) {
    if (selectedItemType.value?.id !== 'categories') {
      break
    }
    if (currentSearch !== search.value) {
      console.log('search changed, aborting setCategories')
      break
    }
    const category = await loadCategory(db, categories[i].id!)
    if (searchLower?.length && !category.name?.toLowerCase().includes(searchLower)) {
      continue
    }
    const index = findIndex(tableItems.value, category)
    tableItems.value.splice(index, 0, category)
  }
}
async function setColors(db: IDBPDatabase) {
  const colors = await getAll<Color>(db, stores.COLORS)
  if (!colors) {
    return
  }
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i]
    color.brickLinkColors = await getAllFromIndex<BrickLinkColor>(db, indices.BRICK_LINK_COLORS_BY_COLOR_ID, color.id)
    color.countItems = sum<BrickLinkColor>(color.brickLinkColors, c => Number.parseInt(c.Parts))
    color.image = color.brickLinkColors?.find((c: BrickLinkColor) => c.image)?.image
  }
  tableItems.value = colors
}
async function setItemTypes(db: IDBPDatabase) {
  const itemTypesData = await getAll<ItemType>(db, stores.ITEM_TYPES)
  if (!itemTypesData) {
    return
  }
  for (let i = 0; i < itemTypesData.length; i++) {
    const itemType = itemTypesData[i]
    itemType.brickLinkItemTypes = await getAllFromIndex<BrickLinkItemType>(db, indices.BRICK_LINK_ITEM_TYPES_BY_ITEM_TYPE_ID, itemType.id)
    itemType.countItems = sum<BrickLinkItemType>(itemType.brickLinkItemTypes, it => Number.parseInt(it.Items))
  }
  tableItems.value = itemTypesData
}

export const setSelectedItem = async function (option: SelectOption<any>) {
  console.log('setSelectedItem', option)
  selectedItemType.value = option
  updateView()
}

export const updateView = async () => {
  const db = await getDbConnection()
  switch (selectedItemType.value?.id) {
    case 'categories':
      await setCategories(db)
      break
    case 'colors':
      await setColors(db)
      break
    case 'itemTypes':
      await setItemTypes(db)
      break
    case 'items':
      // await setItems(db)
      break
  }
  db.close()
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
  updateWindowUrl()
  const db = await getDbConnection()
  setItems(db)
  db.close()
  setCounts()
}

const currentQueryString = computed(() => {
  const parts = []
  if (selectedItemType.value) {
    parts.push('v=' + selectedItemType.value.id)
  }
  if (search.value) {
    parts.push('s=' + search.value)
  }
  if (filters.value.length > 0) {
    parts.push('f=' + filters.value.map((filter) => filter.key + '_' + filter.value).join(','))
  }
  // if (sorts.value.length > 0) {
  //   parts.push('b=' + sorts.value.map((sort) => sort.key + '_' + sort.dir).join(','))
  // }
  if (parts.length === 0) {
    return '/'
  }
  return '/?' + parts.join('&')
})

export function updateWindowUrl() {
  router.push(currentQueryString.value)
}

export const itemTypes = ref<SelectOption<any>[]>([
  {
    id: 'categories',
    label: 'Categories',
    description: 'A category of items.',
    count: 0,
    preview: 'name',
    // previewClickFn: clickCategoryFn,
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
            value: category.id!,
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
        clickValue: (item: Item) => {
          return {
            key: 'itemType',
            label: 'Item type',
            value: item.itemTypeId!,
            displayValue: item.itemTypeName,
          }
        },
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
