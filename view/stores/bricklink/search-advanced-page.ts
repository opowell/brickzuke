import { ONE_YEAR } from '@/assets/js/timesToMs'
import { defineStore, storeToRefs } from 'pinia'
import { useQueryStore } from '../query'
import { Call, makeTextCall } from '~/assets/js/make-call'
import { extractValueFromHtml } from '~/assets/js/utils'

export const useSearchAdvancedPageStore = defineStore('searchAdvancedPageStore', {
  state: () => ({
    conditions: 0,
    itemTypes: 0,
    regions: 0,
    regionsMap: new Map<string, string>(),
    loaded: false,
  }),
  getters: {
    filteredRegions: (state) => {
      const out = Array.from(state.regionsMap, ([key, value]) => ({
        id: key,
        name: value,
      }))
      const queryStore = useQueryStore()
      const {
        s 
      } = storeToRefs(queryStore)
      const search = s.value
      if (!search) {
        return out
      }
      const lowerCaseSearch = search.toLowerCase()
      const caseMatch = search !== lowerCaseSearch
      return out.filter((region) => {
        if (caseMatch) {
          return region.name.includes(search)
        }
        return region.name.toLowerCase().includes(lowerCaseSearch)
      })
    },
  },
  actions: {
    async fetch() {
      makeTextCall(
        Call.GET_SEARCH_ADVANCED_PAGE,
        Call.GET_SEARCH_ADVANCED_PAGE,
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
      const conditions = extractValueFromHtml(
        response,
        ['<SELECT NAME="invNew"', '<OPTION VALUE'],
        ['</SELECT>', '</OPTION>'],
      )
      this.conditions = conditions.flat().length - 1
      const itemTypes = extractValueFromHtml(
        response,
        ['<SELECT NAME="itemType"', '<OPTION VALUE'],
        ['</SELECT>', '</OPTION>'],
      )
      this.itemTypes = itemTypes.flat().length - 1
      const regions = extractValueFromHtml(
        response,
        ['<SELECT NAME="regionID"', '<OPTION VALUE'],
        ['</SELECT>', '</OPTION>'],
      )
      this.regions = regions.flat().length
      regions.flat().forEach((region: string) => {
        const [id, name] = region.replace('  SELECTED', '').replace('="', '').split('">')
        this.regionsMap.set(id, name)
      })
      this.loaded = true
    },
  },
})
