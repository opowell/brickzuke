<script setup lang="ts">
import TableComponent from './TableComponent.vue'
import { getTableLabel } from '@/assets/js/getTableLabel.ts'
import TableCell from './TableCell.vue'
import { itemTypes, selectedItemType, tableItems, tableRef } from '../../model'
import { nextTick, ref, watch } from 'vue'
import { setSelectedItem } from '../../model'
const localTableRef = ref<InstanceType<typeof TableComponent> | null>(null)
watch(() => selectedItemType.value, (value) => {
  if (!value) {
    return
  }
  nextTick(() => {
    tableRef.value = localTableRef.value
  })
})
</script>

<template>
  <section>
    <TableComponent v-if="selectedItemType" :table="selectedItemType" :items="tableItems" ref="localTableRef" />
    <div v-else class="buttons">
      <div v-for="table in itemTypes" :key="table.id" class="itemType">
        <button @click="setSelectedItem(table)" v-html="getTableLabel(table)" />
        <template v-if="table.preview && table.items?.length">:
          <div v-for="item in table.items?.slice(0, 10)" :key="item.id">
            <template v-if="typeof table.preview === 'string'">
              <button v-if="!!table.previewClickFn" v-html="item[table.preview]"
                @click="table.previewClickFn(item)"></button>
              <div v-else v-html="item[table.preview]" />
            </template>
            <TableCell v-else :column="table.preview" :item="item" set-max-width />
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.itemType {
  display: flex;
  gap: 0.3rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
</style>
