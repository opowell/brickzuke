import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useCatalogListPageStore } from './bricklink/catalog-list-page'

export const useModelsStore = defineStore('models', () => {
  const catalogListPage = useCatalogListPageStore()
  const itemTypes = computed(() => [
    {
      id: 'categories',
      label: 'Categories',
      items: catalogListPage.filteredCategories,
      columns: [
        {
          id: 'id',
          label: 'Id',
        },
        {
          id: 'name',
          label: 'Name',
        },
      ],
    },
    {
      id: 'items',
      label: 'Items',
      columns: [
        {
          id: 'name',
          label: 'Name',
        },
        {
          id: 'itemNumber',
          label: 'Item #',
        },
      ],
    },
    {
      id: 'itemTypes',
      label: 'Item types',
    },
    {
      id: 'colors',
      label: 'Colors',
    },
    {
      id: 'conditions',
      label: 'Conditions',
    },
    {
      id: 'years',
      label: 'Years',
    },
    {
      id: 'storeRegions',
      label: 'Store regions',
    },
    {
      id: 'storeCountries',
      label: 'Store countries',
    },
    {
      id: 'stores',
      label: 'Stores',
    },
  ])
  const search = ref()
  const selectedItem = ref<string | undefined>()
  function setSelectedItem(table) {
    selectedItem.value = table.id
  }
  return { search, selectedItem, setSelectedItem, itemTypes }
})
