<script setup lang="ts">
import { formatInteger } from '@/assets/js/utils.ts'
import type { TableColumn } from './TableComponent.vue'
import { computed } from 'vue'
const { column, item } = defineProps<{
  column: TableColumn
  item: any
}>()
function handleClick() {
  if (!column.clickFn) {
    return
  }
  return column.clickFn(item)
}
const label = computed(() => {
  if (column.type === 'image') {
    return item[column.valueField || column.id]
  }
  if (column.type === 'number') {
    return formatInteger(item[column.valueField || column.id])
  }
  if (column.itemValue) {
    return column.itemValue(item)
  }
  return item[column.valueField || column.id]
})
const hasLabel = computed(() => {
  return !!label.value
})
</script>

<template>
  <div :style="{ width: column.width || '100px' }">
    <template v-if="hasLabel">
      <button v-if="column.clickFn" @click="handleClick">
        <img
          v-if="column.type === 'image'"
          :src="label"
          :style="{ 'max-width': column.width || '100px' }"
          @click="handleClick"
        />
        <div v-else-if="hasLabel" v-html="label" />
      </button>
      <template v-else>
        <img
          v-if="column.type === 'image'"
          :src="label"
          :style="{ 'max-width': column.width || '100px' }"
          @click="handleClick"
        />
        <div v-else-if="hasLabel" v-html="label" />
      </template>
    </template>
  </div>
</template>
