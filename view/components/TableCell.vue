<script setup lang="ts">
import { formatInteger } from '@/assets/js/utils.ts'
import type { TableColumn } from './TableComponent.vue'
import { computed } from 'vue'
import { processQueue } from '@/assets/js/make-call'
import { selectedItemType, filters, setCounts } from '../../model'
const {
  column,
  item,
  setMaxWidth = false,
} = defineProps<{
  column: TableColumn
  item: any
  setMaxWidth?: boolean
}>()

function handleClick() {
  if (column.clickValue) {
    // selectedItem.value = column.clickSelection
    // filters.value = filters.value.filter((filter) => filter.key !== key)
    filters.value.push(column.clickValue(item))
    selectedItemType.value = column.clickSelection
    console.log('pushed filter')
    setCounts()
  }
  if (column.clickFn) {
    column.clickFn(item)
  }
  processQueue(column.processCount)
}
const label = computed(() => {
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
const styles = computed(() => {
  if (setMaxWidth) {
    return {
      'max-width': column.width || '100px',
    }
  }
  return {
    width: column.width || '100px',
  }
})
</script>

<template>
  <div :style="styles">
    <template v-if="hasLabel">
      <button v-if="column.clickFn || column.clickValue" @click="handleClick">
        <img v-if="column.type === 'image'" :src="label" :style="{ 'max-height': column.height || 'unset' }" />
        <div v-else-if="hasLabel" v-html="label" />
      </button>
      <template v-else>
        <img v-if="column.type === 'image'" :src="label" :style="{ 'max-width': column.width || '100px' }"
          @click="handleClick" />
        <div v-else-if="hasLabel" v-html="label" />
      </template>
    </template>
  </div>
</template>

<style scoped>
img {
  max-width: 100%;
}
</style>
