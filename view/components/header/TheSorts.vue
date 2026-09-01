<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelsStore } from '../../stores/models.ts'
const modelsStore = useModelsStore()
const {
  sorts 
} = storeToRefs(modelsStore)
function getKey(key: string) {
  switch (key) {
    case 'category':
      return 'Category'
    case 'item':
      return 'Item'
  }
  return key
}
function getDirection(d: 'a' | 'd') {
  return d.toUpperCase()
}
const uiSorts = computed(() => {
  return sorts.value.map((filter) => {
    return {
      key: getKey(filter.key),
      direction: getDirection(filter.dir),
    }
  })
})
function removeSort(index: number) {
  sorts.value.splice(index, 1)
}
</script>

<template>
  <div class="sorts">
    <button v-for="(sort, index) in uiSorts" :key="sort.key" @click="removeSort(index)">
      {{ sort.key }}: {{ sort.direction }}
    </button>
  </div>
</template>

<style scoped>
.sorts {
  display: flex;
  gap: 0.3rem;
}
button:hover {
  opacity: 0.5;
  text-decoration: line-through;
}
</style>
