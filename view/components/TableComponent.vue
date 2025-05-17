<script setup lang="ts">
import { formatInteger } from '@/assets/js/utils.ts'
import { useModelsStore } from '@/stores/models'
import { computed } from 'vue'
interface TableColumn {
  width?: string
  id: string
  label?: string
  valueField?: string
  type?: string
  itemValue?: (item: any) => string | number | undefined
  clickFn?: (item: any) => void
}
export interface Table {
  id: string
  label: string
  columns?: TableColumn[]
  items?: any[]
  idField?: string
  hidePriceModifier?: boolean
  hideSelect?: boolean
}
const modelsStore = useModelsStore()
const { table } = defineProps<{
  table: Table
}>()
const tableItems = computed(() => {
  if (!table.items) {
    return []
  }
  return table.items.slice(0, 1000)
})
function handleClick(column: TableColumn, item: any) {
  if (!column.clickFn) {
    return
  }
  return column.clickFn(item)
}
function sortBy(column: TableColumn) {
  modelsStore.addSort(column.id, 'a')
}
</script>

<template>
  <div class="table">
    <div class="row">
      <div v-if="!table.hideSelect"><input type="checkbox" /></div>
      <div
        v-for="column in table.columns"
        :key="column.id"
        :style="{ width: column.width || '100px' }"
      >
        <button v-if="column.label" @click="sortBy(column)">{{ column.label }}</button>
      </div>
      <div v-if="!table.hidePriceModifier">Price mod.</div>
    </div>
    <div v-for="item in tableItems" :key="item[table.idField]" class="row">
      <div v-if="!table.hideSelect"><input type="checkbox" /></div>
      <div
        v-for="column in table.columns"
        :key="column.id"
        :style="{ width: column.width || '100px' }"
      >
        <template v-if="column.type === 'image'">
          <img
            :src="item[column.valueField || column.id]"
            :style="{ 'max-width': column.width || '100px' }"
          />
        </template>
        <template v-else>
          <button v-if="column.clickFn" @click="handleClick(column, item)">
            <template v-if="column.type === 'number'">
              {{ formatInteger(item[column.valueField || column.id]) }}
            </template>
            <div v-else-if="column.itemValue" v-html="column.itemValue(item)" />
            <div v-else v-html="item[column.valueField || column.id]" />
          </button>
          <div v-else>
            <template v-if="column.type === 'number'">
              {{ formatInteger(item[column.valueField || column.id]) }}
            </template>
            <div v-else-if="column.itemValue" v-html="column.itemValue(item)" />
            <div v-else v-html="item[column.valueField || column.id]" />
          </div>
        </template>
      </div>
      <div v-if="!table.hidePriceModifier"><input style="width: 75px" /></div>
    </div>
  </div>
</template>

<style scoped>
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
.row > * {
  flex: 0 0 auto;
}
</style>
