<script setup lang="ts">
import { computed } from 'vue'
import { formatInteger } from '@/assets/js/utils'
import type { TableColumn } from '../TableComponent.vue'
export interface SelectOption<T> {
  id: string | number
  label: string
  items?: T[]
  count?: number
  preview?: string | ((item: T) => string)
  previewItems?: T[]
  previewClickFn?: (item: T) => void
  columns?: TableColumn<T>[]
  idField?: string
}
import { selectedItemType, itemTypes, processingCounts } from '../../../model'
const selectedItemTypeId = computed(() => {
  return selectedItemType?.value?.id
})
function handleChange(event: Event) {
  selectedItemType.value = itemTypes.value.find(type => type.id === event.target?.value)
}
function getLabel(itemType: SelectOption<any>) {
  if (!itemType.count || processingCounts.value) {
    return itemType.label
  }
  return itemType.label + ': ' + formatInteger(itemType.count)
}
</script>

<template>
  <select :value="selectedItemTypeId" @change="handleChange">
    <option value="">Everything</option>
    <option v-for="itemType in itemTypes" :key="itemType.id" :value="itemType.id">{{ getLabel(itemType) }}</option>
  </select>
</template>

<style scoped></style>
