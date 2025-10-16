<script setup lang="ts">
import { ref } from 'vue';
import { formatInteger } from '@/assets/js/utils';
export interface SelectOption<T> {
  id: string | number
  label: string
  items?: T[]
  count?: number | string
  preview?: string | ((item: T) => string)
  previewClickFn?: (item: T) => void
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
