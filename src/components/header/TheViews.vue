<script setup lang="ts">
import { ref } from 'vue'
defineProps<{
  msg: string
}>()
const itemTypes = ref([
  {
    id: 'items',
    label: 'Items',
  },
  {
    id: 'itemTypes',
    label: 'Item types',
  },
  {
    id: 'colors',
    label: 'Colors',
  },
])
</script>

<template>
  <div v-for="itemType in itemTypes" :key="itemType.id">
    {{ itemType.label }}
  </div>
</template>

<style scoped></style>
