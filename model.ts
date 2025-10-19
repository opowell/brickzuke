import { ref } from 'vue'
import { type BrickLinkColor, type Category } from './view/stores/bricklink/catalog-download-page'
import type { SelectOption } from './view/components/header/TheViews.vue'
import { count } from './idb/db'
import { getDbConnection } from './idb/idb'
import stores from './idb/stores'

export const selectedItemType = ref()

export async function setCounts() {
  const db = await getDbConnection()
  itemTypes.value[0].count = await count(db, stores.BRICK_LINK_CATEGORIES)
  itemTypes.value[1].count = await count(db, stores.BRICK_LINK_COLORS)
  itemTypes.value[2].count = await count(db, stores.BRICK_LINK_ITEM_TYPES)
  itemTypes.value[3].count = await count(db, stores.BRICK_LINK_ITEMS)
  itemTypes.value[4].count = await count(db, stores.BRICK_LINK_PART_AND_COLOR_CODES)
}

const clickCategoryFn = (category: BrickLinkCategory) => {
  // selectedItem.value = 'items'
  // filters.value.push({
  //   key: 'category',
  //   value: category.catID,
  // })
  // search.value = undefined
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
        clickFn: clickCategoryFn,
      },
      {
        id: 'name',
        label: 'Name',
        itemValue: (category: Category) => {
          return category.name + ' (' + category.id + ')'
        },
        width: '300px',
        clickKey: 'category',
        clickValue: (category: Category) => category.id,
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
        id: 'count',
        label: 'Items',
        width: '100px',
        type: 'number',
        clickFn: (type: ItemType) => {
          selectedItem.value = 'items'
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
    label: 'Items',
    count: 0
  },
  {
    id: 'partAndColorCodes',
    label: 'Part and color codes',
    count: 0
  }
])
