<template>
  <TheHeader />
  <div v-if="!selectedItemType">
    <button @click="fetchBrickLink">Update BrickLink</button>
    <button @click="updateCatalogTree">Update BrickLink Categories</button>
    <button @click="fetchBrickLinkColorGuide">Update BrickLink Color Guide</button>
    <button @click="fetchCatalogPage">Update BrickLink Item Types</button>
  </div>
  <TheContent />
  <PulseMonitor />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheContent from './components/TheContent.vue'
import PulseMonitor from './components/PulseMonitor.vue'
import { initBrickLinkWorker } from './assets/js/init-brick-link-worker'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { fetchCatalogPage, fetchBrickLink, updateCatalogTree } from '../sources/bricklink'
import { makeCall as fetchBrickLinkColorGuide } from '../sources/bricklink/color-guide'
import { filters, itemTypes, pauseRedirect, search, selectedItemType, selectedItemTypeId, setCounts, updateView } from '../model'
import { useRoute, useRouter } from 'vue-router'
import { getDbConnection } from '../idb/idb'
import { loadCategory } from '../idb/category'
const router = useRouter()
const route = useRoute()

const filterDisplayLabelMap = {
  category: 'Category',
  color: 'Color',
  itemType: 'Item type',
  item: 'Item',
}

async function getFilterDisplayValue(key: string, value: string): Promise<string | undefined> {
  const db = await getDbConnection()
  switch (key) {
    case 'category':
    {
      const category = await loadCategory(db, Number.parseInt(value))
      return category.name || value
    }
  }
  db.close()
}

async function processUrl() {
  console.log('processUrl', route, route?.query)
  if (!route?.query) {
    return
  }
  pauseRedirect.value = true
  const queryView = route.query.v?.toString()
  if (queryView) {
    const type = itemTypes.value.find(t => t.id === queryView)
    if (type) {
      selectedItemType.value = type
    }
  }
  search.value = route.query.s?.toString()
  selectedItemTypeId.value = route.query.v?.toString()
  const filtersString = route.query.f?.toString()
  filters.value = []
  if (filtersString) {
    const filterStrings = filtersString.split(',')
    for (let i = 0; i < filterStrings.length; i++) {
      const fs = filterStrings[i]
      const parts = fs.split('_')
      filters.value.push({
        key: parts[0],
        value: parts[1],
        label: filterDisplayLabelMap[parts[0] as keyof typeof filterDisplayLabelMap] || parts[0],
        displayValue: await getFilterDisplayValue(parts[0], parts[1]),
      })
    }
  }
  // const sortsString = route.query.b?.toString()
  // if (sortsString) {
  //   sorts.value = sortsString.split(',').map((bs) => {
  //     const parts = bs.split('_')
  //     return {
  //       key: parts[0],
  //       dir: parts[1],
  //     }
  //   })
  // } else {
  //   sorts.value = []
  // }
  pauseRedirect.value = false
  updateView()
}

onMounted(async () => {
  initStorageUsageFunction()
  // initBrickLinkWorker()
  await router.isReady()
  await processUrl()
  setCounts()
})
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
