<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useModelsStore } from '../../stores/models.ts'
const modelsStore = useModelsStore()
const { itemTypes, selectedItem } = storeToRefs(modelsStore)
</script>

<template>
  <select v-model="selectedItem">
    <option v-for="itemType in itemTypes" :key="itemType.id" :value="itemType.id">
      {{ itemType.label }}
    </option>
  </select>
</template>

<style scoped></style>
