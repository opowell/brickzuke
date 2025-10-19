<script setup lang="ts">
import TheViews from './header/TheViews.vue'
import TheFilters from './header/TheFilters.vue'
import TheSorts from './header/TheSorts.vue'
import { storeToRefs } from 'pinia'
import { useModelsStore } from '../stores/models.ts'
import { ref } from 'vue'
import { selectedItemType, itemTypes } from '../../model'

const modelsStore = useModelsStore()
const { search } = storeToRefs(modelsStore)
const localSearch = ref(search.value)
function doSearch() {
  search.value = localSearch.value
}
</script>

<template>
  <header>
    <a href="/" class="home-link"><img class="home-icon" src="/favicon-32x32.png" /></a>
    <TheFilters />
    <TheSorts />
    <TheViews v-if="selectedItemType" :item-types="itemTypes" />
    <input v-model="localSearch" placeholder="Search..." @keyup.enter="doSearch" />
    <button @click="doSearch">Search</button>
  </header>
</template>

<style scoped>
.home-link {
  align-self: center;
}

.home-icon {
  cursor: pointer;
}

header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: baseline;
}
</style>
