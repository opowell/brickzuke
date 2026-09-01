import { defineStore, storeToRefs } from 'pinia'
import { Call, makeTextCall, processQueue } from '~/assets/js/make-call'
import { extractValueFromHtml } from '~/assets/js/utils'
import { useQueryStore } from '../query'
import { ONE_YEAR } from '@/assets/js/timesToMs'

interface Category {
  id: string
  name: string
}

export const useCatalogPageStore = defineStore('catalogPageStore', {
  state: () => ({
    numCategories: 0,
    categories: [] as Category[],
    loaded: false,
    loading: false,
  }),
  getters: {
    filteredCategories: (state) => {
      const queryStore = useQueryStore()
      const {
        s 
      } = storeToRefs(queryStore)
      const search = s
      if (!search.value || search.value === '') {
        return state.categories
      }
      return state.categories.filter((category) => {
        // @ts-ignore undefined case already handled above
        return category.name.includes(search.value)
      })
    },
    categoriesMap: (state) => {
      const map = new Map<string, Category>()
      state.categories.forEach((category: Category) => map.set(category.id, category))
      return map
    },
  },
  actions: {
    async fetch() {
      if (this.loading) {
        return
      }
      this.loading = true
      makeTextCall(
        Call.GET_CATALOG_PAGE,
        'https://www.bricklink.com/catalog.asp',
        {
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
        },
        undefined,
        ONE_YEAR,
      )
    },
    handleFetchResponse(response: string) {
      const categories = extractValueFromHtml(
        response,
        ['<select name="catID"', '<OPTION VALUE'],
        ['</select>', '</OPTION>'],
      )
      this.numCategories = categories.flat().length
      this.categories = categories.flat().map((c: string) => {
        const parts = c.replace("='", '').split("'>")
        return {
          id: parts[0],
          name: parts[1],
        }
      })
      this.loaded = true
    },
  },
})
