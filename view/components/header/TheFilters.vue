<script setup lang="ts">
import { filters } from '../../../model.ts'
function removeFilter(index: number) {
  console.log(filters.value, index)
  filters.value.splice(index, 1)
}
</script>

<template>
  <div class="filters">
    <button v-for="(filter, index) in filters" :key="filter.key + '#' + filter.value"
      v-html="filter.label + ': ' + filter.displayValue" @click="removeFilter(index)" />
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 0.3rem;
}

button:hover {
  opacity: 0.5;
  text-decoration: line-through;
}
</style>
