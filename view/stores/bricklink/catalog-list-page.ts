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
import { listPageOptions, pageCount, parseRows, type CatalogListRow } from './catalog-list'
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
  const parts = ref(new Map<string, CatalogListRow[]>())
  const itemTypes = ref<ItemType[]>([])
  const categories = ref<BrickLinkCategory[]>([])
  const categoriesMap = ref(new Map<string, BrickLinkCategory>())

  const partsByCategory = computed(() => {
    return (categoryId: string) => parts.value.get(categoryId)
  })
  const categoryIds = computed(() => {
    return categories.value.map((c) => c.catID)
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
    const itemTypeStrings: string[] = extractValueFromHtml(
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
          catXrefLevel: Number.parseInt(category[1]),
          catType: category[2],
          name: category[3],
          items: Number.parseInt(category[4]),
        }
      })
    })
    categoriesMap.value = new Map<string, BrickLinkCategory>()
    localCategories.forEach((type) => {
      type.forEach((category) => {
        let value = categoriesMap.value.get(category.catID)
        if (!value) {
          value = {
            ...category,
            items: 0,
          }
        }
        value.items += category.items
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
    partsByCategory,
    fetch,
    handleFetchResponse,
    handleFetchResponseAll,
  }
})
