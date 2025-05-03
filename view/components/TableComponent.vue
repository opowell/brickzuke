<script setup lang="ts">
interface TableColumn {
  id: string
  label: string
  valueField: string
}
interface Table {
  id: string
  label: string
  columns: TableColumn[]
  items: any[]
  idField: string
}
defineProps<{
  table: Table
}>()
</script>

<template>
  <div class="table">
    <div class="row">
      <div v-for="column in table.columns" :key="column.id" :style="{ width: column.width }">
        <button>{{ column.label }}</button>
      </div>
    </div>
    <div v-for="item in table.items" :key="item[table.idField]" class="row">
      <div v-for="column in table.columns" :key="column.id" :style="{ width: column.width }">
        <template v-if="column.type === 'image'">
          <img :src="item[column.valueField || column.id]" />
        </template>
        <button v-else>{{ item[column.valueField || column.id] }}</button>
      </div>
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
</style>
