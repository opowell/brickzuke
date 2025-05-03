<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useModelsStore } from '../../stores/models.ts'
const modelsStore = useModelsStore()
const { filters } = storeToRefs(modelsStore)
</script>

<template>
  <div class="filters">
    <button v-for="filter in filters" :key="filter.key + '#' + filter.value">
      {{ filter.key }}: {{ filter.value }}
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 0.3rem;
}
</style>
