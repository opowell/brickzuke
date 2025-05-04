<script setup lang="ts">
import { formatInteger } from '@/assets/js/utils.ts'
import { computed } from 'vue'
interface TableColumn {
  id: string
  label: string
  valueField: string
}
export interface Table {
  id: string
  label: string
  columns: TableColumn[]
  items: any[]
  idField: string
  hidePriceModifier?: boolean
  hideSelect?: boolean
}
const { table } = defineProps<{
  table: Table
}>()
const tableItems = computed(() => {
  if (!table.items) {
    return []
  }
  return table.items.slice(0, 1000)
})
function handleClick(column, item) {
  if (!column.clickFn) {
    return
  }
  return column.clickFn(item)
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
        <button v-if="column.label">{{ column.label }}</button>
      </div>
      <div v-if="!table.hidePriceModifier">Price factor</div>
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
            :style="{ width: column.width || '100px' }"
          />
        </template>
        <button v-else @click="handleClick(column, item)">
          <template v-if="column.type === 'number'">
            {{ formatInteger(item[column.valueField || column.id]) }}
          </template>
          <template v-else-if="column.itemValue">
            {{ column.itemValue(item) }}
          </template>
          <template v-else>
            {{ item[column.valueField || column.id] }}
          </template>
        </button>
      </div>
      <div v-if="!table.hidePriceModifier"><input /></div>
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
}
.row > * {
  flex: 0 0 auto;
}
</style>
