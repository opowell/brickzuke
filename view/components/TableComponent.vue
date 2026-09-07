<script setup lang="ts">
import { useModelsStore } from '@/stores/models'
import { computed, ref, watch } from 'vue'
import TableCell from './TableCell.vue'
import type { ClickValue, TableRow } from '../../types/table'

export interface TableColumn<T = TableRow> {
  width?: string
  id: string
  label?: string
  valueField?: string
  type?: string
  itemValue?: (item: T) => string | number | undefined
  clickFn?: (item: T) => void
  clickKey?: string | ((item: T) => string)
  clickValue?: (item: T) => ClickValue
  // The table to switch to when the press leads somewhere else.
  clickSelection?: string
  // How many queued calls the press should let through.
  processCount?: number
  hideLabel?: boolean
  height?: string
}
export interface Table<T = TableRow> {
  id: string
  label: string
  items?: T[]
  columns?: TableColumn<T>[]
  description?: string
  idField?: string
  hidePriceModifier?: boolean
  hideSelect?: boolean
  preview?: string | TableColumn<T>
  previewClickFn?: (item: T) => void
  count?: number
}
const modelsStore = useModelsStore()
const {
  items, table 
} = defineProps<{
  table: Table
  items: TableRow[]
}>()
const tableItems = ref(items)
watch(
  () => items,
  (newItems) => {
    tableItems.value = newItems
  },
  {
    deep: true 
  }
)
// Rows are keyed by the field the table names, and by `id` when it names none.
const idField = computed(() => table.idField ?? 'id')
function sortBy(column: TableColumn) {
  modelsStore.addSort(column.id, 'a')
}
function addRow(item: TableRow, index: number) {
  tableItems.value.splice(index, 0, item)
  tableItems.value = tableItems.value.slice(0, 100)
}
defineExpose({
  addRow,
})
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
    <div v-for="item in tableItems" :key="item[idField]" class="row">
      <div v-if="!table.hideSelect"><input type="checkbox" /></div>
      <TableCell v-for="column in table.columns" :key="column.id + '-' + item[idField]" :column="column"
                 :item="item" />
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
