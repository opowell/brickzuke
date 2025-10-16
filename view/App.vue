<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheContent from './components/TheContent.vue'
import PulseMonitor from './components/PulseMonitor.vue'
import { initBrickLinkWorker } from './assets/js/init-brick-link-worker'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { useCatalogDownloadPageStore } from './stores/bricklink/catalog-download-page'
import { BRICK_LINK_CATALOG } from './stores/bricklink/catalog-codes'
import type { SelectOption } from './components/header/TheViews.vue'
import { count } from '../idb/db'
import { getDbConnection } from '../idb/idb'
import stores from '../idb/stores'
import { formatInteger } from './assets/js/utils'
onMounted(async () => {
  initStorageUsageFunction()
  initBrickLinkWorker()
})
async function fetchBrickLink() {
  const catalogDownloadPage = useCatalogDownloadPageStore()
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.ITEM_TYPES)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.CATEGORIES)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.COLORS)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.PART_AND_COLOR_CODES)
}
async function search() {
  const db = await getDbConnection()
  itemTypes.value[0].count = await count(db, stores.BRICK_LINK_CATEGORIES)
  itemTypes.value[1].count = await count(db, stores.BRICK_LINK_COLORS)
  itemTypes.value[2].count = await count(db, stores.BRICK_LINK_ITEM_TYPES)
  itemTypes.value[3].count = await count(db, stores.BRICK_LINK_ITEMS)
  itemTypes.value[4].count = await count(db, stores.BRICK_LINK_PART_AND_COLOR_CODES)
}

const itemTypes = ref<SelectOption<any>[]>([
  {
    id: 'categories',
    label: 'Categories',
    count: 0
  },
  {
    id: 'colors',
    label: 'Colors',
    count: 0
  },
  {
    id: 'itemTypes',
    label: 'Item types',
    count: 0
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
<template>
  <TheHeader :item-types="itemTypes" />
  <button @click="fetchBrickLink">BrickLink</button>
  <button @click="search">Search</button>
  <TheContent :item-types="itemTypes" />
  <PulseMonitor />
</template>

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
