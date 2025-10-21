import { ref } from 'vue'
import { type BrickLinkCategory, type BrickLinkColor, type Category, type Item } from './view/stores/bricklink/catalog-download-page'
import type { SelectOption } from './view/components/header/TheViews.vue'
import { count } from './idb/db'
import { getDbConnection } from './idb/idb'
import stores from './idb/stores'
import { formatInteger } from '@/assets/js/utils'

export const selectedItemType = ref()
export const filters = ref<{ key: string; value: string | number }[]>([])
const search = ref<string | undefined>(undefined)
export async function setCounts() {
  const db = await getDbConnection()
  itemTypes.value[0].count = await count(db, stores.BRICK_LINK_CATEGORIES)
  itemTypes.value[1].count = await count(db, stores.BRICK_LINK_COLORS)
  itemTypes.value[2].count = await count(db, stores.BRICK_LINK_ITEM_TYPES)
  itemTypes.value[3].count = await count(db, stores.BRICK_LINK_ITEMS)
  itemTypes.value[4].count = await count(db, stores.BRICK_LINK_PART_AND_COLOR_CODES)
}

const clickCategoryFn = (category: Category) => {
  selectedItemType.value = undefined
  filters.value.push({
    key: 'category',
    value: category.id,
  })
  search.value = undefined
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
