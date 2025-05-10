<script setup lang="ts">
import { onMounted } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheContent from './components/TheContent.vue'
import PulseMonitor from './components/PulseMonitor.vue'
import { initBrickLinkWorker } from './assets/js/init-brick-link-worker'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { fetchAll as catalogListFetchAll } from '~/stores/bricklink/catalog-list-page'
import { processQueue } from '@/assets/js/make-call'
import { useColorsPageStore } from './stores/bricklink/colors-page'
import { useStoresPageStore } from './stores/bricklink/stores-page'
const colorsPage = useColorsPageStore()
const storesPage = useStoresPageStore()
onMounted(async () => {
  initStorageUsageFunction()
  initBrickLinkWorker()
  await catalogListFetchAll()
  await colorsPage.fetchColorsPage()
  await storesPage.fetchStoresPage()
  await processQueue(3)
})
</script>
<template>
  <TheHeader />
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
