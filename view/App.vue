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
import { onMounted } from 'vue'
import TheHeader from './components/TheHeader.vue'
import TheContent from './components/TheContent.vue'
import PulseMonitor from './components/PulseMonitor.vue'
import { initBrickLinkWorker } from './assets/js/init-brick-link-worker'
import { initStorageUsageFunction } from './assets/js/init-storage-usage-function'
import { fetchBrickLink, updateCatalogTree } from '../sources/bricklink'
import { itemTypes, setCounts } from '../model'
onMounted(async () => {
  initStorageUsageFunction()
  initBrickLinkWorker()
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
