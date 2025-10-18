<template>
  <TheHeader :item-types="itemTypes" />
  <div>
    <button @click="fetchBrickLink">Update BrickLink</button>
    <button @click="updateCatalogTree">Update BrickLink Categories</button>
  </div>
  <TheContent :item-types="itemTypes" />
  <PulseMonitor />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheContent from './components/TheContent.vue'
import PulseMonitor from './components/PulseMonitor.vue'
import { initBrickLinkWorker } from './assets/js/init-brick-link-worker'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { useCatalogDownloadPageStore, type BrickLinkColor, type Category } from './stores/bricklink/catalog-download-page'
import { BRICK_LINK_CATALOG } from './stores/bricklink/catalog-codes'
import type { SelectOption } from './components/header/TheViews.vue'
import { count } from '../idb/db'
import { getDbConnection } from '../idb/idb'
import stores from '../idb/stores'
onMounted(async () => {
  initStorageUsageFunction()
  initBrickLinkWorker()
  search()
})

async function fetchBrickLink() {
  const catalogDownloadPage = useCatalogDownloadPageStore()
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.ITEM_TYPES)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.CATEGORIES)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.COLORS)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.PART_AND_COLOR_CODES)
}
function updateCatalogTree() {
  const catalogDownloadPage = useCatalogDownloadPageStore()
  catalogDownloadPage.updateCatalogTree()
}

async function search() {
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

const itemTypes = ref<SelectOption<any>[]>([
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
      // {
      //   id: 'type',
      //   label: 'Type',
      //   valueField: 'catType',
      //   width: '60px',
      //   clickKey: 'catType',
      //   clickValue: (category: BrickLinkCategory) => category.catType,
      // },
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
          console.log(category.name, category.id, category)
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
        id: 'yearStart',
        label: 'Year start',
      },
      {
        id: 'yearEnd',
        label: 'Year end',
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
</script>

<style>
* {
  font-size: 18px;
  font-family: Arial, Helvetica, sans-serif;
  line-height: 18px;
}

#app {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
