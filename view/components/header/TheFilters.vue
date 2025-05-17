<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelsStore } from '../../stores/models.ts'
import { useCatalogListPageStore } from '../../stores/brickLink/catalog-list-page.ts'
import { useCatalogItemPageStore } from '../../stores/brickLink/catalog-item-page.ts'
const modelsStore = useModelsStore()
const { filters } = storeToRefs(modelsStore)
function getKey(key: string) {
  switch (key) {
    case 'category':
      return 'Category'
    case 'item':
      return 'Item'
  }
  return key
}
function getValue(filter: Filter) {
  switch (filter.key) {
    case 'category':
      const catalogListPage = useCatalogListPageStore()
      const catalogListPageRefs = storeToRefs(catalogListPage)
      const category = catalogListPageRefs.categoriesMap.value.get(filter.value)
      if (category) {
        return category.name
      }
      break
    case 'item':
      const catalogItemPage = useCatalogItemPageStore()
      const catalogItemPageRefs = storeToRefs(catalogItemPage)
      const item = catalogItemPageRefs.itemsMap.value.get(filter.value)
      if (item) {
        return item.itemName
      }
      break
  }
  return filter.value
}
const uiFilters = computed(() => {
  return filters.value.map((filter) => {
    return {
      key: getKey(filter.key),
      value: getValue(filter),
    }
  })
})
function removeFilter(index: number) {
  console.log(filters.value, index)
  filters.value.splice(index, 1)
}
</script>

<template>
  <div class="filters">
    <button
      v-for="(filter, index) in uiFilters"
      :key="filter.key + '#' + filter.value"
      v-html="filter.key + ': ' + filter.value"
      @click="removeFilter(index)"
    />
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 0.3rem;
}
button:hover {
  opacity: 0.5;
  text-decoration: line-through;
}
</style>
