<script setup lang="ts">
import { useModelsStore } from '@/stores/models'
import { computed } from 'vue'
import TableCell from './TableCell.vue'
export interface TableColumn<T> {
  width?: string
  id: string
  label?: string
  valueField?: string
  type?: string
  itemValue?: (item: T) => string | number | undefined
  clickFn?: (item: T) => void
  clickKey?: string | ((item: T) => string)
  clickValue?: (item: T) => string
}
export interface Table<T> {
  id: string
  label: string
  columns?: TableColumn<T>[]
  description?: string
  idField?: string
  hidePriceModifier?: boolean
  hideSelect?: boolean
  preview?: string | ((item: T) => string)
  previewClickFn?: (item: T) => void
  count?: number
}
const modelsStore = useModelsStore()
const { items, table } = defineProps<{
  table: Table
  items: any[]
}>()
const tableItems = computed(() => {
  if (!items) {
    return []
  }
  return items.slice(0, 1000)
})
function sortBy(column: TableColumn) {
  modelsStore.addSort(column.id, 'a')
}
</script>

<template>
  <div class="table">
    <div v-if="table.description" class="description">{{ table.description }}</div>
    <div class="row">
      <div v-if="!table.hideSelect"><input type="checkbox" /></div>
      <div v-for="column in table.columns" :key="column.id" :style="{ width: column.width || '100px' }">
        <button v-if="column.label" @click="sortBy(column)">{{ column.label }}</button>
      </div>
      <div v-if="!table.hidePriceModifier">Price mod.</div>
    </div>
    <div v-for="item in tableItems" :key="item[table.idField]" class="row">
      <div v-if="!table.hideSelect"><input type="checkbox" /></div>
      <TableCell v-for="column in table.columns" :key="column.id" :column="column" :item="item" />
      <div v-if="!table.hidePriceModifier"><input style="width: 75px" /></div>
    </div>
  </div>
</template>

<style scoped>
.description {
  margin-bottom: 1rem;
}

.table {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.row {
  display: flex;
  gap: 0.5rem;
  word-break: break-word;
}

.row>* {
  flex: 0 0 auto;
}
</style>
