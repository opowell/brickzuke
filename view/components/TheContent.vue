<script setup lang="ts">
import TableComponent from './TableComponent.vue'
import { useModelsStore } from '../stores/models.ts'
import { storeToRefs } from 'pinia'
const modelsStore = useModelsStore()
const { itemTypes, selectedItemType } = storeToRefs(modelsStore)
const setSelectedItem = modelsStore.setSelectedItem
import { getTableLabel } from '@/assets/js/getTableLabel.ts'
</script>

<template>
  <section>
    <TableComponent v-if="selectedItemType" :table="selectedItemType" />
    <div v-else class="buttons">
      <div v-for="table in itemTypes" :key="table.id">
        <button @click="setSelectedItem(table)">{{ getTableLabel(table) }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
