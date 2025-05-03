<script setup lang="ts">
import TheViews from './header/TheViews.vue'
import { storeToRefs } from 'pinia'
import { useModelsStore } from '../stores/models.ts'
const modelsStore = useModelsStore()
const { search, selectedItem } = storeToRefs(modelsStore)
</script>

<template>
  <header>
    <a href="/" class="home-link"><img class="home-icon" src="/favicon-32x32.png" /></a>
    <TheViews v-if="selectedItem" />
    <input v-model="search" placeholder="Search..." />
    <nav>NAV</nav>
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
