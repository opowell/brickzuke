<script setup lang="ts">
import TheViews from './header/TheViews.vue'
import TheFilters from './header/TheFilters.vue'
import TheSorts from './header/TheSorts.vue'
import { ref } from 'vue'
import { selectedItemType, itemTypes, updateView } from '../../model'
import { search } from '../../model'

const localSearch = ref(search.value)
function doSearch() {
  search.value = localSearch.value
  updateView()
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
  display: flex;
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
