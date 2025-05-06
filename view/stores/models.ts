import { computed, ref, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import {
  useCatalogListPageStore,
  type BrickLinkCategory,
  type ItemType,
} from './bricklink/catalog-list-page'
import router from '@/router/index'
import { useCatalogDownloadPageStore } from './bricklink/catalog-download-page'
import { useRoute } from 'vue-router'
import { useCatalogItemPageStore } from './bricklink/catalog-item-page'
import { processQueue } from '@/assets/js/make-call'
import { useCatalogItemInvPageStore } from './bricklink/catalog-item-inv-page'
import { formatInteger } from '@/assets/js/utils'
import { useColorsPageStore } from './bricklink/colors-page'
interface Query {
  f?: Filter[]
  s?: string
  v?: string
  b?: Sort[]
}
interface Filter {
  key: string
  value: string
}
interface Sort {
  key: string
  dir: 'a' | 'd'
}
interface BrickLinkItem {
  id: string
  Name: string
  Number: string
  'Category ID': string
  itemType: string
  weight: string
}

export const useModelsStore = defineStore('models', () => {
  // imports
  const route = useRoute()

  // refs
  const filters = ref<Filter[]>([])
  const sorts = ref<Sort[]>([])
  const urlParams = new URLSearchParams(window.location.search)
  const initialSelectedItem: string | undefined = urlParams.get('v') || undefined
  const search = ref(urlParams.get('s') || undefined)
  const selectedItem = ref<string | undefined>(initialSelectedItem)
  const pauseRedirect = ref(false)

  // computeds
  const images = computed(() => {
    const catalogItemPage = useCatalogItemPageStore()
    const { singleItem } = storeToRefs(catalogItemPage)
    if (!singleItem.value) {
      return []
    }
    return catalogItemPage.imagesMap.get(
      singleItem.value.itemType + '-' + singleItem.value.itemNumber,
    )
  })
  const colors = computed(() => {
    const colorsPage = useColorsPageStore()
    const { filteredColors } = storeToRefs(colorsPage)
    return filteredColors.value
  })
  const inventories = computed(() => {
    const catalogItemPageStore = useCatalogItemPageStore()
    const { singleItem } = storeToRefs(catalogItemPageStore)
    if (!singleItem.value) {
      return []
    }
    return catalogItemPageStore.inventoriesMap.get(
      singleItem.value.itemType + '-' + singleItem.value.itemNumber,
    )
  })
  const itemTypes = computed(() => {
    const catalogDownloadPage = useCatalogDownloadPageStore()
    const catalogItemInvPage = useCatalogItemInvPageStore()
    const catalogListPage = useCatalogListPageStore()
    return [
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
            width: '55px',
          },
          {
            id: 'items',
            label: 'Items',
            width: '60px',
            type: 'number',
            clickFn: (category: BrickLinkCategory) => {
              selectedItem.value = 'items'
              filters.value.push({
                key: 'category',
                value: category.catID,
              })
              search.value = undefined
            },
          },
          {
            id: 'name',
            label: 'Name',
            itemValue: (category: BrickLinkCategory) => category.name + ' (' + category.catID + ')',
            width: '300px',
            clickFn: (category: BrickLinkCategory) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'category',
                value: category.catID,
              })
              search.value = undefined
            },
          },
        ],
      },
      {
        id: 'itemInventories',
        label: 'Item inventories',
        items: catalogItemInvPage.filteredItemInventories,
        columns: [
          {
            id: 'image',
            width: '100px',
            type: 'image',
            valueField: 'thumbnail',
            hideLabel: true,
          },
          {
            id: 'itemType',
            label: 'Type',
            width: '60px',
            clickFn: (item: BrickLinkItem) => {
              filters.value.push({
                key: 'itemType',
                value: item.itemType,
              })
              search.value = undefined
            },
          },
          {
            id: 'name',
            label: 'Name',
            width: '300px',
            clickFn: (item: BrickLinkItem) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'item',
                value: item.id,
              })
              filters.value = filters.value.filter((filter) => filter.key !== 'itemType')
              search.value = undefined
            },
          },
          {
            id: 'categoryName',
            label: 'Category',
            width: '100px',
          },
          {
            id: 'colorId',
            label: 'Color',
            width: '60px',
          },
          {
            id: 'quantity',
            label: 'Quantity',
            width: '80px',
          },
        ],
      },
      {
        id: 'itemVariants',
        label: 'Item variants',
        items: catalogItemInvPage.filteredItemVariants,
        columns: [
          {
            id: 'image',
            width: '100px',
            type: 'image',
            valueField: 'thumbnail',
            hideLabel: true,
          },
          {
            id: 'itemType',
            label: 'Type',
            width: '60px',
            clickFn: (item: BrickLinkItem) => {
              filters.value.push({
                key: 'itemType',
                value: item.itemType,
              })
              search.value = undefined
            },
          },
          {
            id: 'name',
            label: 'Name',
            width: '300px',
            clickFn: (item: BrickLinkItem) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'item',
                value: item.id,
              })
              filters.value = filters.value.filter((filter) => filter.key !== 'itemType')
              search.value = undefined
            },
          },
          {
            id: 'categoryName',
            label: 'Category',
            width: '100px',
          },
          {
            id: 'colorId',
            label: 'Color',
            width: '60px',
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
            id: 'itemType',
            label: 'Type',
            width: '60px',
            clickFn: (item: BrickLinkItem) => {
              filters.value.push({
                key: 'itemType',
                value: item.itemType,
              })
              search.value = undefined
            },
          },
          {
            id: 'name',
            label: 'Name',
            width: '300px',
            valueField: 'Name',
            itemValue: (item: BrickLinkItem) => item.Name + ' (' + item.Number + ')',
            clickFn: (item: BrickLinkItem) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'item',
                value: item.id,
              })
              filters.value = filters.value.filter((filter) => filter.key !== 'itemType')
              search.value = undefined
            },
          },
          {
            id: 'category',
            label: 'Category',
            width: '200px',
            valueField: 'Category Name',
            clickFn: (item: BrickLinkItem) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'category',
                value: item['Category ID'],
              })
              search.value = undefined
            },
          },
          {
            id: 'Year Released',
            label: 'Year',
            width: '70px',
          },
          {
            id: 'weight',
            label: 'Weight',
            width: '70px',
            itemValue: (item: BrickLinkItem) =>
              formatInteger(Number.parseFloat(item.weight) * 100, [
                {
                  start: 0,
                  end: 100,
                  suffix: 'cg',
                },
                {
                  start: 100,
                  end: 10000,
                  modifier: 0.01,
                  decimalPlaces: 1,
                  suffix: 'g',
                },
                {
                  start: 10000,
                  end: 100000,
                  modifier: 0.01,
                  decimalPlaces: 0,
                  suffix: 'g',
                },
                {
                  start: 100000,
                  modifier: 0.00001,
                  decimalPlaces: 1,
                  suffix: 'kg',
                },
              ]),
          },
          {
            id: 'dimensions',
            label: 'Dimensions',
            width: '110px',
            valueField: 'Dimensions',
          },
        ],
      },
      {
        id: 'itemTypes',
        label: 'Item types',
        items: catalogListPage.filteredItemTypes,
        columns: [
          {
            id: 'name',
            label: 'Name',
            width: '100px',
            clickFn: (type: ItemType) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'itemType',
                value: type.catType,
              })
              search.value = undefined
            },
          },
          {
            id: 'count',
            label: 'Items',
            width: '100px',
            type: 'number',
            clickFn: (type: ItemType) => {
              selectedItem.value = 'items'
              filters.value.push({
                key: 'itemType',
                value: type.catType,
              })
              search.value = undefined
            },
          },
          {
            id: 'categories',
            label: 'Categories',
            width: '100px',
            type: 'number',
            clickFn: (type) => {
              selectedItem.value = 'categories'
              filters.value.push({
                key: 'itemType',
                value: type.catType,
              })
              search.value = undefined
            },
          },
        ],
      },
      {
        id: 'inventories',
        label: 'Inventories',
        items: inventories.value,
        idField: 'invId',
        columns: [
          {
            id: 'image',
            width: '200px',
            type: 'image',
            hideLabel: true,
          },
          {
            id: 'price',
            label: 'Price',
            width: '100px',
          },
          {
            id: 'description',
            label: 'Description',
            width: '300px',
          },
          {
            id: 'sellerCountryName',
            label: 'Country',
            width: '100px',
          },
          {
            id: 'sellerStoreName',
            label: 'Store',
            width: '200px',
          },
          {
            id: 'condition',
            label: 'Condition',
            width: '100px',
          },
          {
            id: 'quantity',
            label: 'Quant.',
            width: '80px',
            type: 'number',
          },
          {
            id: 'sellerFeedbackScore',
            label: 'Feedback',
            width: '100px',
            type: 'number',
          },
        ],
      },
      {
        id: 'colors',
        label: 'Colors',
        items: colors.value,
        idField: 'colorID',
        columns: [
          {
            id: 'name',
            label: 'Name',
            itemValue: (color) => color.colorName + ' (' + color.colorID + ')',
          },
          {
            id: 'countItems',
            label: 'Items',
            type: 'number',
          },
          {
            id: 'countParts',
            label: 'Parts',
            type: 'number',
          },
          {
            id: 'countSets',
            label: 'Sets',
            type: 'number',
          },
        ],
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
      {
        id: 'images',
        label: 'Images',
        items: images.value,
        columns: [
          {
            id: 'image',
            width: 'unset',
            type: 'image',
            hideLabel: true,
          },
        ],
        hideSelect: true,
        hidePriceModifier: true,
      },
    ]
  })
  const currentQuery = computed(() => {
    const query: Query = {}
    if (selectedItem.value) {
      query.v = selectedItem.value
    }
    if (search.value) {
      query.s = search.value
    }
    if (filters.value.length > 0) {
      query.f = filters.value
    }
    if (sorts.value.length > 0) {
      query.b = sorts.value
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
    if (filters.value.length > 0) {
      parts.push('f=' + filters.value.map((filter) => filter.key + '_' + filter.value).join(','))
    }
    if (sorts.value.length > 0) {
      parts.push('b=' + sorts.value.map((sort) => sort.key + '_' + sort.dir).join(','))
    }
    if (parts.length === 0) {
      return '/'
    }
    return '/?' + parts.join('&')
  })
  const catTypes = computed(() => {
    const catalogListPage = useCatalogListPageStore()
    return catalogListPage.itemTypes.map((type) => type.catType)
  })
  const itemIds = computed(() => {
    return filters.value
      .filter((f) => f.key === 'item')
      .map((x) => x.value)
      .filter((x) => x !== undefined)
  })
  // watchers
  watch(
    () => route.query,
    () => {
      pauseRedirect.value = true
      search.value = route.query.s?.toString()
      selectedItem.value = route.query.v?.toString()
      const filtersString = route.query.f?.toString()
      if (filtersString) {
        filters.value = filtersString.split(',').map((fs) => {
          const parts = fs.split('_')
          return {
            key: parts[0],
            value: parts[1],
          }
        })
      } else {
        filters.value = []
      }
      const sortsString = route.query.b?.toString()
      if (sortsString) {
        sorts.value = sortsString.split(',').map((bs) => {
          const parts = bs.split('_')
          return {
            key: parts[0],
            dir: parts[1],
          }
        })
      } else {
        sorts.value = []
      }
      pauseRedirect.value = false
    },
  )
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
      if (route.fullPath === currentQueryString.value) {
        return
      }
      router.push(currentQueryString.value)
    },
  )
  watch(
    () => catTypes.value,
    async () => {
      const catalogDownloadPage = useCatalogDownloadPageStore()
      for (let i = 0; i < catTypes.value.length; i++) {
        await catalogDownloadPage.fetchItemPage(catTypes.value[i])
      }
    },
  )
  watch(
    itemIds,
    async () => {
      if (!itemIds.value) {
        return
      }
      for (let i = 0; i < itemIds.value.length; i++) {
        const itemKey = itemIds.value[i]
        if (!itemKey) {
          continue
        }
        const type = itemKey[0]
        const itemId = itemKey.substring(2)
        const catalogItemPage = useCatalogItemPageStore()
        await catalogItemPage.fetchItemPage(type, itemId)
        switch (type) {
          case 'S':
            const catalogItemInvPage = useCatalogItemInvPageStore()
            await catalogItemInvPage.fetchItemPage(type, itemId)
            break
          case 'P':
            // await catalogItemInPage.fetchItemPage(type, itemId);
            break
        }
        processQueue(2)
      }
    },
    {
      immediate: true,
    },
  )
  watch(selectedItem, () => {
    sorts.value = []
  })

  // methods
  function setSelectedItem(table) {
    selectedItem.value = table.id
  }

  function addSort(key: string, dir: 'a' | 'd') {
    const existingSort = sorts.value.find((s) => s.key === key)
    if (existingSort) {
      existingSort.dir = dir
      return
    }
    sorts.value.push({
      key,
      dir,
    })
  }

  // return
  return {
    addSort,
    colors,
    filters,
    sorts,
    search,
    selectedItem,
    selectedItemType,
    setSelectedItem,
    itemTypes,
    currentQuery,
    itemIds,
    images,
  }
})
