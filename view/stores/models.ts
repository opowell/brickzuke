import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useCatalogListPageStore, type BrickLinkCategory } from './bricklink/catalog-list-page'
import router from '@/router/index'
interface Query {
  f?: string
  s?: string
  v?: string
}

export const useModelsStore = defineStore('models', () => {
  const urlParams = new URLSearchParams(window.location.search)
  const catalogListPage = useCatalogListPageStore()
  const itemTypes = computed(() => [
    {
      id: 'categories',
      label: 'Categories',
      items: catalogListPage.filteredCategories,
      idField: 'catID',
      columns: [
        {
          id: 'image',
          label: 'Image',
          width: '100px',
          type: 'image',
        },
        {
          id: 'type',
          label: 'Type',
          valueField: 'catType',
          width: '50px',
        },
        {
          id: 'items',
          label: 'Items',
          width: '50px',
          type: 'number',
        },
        {
          id: 'name',
          label: 'Name',
          itemValue: (category: BrickLinkCategory) => category.name + ' (' + category.catID + ')',
          width: '300px',
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
  const search = ref(urlParams.get('s'))
  const initialSelectedItem: string | undefined = urlParams.get('v') || undefined
  const selectedItem = ref<string | undefined>(initialSelectedItem)
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
  const selectedItemType = computed(() => {
    if (!selectedItem.value) {
      return
    }
    return itemTypes.value.find((type) => type.id === selectedItem.value)
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

  return { search, selectedItem, selectedItemType, setSelectedItem, itemTypes, currentQuery }
})
