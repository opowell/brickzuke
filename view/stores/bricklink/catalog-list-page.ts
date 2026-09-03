import { useCatalogItemInvPageStore } from '@/stores/bricklink/catalog-item-inv-page'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {Call,
  CallType,
  makeTextCall,
  makeTextCalls,
  processQueue,
  queueCall,
  type EventDetail,} from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml } from '~/assets/js/utils'
import { useModelsStore } from '../models'
import { useCatalogItemPageStore } from './catalog-item-page'
import { listPageOptions, pageCount, parseRows } from './catalog-list'
import { ONE_MONTH, ONE_WEEK, ONE_YEAR } from '@/assets/js/timesToMs'

export interface BrickLinkCategory {
  catID: string
  catXrefLevel: number
  catType: string
  name: string
  items: number
}

export async function fetchAll() {
  return await makeTextCall(
    Call.GET_CATALOG_LIST_PAGE_ALL,
    'https://www.bricklink.com/catalogList.asp?v=3',
    listPageOptions(),
    undefined,
    ONE_WEEK,
  )
}
export async function fetch(catId: string, page: number = 1) {
  return await makeTextCall(
    Call.GET_CATALOG_LIST_PAGE,
    getPageUrl(catId, page),
    listPageOptions(),
    undefined,
    ONE_MONTH,
  )
}
export async function fetchFirstIds(catIds: string[]) {
  const calls = catIds.map((id) => {
    return {
      call: Call.GET_CATALOG_LIST_PAGE_FIRST_ONLY,
      url: getPageUrl(id, 1),
      options: listPageOptions(),
      undefined,
      ONE_YEAR,
    }
  })
  await makeTextCalls(calls)
}
export async function fetchFirst(catId: string) {
  await makeTextCall(
    Call.GET_CATALOG_LIST_PAGE_FIRST_ONLY,
    getPageUrl(catId, 1),
    listPageOptions(),
    undefined,
    ONE_YEAR,
  )
}

function getPageUrl(catId: string, page: number) {
  return `https://www.bricklink.com/catalogList.asp?catID=${catId}&pg=${page}`
}

