import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  Call,
  CallType,
  makeTextCall,
  makeTextCalls,
  queueCall,
  type EventDetail,
} from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml } from '~/assets/js/utils'

export interface BrickLinkCategory {
  catID: string
  catXrefLevel: number
  catType: string
  name: string
  items: number
}

function getPageUrl(catId: string, page: number) {
  return `https://www.bricklink.com/catalogList.asp?catID=${catId}&pg=${page}`
}

function getOptions() {
  return {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
      'cache-control': 'max-age=0',
      priority: 'u=0, i',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: null,
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
  }
}
export interface ItemType {
  name: string
  count: number
  catType: string
}
export const useCatalogListPageStore = defineStore('catalogListPageStore', {
  state: () => ({
    parts: new Map<string, any[]>(),
    itemTypes: [] as ItemType[],
    categories: [] as BrickLinkCategory[],
    categoriesMap: new Map<string, any>(),
  }),
  getters: {
    filteredCategories: (state) => {
      // const queryStore = useQueryStore()
      // const { s } = storeToRefs(queryStore)
      // const search = s
      const search = ref(undefined)
      let out = state.categories
      // const catalogItemPage = useCatalogItemPageStore()
      // if (catalogItemPage.singleItem) {
      //   out = out.filter((category) => {
      //     // @ts-ignore
      //     return catalogItemPage.singleItem.categories.includes(category.catID)
      //   })
      // }
      if (search?.value && search.value !== '') {
        const lowerCaseSearch = search.value.toLowerCase()
        const caseMatch = search.value !== lowerCaseSearch
        out = out.filter((category) => {
          if (caseMatch) {
            return category.name.includes(search.value)
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
      return out
    },
    partsByCategory: (state) => {
      return (categoryId: string) => state.parts.get(categoryId)
    },
  },
  actions: {
    async fetchAll() {
      return await makeTextCall(
        Call.GET_CATALOG_LIST_PAGE_ALL,
        'https://www.bricklink.com/catalogList.asp?v=3',
        getOptions(),
      )
    },
    async fetch(catId: string, page: number = 1) {
      return await makeTextCall(Call.GET_CATALOG_LIST_PAGE, getPageUrl(catId, page), getOptions())
    },
    async fetchFirstIds(catIds: string[]) {
      const calls = catIds.map((id) => {
        return {
          call: Call.GET_CATALOG_LIST_PAGE_FIRST_ONLY,
          url: getPageUrl(id, 1),
          options: getOptions(),
        }
      })
      await makeTextCalls(calls)
    },
    async fetchFirst(catId: string) {
      await makeTextCall(Call.GET_CATALOG_LIST_PAGE_FIRST_ONLY, getPageUrl(catId, 1), getOptions())
    },
    async handleFetchResponseAll(detail: EventDetail) {
      console.log('handleFetchResponseAll', detail)
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
      const itemTypes = []
      for (let i = 0; i < names.length; i++) {
        itemTypes.push({
          name: names[i][0],
          count: Number.parseInt(counts[i][0]),
          catType: catTypes[i][0],
        })
      }
      const categories = itemParams.map((typeCategories) => {
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
      this.categoriesMap = new Map<string, any>()
      categories.forEach((type) => {
        type.forEach((category) => {
          let value = this.categoriesMap.get(category.catID)
          if (!value) {
            value = {
              ...category,
              items: 0,
            }
          }
          value.items += Number.parseInt(category.items)
          this.categoriesMap.set(category.catID, value)
        })
      })
      this.categories = Array.from(this.categoriesMap.values())
      this.itemTypes = itemTypes
    },
    async handleFetchResponse(detail: EventDetail, fetchAll = true) {
      const params = extractValuesFromHtml(detail.request.url, ['catID=', 'pg='], ['&', ''])
      const catId = params[0]
      const page = params[1]
      const numPagesExtraction = extractValueFromHtml(
        detail.response,
        [
          'Items Found.  Page <B>',
          '<B>', // numPages
        ],
        ['</B> (Showing', ''],
      )
      if (page === '1' && fetchAll) {
        this.parts.delete(catId)
        const numPages = Number.parseInt(numPagesExtraction[0][0])
        for (let i = numPages; i > 1; i--) {
          await queueCall(
            CallType.TEXT,
            Call.GET_CATALOG_LIST_PAGE,
            getPageUrl(catId, i),
            getOptions(),
          )
        }
      }
      const parts = extractValueFromHtml(
        detail.response,
        ['<TR class="catalog-list__body-header">', '<TR'],
        ['</TABLE>', '</TR>'],
      )
      if (!parts[0]) {
        // console.log('something wrong', detail, parts)
        return
      }
      const parts2 = parts[0].map((partHtml: string) => {
        const values = extractValuesFromHtml(
          partHtml,
          [
            "data-itemid='", // item id
            "data-itemcolorid='", // color id,
            "SRC='", // image
            '<A HREF="',
            '>', // item number
            '<strong>', // item name
          ],
          ["' ", "'", "'", '"', '</A>', '</strong>'],
        )
        return {
          itemId: values[0],
          colorId: values[1],
          image: values[2],
          itemNumber: values[4],
          itemName: values[5],
        }
      })
      let currentValue = this.parts.get(catId)
      if (!currentValue) {
        currentValue = []
      }
      currentValue.push(...parts2)
      this.parts.set(catId, currentValue)
    },
  },
})
