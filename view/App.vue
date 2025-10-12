<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheContent from './components/TheContent.vue'
import PulseMonitor from './components/PulseMonitor.vue'
import { initBrickLinkWorker } from './assets/js/init-brick-link-worker'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { fetchAll as catalogListFetchAll } from '~/stores/bricklink/catalog-list-page'
import { processQueue } from '@/assets/js/make-call'
import { useColorsPageStore } from './stores/bricklink/colors-page'
import { useStoresPageStore } from './stores/bricklink/stores-page'
import { useModelsStore } from './stores/models'
import { storeToRefs } from 'pinia'
import { useCatalogDownloadPageStore } from './stores/bricklink/catalog-download-page'
const colorsPage = useColorsPageStore()
const storesPage = useStoresPageStore()
onMounted(async () => {
  initStorageUsageFunction()
  initBrickLinkWorker()
  // await catalogListFetchAll()
  // await colorsPage.fetchColorsPage()
  // await storesPage.fetchStoresPage()
  // await processQueue(3)
})
const modelsStore = useModelsStore()
const modelsStoreRefs = storeToRefs(modelsStore)
const countryFilters = computed(() => {
  return modelsStoreRefs.filters.value.filter((f) => f.key === 'country')
})
watch(
  countryFilters,
  async () => {
    for (let i = 0; i < countryFilters.value.length; i++) {
      await storesPage.fetchStoresInCountryPage(countryFilters.value[i].value)
    }
    processQueue(Math.max(3, countryFilters.value.length))
  },
  {
    immediate: true,
  },
)
function fetchBrickLink() {
  console.log('bl')
  const catalogDownloadPage = useCatalogDownloadPageStore()
  // catalogDownloadPage.fetchViewType(0)
  catalogDownloadPage.fetchViewType(1)
  // catalogDownloadPage.fetchViewType(2)
  catalogDownloadPage.fetchViewType(3)
}
</script>
<template>
  <TheHeader />
  <button @click="fetchBrickLink">BrickLink</button>
  <TheContent />
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
