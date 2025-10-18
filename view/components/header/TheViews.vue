<script setup lang="ts">
import { computed } from 'vue';
import { formatInteger } from '@/assets/js/utils';
import type { TableColumn } from '../TableComponent.vue';
export interface SelectOption<T> {
  id: string | number
  label: string
  items?: T[]
  count?: number
  preview?: string | ((item: T) => string)
  previewClickFn?: (item: T) => void
  columns?: TableColumn<T>[]
  idField?: string
}
import { selectedItemType, itemTypes } from '../../../model'
const selectedItemTypeId = computed(() => {
  return selectedItemType?.value?.id
})
function handleChange(event: Event) {
  console.log('change', event.target?.value)
  selectedItemType.value = itemTypes.value.find(type => type.id === event.target?.value)
}
</script>

<template>
  <select :value="selectedItemTypeId" @change="handleChange">
    <option value="">Everything</option>
    <option v-for="itemType in itemTypes" :key="itemType.id" :value="itemType.id">{{ itemType.label }}: {{
      formatInteger(itemType.count) }}</option>
  </select>
</template>

<style scoped></style>
