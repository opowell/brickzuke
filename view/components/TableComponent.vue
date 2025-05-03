<script setup lang="ts">
interface TableColumn {
  id: string
  label: string
}
interface Table {
  id: string
  label: string
  columns: TableColumn[]
}
defineProps<{
  table: Table
}>()
</script>

<template>
  <div class="table">
    <div class="row">
      <div v-for="column in table.columns" :key="column.id">
        <button>{{ column.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  gap: 0.5rem;
}
</style>
