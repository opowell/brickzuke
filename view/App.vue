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
const colorsPage = useColorsPageStore()
const storesPage = useStoresPageStore()
onMounted(async () => {
  initStorageUsageFunction()
  // initBrickLinkWorker()
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
  document.dispatchEvent(
    new CustomEvent('bzClientToServer', {
      // detail: {
      //   url: 'https://www.bricklink.com/browse.asp',
      //   options: {},
      //   type: 'text'
      // },
      detail: {
        url: 'https://www.bricklink.com/catalogDownload.asp?a=a',
        options: {
          "headers": {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "max-age=0",
            "content-type": "application/x-www-form-urlencoded",
            "priority": "u=0, i",
            "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1"
          },
          "referrer": "https://www.bricklink.com/catalogDownload.asp",
          "body": "viewType=0&itemType=S&selYear=Y&selWeight=Y&selDim=Y&itemTypeInv=S&itemNo=&downloadType=T",
          "method": "POST",
          "mode": "cors",
          "credentials": "include"
        },
        type: 'text'
      },
    }),
  )
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
