import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useCatalogListPageStore, type BrickLinkCategory } from './bricklink/catalog-list-page'
import router from '@/router/index'
import { useCatalogDownloadPageStore } from './bricklink/catalog-download-page'
import { useRoute } from 'vue-router'
interface Query {
  f?: string
  s?: string
  v?: string
}

export const useModelsStore = defineStore('models', () => {
  const catalogListPage = useCatalogListPageStore()
  const catalogDownloadPage = useCatalogDownloadPageStore()
  const itemTypes = computed(() => [
    {
      id: 'categories',
      label: 'Categories',
      items: catalogListPage.filteredCategories,
      idField: 'catID',
      columns: [
        {
          id: 'image',
          width: '100px',
          type: 'image',
          hideLabel: true,
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
          width: '60px',
          type: 'number',
        },
        {
          id: 'name',
          label: 'Name',
          itemValue: (category: BrickLinkCategory) => category.name + ' (' + category.catID + ')',
          width: '300px',
          clickFn: (category: BrickLinkCategory) => {
            selectedItem.value = undefined
          },
        },
      ],
    },
    {
      id: 'items',
      label: 'Items',
      items: catalogDownloadPage.filteredItems,
      columns: [
        {
          id: 'image',
          width: '100px',
          type: 'image',
          hideLabel: true,
        },
        {
          id: 'itemNumber',
          label: 'Item #',
          valueField: 'Number',
        },
        {
          id: 'name',
          label: 'Name',
          width: '200px',
          valueField: 'Name',
        },
        {
          id: 'category',
          label: 'Category',
          width: '200px',
          valueField: 'Category Name',
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

  const route = useRoute()
  watch(
    () => route.query,
    () => {
      search.value = route.query.s?.toString()
      selectedItem.value = route.query.v?.toString()
    },
  )
  const urlParams = new URLSearchParams(window.location.search)
  const search = ref(urlParams.get('s') || undefined)
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
  const catTypes = computed(() => {
    return catalogListPage.itemTypes.map((type) => type.catType)
  })
  watch(
    () => catTypes.value,
    async () => {
      for (let i = 0; i < catTypes.value.length; i++) {
        await catalogDownloadPage.fetchItemPage(catTypes.value[i])
      }
    },
  )

  return { search, selectedItem, selectedItemType, setSelectedItem, itemTypes, currentQuery }
})
