<script setup lang="ts">
import TableComponent from './TableComponent.vue'
import { useModelsStore } from '../stores/models.ts'
import { storeToRefs } from 'pinia'
const modelsStore = useModelsStore()
const { itemTypes, selectedItemType } = storeToRefs(modelsStore)
const setSelectedItem = modelsStore.setSelectedItem
</script>

<template>
  <section>
    <TableComponent v-if="selectedItemType" :table="selectedItemType" />
    <div v-else>
      <div v-for="table in itemTypes" :key="table.id">
        <button @click="setSelectedItem(table)">{{ table.label }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