export interface ItemType {
  name: string
  count: number
  catType: string
}
export const useCatalogListPageStore = defineStore('catalogListPageStore', () => {
  // refs
  const parts = ref(new Map<string, any[]>())
  const itemTypes = ref<ItemType[]>([])
  const categories = ref<BrickLinkCategory[]>([])
  const categoriesMap = ref(new Map<string, BrickLinkCategory>())

  // computed
  const filteredCategories = computed(() => {
    // const queryStore = useQueryStore()
    let out = categories.value
    // const catalogItemPage = useCatalogItemPageStore()
    // if (catalogItemPage.singleItem) {
    //   out = out.filter((category) => {
    //     // @ts-ignore
    //     return catalogItemPage.singleItem.categories.includes(category.catID)
    //   })
    // }
    const modelsStore = useModelsStore()
    const search = modelsStore.search
    if (search && search !== '') {
      const lowerCaseSearch = search.toLowerCase()
      const caseMatch = search !== lowerCaseSearch
      out = out.filter((category) => {
        if (caseMatch) {
          return category.name.includes(search)
        }
        return category.name.toLowerCase().includes(lowerCaseSearch)
      })
    }
    // const view = queryStore.views.get('categories')
    // const filters = queryStore.filtersOfType('categories')
    // const selectedIds = filters.map((f) => f.item)
    // switch (view) {
    //   case 'selected':
    //     out = out.filter((c) => selectedIds.length === 0 || selectedIds.includes(c.catID))
    //     break
    //   case 'none':
    //     if (queryStore.somethingOpen) {
    //       out = []
    //     }
    //     break
    // }
    // if (
    //   queryStore.somethingOpen &&
    //   !['selected', 'all'].includes(queryStore.views.get('categories'))
    // ) {
    //   out = []
    // } else if (selectedIds.length > 0) {
    //   out = out.filter((c) => selectedIds.length === 0 || selectedIds.includes(c.catID))
    // }
    const itemTypeFilters = modelsStore.filters
      .filter((f) => f.key === 'itemType')
      .map((f) => f.value)
    out = out.filter((category) => {
      if (itemTypeFilters.length > 0) {
        if (itemTypeFilters.includes(category.catType)) {
          return true
        }
      }
      const catalogItemPage = useCatalogItemPageStore()
      if (catalogItemPage.singleItem) {
        const catalogInvItemPage = useCatalogItemInvPageStore()
        const typeMap = catalogInvItemPage.itemVariants.get(catalogItemPage.singleItem.itemType)
        if (typeMap) {
          const invItems = typeMap.get(catalogItemPage.singleItem.itemNumber)
          if (invItems) {
            return invItems.map((ii) => ii.catString).includes(category.catID)
          }
          return false
        }
      }
      return true
    })
    return out.map((category) => {
      const catParts = parts.value.get(category.catID)
      let image = null
      if (!catParts) {
        return category
      }
      const firstPartWithImage = catParts.find((part) => !!part.image)
      if (!firstPartWithImage) {
        return category
      }
      image = firstPartWithImage.image
      return {
        ...category,
        image,
      }
    })
  })
  const partsByCategory = computed(() => {
    return (categoryId: string) => parts.value.get(categoryId)
  })
  const categoryIds = computed(() => {
    return categories.value.map((c) => c.catID)
  })
  const filteredItemTypes = computed(() => {
    return itemTypes.value.map((type) => {
      return {
        ...type,
        categories: categories.value.filter((c) => c.catType === type.catType).length,
      }
    })
  })

  // watchers
  watch(
    categoryIds,
    async () => {
      await fetchFirstIds(categoryIds.value)
      processQueue()
    },
    {
      immediate: true,
    },
  )

  // methods
  async function handleFetchResponseAll(detail: EventDetail) {
    const itemTypeStrings = extractValueFromHtml(
      detail.response,
      ['<div class="catalog-list__category-list--title">'],
      ['</FONT></div></TD></TR>'],
    )
    const names = itemTypeStrings.map((type: string) => {
      return extractValueFromHtml(type, '\r\n                                    ', '\r\n')
    })
    const counts = itemTypeStrings.map((type: string) => {
      return extractValueFromHtml(
        type,
        '<div class="catalog-list__category-list--pagination"><FONT CLASS="fv"><B>',
        '</B>',
      )
    })
    const catTypes = itemTypeStrings.map((type: string) => {
      return extractValueFromHtml(type, '(<A HREF="/catalogList.asp?catType=', '"')
    })
    const items = itemTypeStrings.map((type: string) => {
      return extractValueFromHtml(type, '<A HREF="/catalogList.asp?', ')</span>')
    })
    const itemParams = items.map((item: string[]) => {
      return item.map((x) => {
        return extractValuesFromHtml(
          x,
          ['catID=', 'catXrefLevel=', 'catType=', '>', '>('],
          ['&', '&', '"', '<'],
        )
      })
    })
    const localItemTypes = []
    for (let i = 0; i < names.length; i++) {
      localItemTypes.push({
        name: names[i][0],
        count: Number.parseInt(counts[i][0]),
        catType: catTypes[i][0],
      })
    }
    const localCategories = itemParams.map((typeCategories) => {
      return typeCategories.map((category) => {
        return {
          catID: category[0],
          catXrefLevel: category[1],
          catType: category[2],
          name: category[3],
          items: category[4],
        }
      })
    })
    categoriesMap.value = new Map<string, any>()
    localCategories.forEach((type) => {
      type.forEach((category) => {
        let value = categoriesMap.value.get(category.catID)
        if (!value) {
          value = {
            ...category,
            items: 0,
          }
        }
        value.items += Number.parseInt(category.items)
        categoriesMap.value.set(category.catID, value)
      })
    })
    categories.value = Array.from(categoriesMap.value.values())
    itemTypes.value = localItemTypes
  }
  async function handleFetchResponse(detail: EventDetail, fetchAll = true) {
    const params = extractValuesFromHtml(detail.request.url, ['catID=', 'pg='], ['&', ''])
    const catId = params[0]
    const page = params[1]
    if (page === '1' && fetchAll) {
      parts.value.delete(catId)
      const numPages = pageCount(detail.response)
      for (let i = numPages; i > 1; i--) {
        await queueCall(
          CallType.TEXT,
          Call.GET_CATALOG_LIST_PAGE,
          getPageUrl(catId, i),
          listPageOptions(),
        )
      }
    }
    const parts2 = parseRows(detail.response)
    if (!parts2.length) {
      // console.log('something wrong', detail, parts)
      return
    }
    let currentValue = parts.value.get(catId)
    if (!currentValue) {
      currentValue = []
    }
    currentValue.push(...parts2)
    parts.value.set(catId, currentValue)
  }

  // return
  return {
    parts,
    itemTypes,
    categories,
    categoriesMap,
    filteredCategories,
    filteredItemTypes,
    partsByCategory,
    fetch,
    handleFetchResponse,
    handleFetchResponseAll,
  }
})
