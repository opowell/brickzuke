<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useModelsStore } from '../../stores/models.ts'
import { getTableLabel } from '@/assets/js/getTableLabel.ts'
const modelsStore = useModelsStore()
const { itemTypes, selectedItem } = storeToRefs(modelsStore)
</script>

<template>
  <select v-model="selectedItem">
    <option value="">Everything</option>
    <option v-for="itemType in itemTypes" :key="itemType.id" :value="itemType.id">
      {{ getTableLabel(itemType) }}
    </option>
  </select>
</template>

<style scoped></style>
