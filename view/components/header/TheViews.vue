<script setup lang="ts">
import { ref } from 'vue';
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
}
defineProps<{
  itemTypes: SelectOption<any>[]
}>()
const selectedItemType = ref<SelectOption<any> | undefined>(undefined)
</script>

<template>
  <select v-model="selectedItemType">
    <option value="">Everything</option>
    <option v-for="itemType in itemTypes" :key="itemType.id" :value="itemType.id">{{ itemType.label }}: {{
      formatInteger(itemType.count) }}</option>
  </select>
</template>

<style scoped></style>
