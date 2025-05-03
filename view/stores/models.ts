import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useCatalogListPageStore } from './bricklink/catalog-list-page'
import router from '@/router/index'

interface Query {
  f?: string
  s?: string
  v?: string
}

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
  const currentQuery = computed(() => {
    const query: Query = {}
    if (selectedItem.value) {
      query.v = selectedItem.value
    }
    if (search.value) {
      query.s = search.value
    }
    return query
  })

  const currentQueryString = computed(() => {
    const parts = []
    if (selectedItem.value) {
      parts.push('v=' + selectedItem.value)
    }
    if (search.value) {
      parts.push('s=' + search.value)
    }
    if (parts.length === 0) {
      return '/'
    }
    return '/?' + parts.join('&')
  })
  const pauseRedirect = ref(false)
  watch(
    () => {
      return {
        pauseRedirect: pauseRedirect,
        query: currentQuery.value,
      }
    },
    async () => {
      if (pauseRedirect.value) {
        return
      }
      router.push(currentQueryString.value)
    },
  )

  return { search, selectedItem, setSelectedItem, itemTypes, currentQuery }
})
