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
import {
  useCatalogItemInvPageStore,
  type ItemInventory,
  type ItemVariant,
} from './bricklink/catalog-item-inv-page'
import { formatInteger } from '@/assets/js/utils'
import { useColorsPageStore, type BrickLinkColor } from './bricklink/colors-page'
import { useStoresPageStore, type Store } from './bricklink/stores-page'
import type { Table } from '@/components/TableComponent.vue'
const IMAGES_PREVIEW_COLUMN = {
  id: 'image',
  width: 'unset',
  type: 'image',
  hideLabel: true,
}

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
export interface Sort {
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
    const { filteredInventories } = storeToRefs(catalogItemPageStore)
    return filteredInventories.value
  })
  const countries = computed(() => {
    const storesPageStore = useStoresPageStore()
    return storesPageStore.filteredCountries
  })
  const stores = computed(() => {
    const storesPageStore = useStoresPageStore()
    return storesPageStore.filteredStores
  })
  const regions = computed(() => {
    const storesPageStore = useStoresPageStore()
    return storesPageStore.filteredRegions
  })
  const COLUMN_ITEM_INVENTORY_NAME = {
    id: 'name',
    label: 'Item',
    width: '300px',
    itemValue: (ii: ItemInventory) => ii.itemVariant.name,
    clickKey: 'item',
    clickValue: (item: ItemInventory) => item.itemVariant.itemId,
  }
  const clickCategoryFn = (category: BrickLinkCategory) => {
    selectedItem.value = 'items'
    filters.value.push({
      key: 'category',
      value: category.catID,
    })
    search.value = undefined
  }
  const itemTypes = computed<Table<any>[]>(() => {
    const catalogDownloadPage = useCatalogDownloadPageStore()
    const catalogItemInvPage = useCatalogItemInvPageStore()
    const catalogListPage = useCatalogListPageStore()
    return [
      {
        id: 'categories',
        label: 'Categories',
        items: catalogListPage.filteredCategories,
        idField: 'catID',
        preview: 'name',
        previewClickFn: clickCategoryFn,
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
            width: '60px',
            clickKey: 'catType',
            clickValue: (category: BrickLinkCategory) => category.catType,
          },
          {
            id: 'items',
            label: 'Items',
            width: '60px',
            type: 'number',
            clickFn: clickCategoryFn,
          },
          {
            id: 'name',
            label: 'Name',
            itemValue: (category: BrickLinkCategory) => category.name + ' (' + category.catID + ')',
            width: '300px',
            clickKey: 'category',
            clickValue: (category: BrickLinkCategory) => category.catID,
          },
        ],
      },
      {
        id: 'itemInventories',
        label: 'Item inventories',
        description: 'A quantity of an item variant.',
        items: catalogItemInvPage.filteredItemInventories,
        preview: COLUMN_ITEM_INVENTORY_NAME,
        hidePriceModifier: true,
        columns: [
          {
            id: 'image',
            width: '100px',
            label: 'Variant',
            type: 'image',
            itemValue: (ii: ItemInventory) => ii.itemVariant.thumbnail,
            clickKey: 'variant',
            clickValue: (item: ItemInventory) =>
              item.itemVariant.colorId + '-' + item.itemVariant.itemId,
          },
          {
            id: 'itemType',
            label: 'Type',
            width: '60px',
            itemValue: (ii: ItemInventory) => ii.itemVariant.itemType,
            clickKey: 'itemType',
            clickValue: (item: ItemInventory) => item.itemVariant?.itemType,
          },
          COLUMN_ITEM_INVENTORY_NAME,
          {
            id: 'categoryName',
            label: 'Category',
            width: '100px',
            itemValue: (ii: ItemInventory) => ii.itemVariant.catString,
            clickKey: 'category',
            clickValue: (item: ItemInventory) => item.itemVariant?.catString,
          },
          {
            id: 'colorId',
            label: 'Color',
            valueField: 'colorName',
            itemValue: (ii: ItemInventory) => ii.itemVariant.colorName,
            width: '70px',
            clickKey: 'color',
            clickValue: (item: ItemInventory) => item.itemVariant?.colorId,
          },
          {
            id: 'quantity',
            label: 'Quantity',
            width: '90px',
          },
        ],
      },
      {
        id: 'itemVariants',
        label: 'Item variants',
        description: 'An item in a particular color.',
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
            clickKey: 'itemType',
            clickValue: (item: ItemVariant) => item.itemType,
          },
          {
            id: 'name',
            label: 'Name',
            width: '300px',
            clickKey: 'itemVariant',
            clickValue: (item: ItemVariant) => item.variantId,
          },
          {
            id: 'categoryName',
            label: 'Category',
            width: '100px',
            clickKey: 'category',
            clickValue: (item: ItemVariant) => item.catString,
          },
          {
            id: 'colorId',
            label: 'Color',
            width: '60px',
            clickKey: 'color',
            clickValue: (item: ItemVariant) => item.colorId,
          },
        ],
      },
      {
        id: 'items',
        label: 'Items',
        items: catalogDownloadPage.filteredItems,
        preview: 'Name',
        columns: [
          {
            id: 'image',
            width: '180px',
            type: 'image',
            hideLabel: true,
            clickKey: 'item',
            clickValue: (item: BrickLinkItem) => item.id,
            clickSelection: 'images',
          },
          {
            id: 'itemType',
            label: 'Type',
            width: '60px',
            clickKey: 'itemType',
            clickValue: (item: BrickLinkItem) => item.itemType,
          },
          {
            id: 'name',
            label: 'Name',
            width: '300px',
            valueField: 'Name',
            itemValue: (item: BrickLinkItem) => item.Name + ' (' + item.Number + ')',
            clickKey: 'item',
            clickValue: (item: BrickLinkItem) => item.id,
          },
          {
            id: 'category',
            label: 'Category',
            width: '200px',
            valueField: 'Category Name',
            clickKey: 'category',
            clickValue: (item: BrickLinkItem) => item['Category ID'],
          },
          {
            id: 'Year Released',
            label: 'Year',
            width: '70px',
          },
          {
            id: 'weight',
            label: 'Weight',
            width: '75px',
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
            width: '115px',
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
            width: '105px',
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
            width: '105px',
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
        label: 'Store inventories',
        items: inventories.value,
        idField: 'invId',
        hidePriceModifier: true,
        preview: 'price',
        columns: [
          {
            id: 'image',
            width: '70px',
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
            clickFn: (storeInvItem) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'country',
                value: storeInvItem.sellerCountryCode,
              })
              search.value = undefined
            },
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
            clickFn: (color: BrickLinkColor) => {
              selectedItem.value = undefined
              filters.value = []
              filters.value.push({
                key: 'color',
                value: color.colorID,
              })
              search.value = undefined
            },
          },
          {
            id: 'countItems',
            label: 'Items',
            type: 'number',
            clickFn: (color: BrickLinkColor) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'color',
                value: color.colorID,
              })
              search.value = undefined
            },
          },
          {
            id: 'countParts',
            label: 'Parts',
            type: 'number',
            clickFn: (color: BrickLinkColor) => {
              selectedItem.value = 'items'
              filters.value.push(
                {
                  key: 'color',
                  value: color.colorID,
                },
                {
                  key: 'itemType',
                  value: 'P',
                },
              )
              search.value = undefined
            },
          },
          {
            id: 'countSets',
            label: 'Sets',
            type: 'number',
            clickFn: (color: BrickLinkColor) => {
              selectedItem.value = 'items'
              filters.value.push(
                {
                  key: 'color',
                  value: color.colorID,
                },
                {
                  key: 'itemType',
                  value: 'S',
                },
              )
              search.value = undefined
            },
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
        id: 'regions',
        label: 'Regions',
        items: regions.value,
        idField: 'name',
        columns: [
          {
            id: 'name',
            label: 'Name',
            clickFn: (region) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'region',
                value: region.name,
              })
              search.value = undefined
            },
            width: '200px',
          },
          {
            id: 'countries',
            label: 'Countries',
            valueField: 'countryCount',
            clickFn: (region) => {
              selectedItem.value = 'countries'
              filters.value.push({
                key: 'region',
                value: region.name,
              })
              search.value = undefined
            },
          },
        ],
      },
      {
        id: 'countries',
        label: 'Countries',
        items: countries.value,
        idField: 'countryCode',
        columns: [
          {
            id: 'image',
            width: '30px',
            type: 'image',
            hideLabel: true,
          },
          {
            id: 'countryName',
            label: 'Name',
            clickFn: (country) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'country',
                value: country.countryName,
              })
              search.value = undefined
            },
            width: '200px',
          },
          {
            id: 'storeCount',
            label: 'Stores',
            type: 'number',
            clickFn: (country) => {
              selectedItem.value = 'stores'
              filters.value.push({
                key: 'country',
                value: country.countryCode,
              })
              search.value = undefined
            },
          },
        ],
      },
      {
        id: 'stores',
        label: 'Stores',
        items: stores.value,
        columns: [
          {
            id: 'countryID',
            label: 'Country',
            clickFn: (store: Store) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'country',
                value: store.countryID,
              })
              search.value = undefined
            },
            width: '90px',
          },
          {
            id: 'stateName',
            label: 'Province',
            clickFn: (store: Store) => {
              if (!store.stateName) {
                return
              }
              selectedItem.value = undefined
              filters.value.push({
                key: 'province',
                value: store.stateName,
              })
              search.value = undefined
            },
            width: '90px',
          },
          {
            id: 'name',
            label: 'Name',
            itemValue: (store: Store) => store.name + ' (' + store.id + ')',
            clickFn: (store: Store) => {
              selectedItem.value = undefined
              filters.value.push({
                key: 'store',
                value: store.id,
              })
              search.value = undefined
            },
            width: '200px',
          },
          {
            id: 'lots',
            label: 'Lots',
            type: 'number',
            width: '70px',
          },
          {
            id: 'instantCheckout',
            label: 'Instant Checkout',
            width: '100px',
          },
        ],
      },
      {
        id: 'images',
        label: 'Images',
        items: images.value,
        preview: IMAGES_PREVIEW_COLUMN,
        columns: [IMAGES_PREVIEW_COLUMN],
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
    {
      deep: true,
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
    {
      immediate: true,
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
      existingSort.dir = existingSort.dir === 'a' ? 'd' : 'a'
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
    pauseRedirect,
    sorts,
    search,
    selectedItem,
    selectedItemType,
    setSelectedItem,
    itemTypes,
    currentQuery,
    itemIds,
    images,
    inventories,
    catTypes,
  }
})
