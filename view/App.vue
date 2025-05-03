<script setup lang="ts">
import { onMounted } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheContent from './components/TheContent.vue'
import { initBrickLinkWorker } from './assets/js/init-brick-link-worker'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { useCatalogListPageStore } from '~/stores/bricklink/catalog-list-page'
import { processQueue } from '@/assets/js/make-call'
onMounted(async () => {
  initStorageUsageFunction()
  initBrickLinkWorker()
  const catalogListPage = useCatalogListPageStore()
  await catalogListPage.fetchAll()
  await processQueue()
})
</script>
<template>
  <TheHeader />
  <TheContent />
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
