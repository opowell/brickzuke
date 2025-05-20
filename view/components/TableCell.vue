<script setup lang="ts">
import { formatInteger } from '@/assets/js/utils.ts'
import type { TableColumn } from './TableComponent.vue'
import { computed } from 'vue'
import { useModelsStore } from '@/stores/models'
import { storeToRefs } from 'pinia'
import { processQueue } from '@/assets/js/make-call'
const {
  column,
  item,
  setMaxWidth = false,
} = defineProps<{
  column: TableColumn
  item: any
  setMaxWidth?: boolean
}>()
const modelsStore = useModelsStore()

function handleClick() {
  const modelsStoreRefs = storeToRefs(modelsStore)
  const { filters, search, selectedItem, pauseRedirect } = modelsStoreRefs
  pauseRedirect.value = true
  if (column.clickKey && column.clickValue) {
    const key = typeof column.clickKey === 'string' ? column.clickKey : column.clickKey(item)
    selectedItem.value = column.clickSelection
    // filters.value = filters.value.filter((filter) => filter.key !== key)
    filters.value.push({
      key,
      value: column.clickValue(item),
    })
    console.log('pushed filter')
    search.value = undefined
  }
  if (column.clickFn) {
    column.clickFn(item)
  }
  pauseRedirect.value = false
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
      <button v-if="column.clickFn || (column.clickKey && column.clickValue)" @click="handleClick">
        <img
          v-if="column.type === 'image'"
          :src="label"
          :style="{ 'max-width': column.width || '100px' }"
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
