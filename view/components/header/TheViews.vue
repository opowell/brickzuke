<script setup lang="ts">
import { computed } from 'vue'
import { formatInteger } from '@/assets/js/utils'
import type { Table } from '../TableComponent.vue'
import type { TableRow } from '../../../types/table'

/**
 * A table as the view picker lists it: the table itself, plus the handful of
 * rows the picker previews under its button.
 */
export interface SelectOption<T = TableRow> extends Table<T> {
  previewItems?: T[]
}
import { selectedItemType, itemTypes, processingCounts } from '../../../model'
const selectedItemTypeId = computed(() => {
  return selectedItemType?.value?.id
})
function handleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  selectedItemType.value = itemTypes.value.find(type => type.id === value)
}
function getLabel(itemType: SelectOption) {
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
