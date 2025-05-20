import { ONE_WEEK, ONE_YEAR } from '@/assets/js/timesToMs'
import { defineStore, storeToRefs } from 'pinia'
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml, sortItems } from '~/assets/js/utils'
import { useModelsStore } from '../models'
import { useCatalogItemPageStore } from './catalog-item-page'

const INSTANT_CHECKOUT_HTML =
  '<a href="https://www.bricklink.com/help.asp?helpID=2466"><I class="fas fa-bolt icon-instant-checkout"></I></a>'

export interface Country {
  regionId: string
  countryCode: string
  groupState: 'Y' | 'N'
  image: string
  countryName: string
}

export interface Region {
  name: string
  countryCount: number
}

export interface Store {
  name: string
  id: string
  lots?: number
  stateName?: string
  instantCheckout?: boolean
  countryID: string
}

export const useStoresPageStore = defineStore('storesPageStore', {
  state: () => ({
    countries: 0,
    countriesMap: new Map<string, Country>(),
    stores: 0,
    regions: 0,
    regionsMap: new Map<string, Region>(),
    loaded: false,
    storesMap: new Map<string, Store[]>(),
  }),
  getters: {
    countriesArray(state): Country[] {
      return Array.from(state.countriesMap.values())
    },
    storesArray(state): Store[] {
      return Array.from(state.storesMap.values()).flat()
    },
    filteredRegions: (state): Region[] => {
      const out = Array.from(state.regionsMap.values())
      const queryStore = useModelsStore()
      const { search } = storeToRefs(queryStore)
      if (!search.value || search.value === '') {
        return out
      }
      const lowerCaseSearch = search.value.toLowerCase()
      const caseMatch = search.value !== lowerCaseSearch
      return out.filter((region) => {
        if (caseMatch) {
          // @ts-expect-error undefined case already handled above
          return region.name.includes(search.value)
        }
        return region.name.toLowerCase().includes(lowerCaseSearch)
      })
    },
    filteredCountries(): Country[] {
      const queryStore = useModelsStore()
      const { search, filters, sorts } = storeToRefs(queryStore)
      let out = [...this.countriesArray]
      const catalogItemPageStore = useCatalogItemPageStore()
      const { filteredInventories } = storeToRefs(catalogItemPageStore)
      if (filteredInventories.value && filteredInventories.value.length > 0) {
        const inventoryCountries = filteredInventories.value.map((i) => i.sellerCountryCode)
        out = out.filter((c) => inventoryCountries.includes(c.countryCode))
      }
      if ((search.value && search.value !== '') || filters.value.length) {
        const lowerCaseSearch = search.value ? search.value.toLowerCase() : undefined
        const caseMatch = search.value !== lowerCaseSearch
        const filteredRegions = filters.value.filter((f) => f.key === 'region')
        const includedRegionIds = filteredRegions.map((f) => f.value)
        out = out.filter((item) => {
          if (search.value && caseMatch) {
            if (!item.countryName.includes(search.value)) {
              return false
            }
            if (includedRegionIds.length > 0) {
              return includedRegionIds.includes(item.regionId)
            }
            return true
          }
          if (lowerCaseSearch && !item.countryName.toLowerCase().includes(lowerCaseSearch)) {
            return false
          }
          if (includedRegionIds.length > 0) {
            return includedRegionIds.includes(item.regionId)
          }
          return true
        })
      }
      sortItems(out, sorts.value)
      return out
    },
    filteredStores(): Store[] {
      const queryStore = useModelsStore()
      const { search, filters, sorts } = storeToRefs(queryStore)
      let out = [...this.storesArray]
      const catalogItemPageStore = useCatalogItemPageStore()
      const { filteredInventories } = storeToRefs(catalogItemPageStore)

      if (filteredInventories.value) {
        out = filteredInventories.value?.map((inventory) => {
          return {
            name: inventory.sellerStoreName,
            id: inventory.strSellerUsername,
            countryID: inventory.sellerCountryCode,
          }
        })
      }
      const filteredCountries = filters.value.filter((f) => f.key === 'country')
      const includedCountryIds = filteredCountries.map((f) => f.value)
      if (includedCountryIds.length > 0) {
        out = []
        includedCountryIds.forEach((countryId) => {
          const stores = this.storesMap.get(countryId)
          if (!stores) {
            return
          }
          out.push(...stores)
        })
      }
      if ((search.value && search.value !== '') || filters.value.length > 0) {
        const lowerCaseSearch = search.value ? search.value.toLowerCase() : undefined
        const caseMatch = search.value !== lowerCaseSearch
        const filteredRegions = filters.value.filter((f) => f.key === 'region')
        const includedRegionIds = filteredRegions.map((f) => f.value)
        out = out.filter((item) => {
          const country = this.countriesMap.get(item.countryID)
          if (search.value && caseMatch) {
            if (!item.name.includes(search.value)) {
              return false
            }
            if (includedRegionIds.length > 0) {
              if (!country) {
                return false
              }
              return includedRegionIds.includes(country.regionId)
            }
            return true
          }
          if (lowerCaseSearch && !item.name.toLowerCase().includes(lowerCaseSearch)) {
            return false
          }
          if (includedRegionIds.length > 0) {
            if (!country) {
              return false
            }
            return includedRegionIds.includes(country.regionId)
          }
          return true
        })
      }
      sortItems(out, sorts.value)
      return out
    },
  },
  actions: {
    async fetchStoresInCountryPage(countryID: string) {
      makeTextCall(
        Call.GET_COUNTRY_STORES_PAGE,
        'https://www.bricklink.com/browseStores.asp?countryID=' + countryID + '&groupState=Y',
        {
          headers: {
            accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
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
        {
          countryID,
        },
        ONE_WEEK,
      )
    },
    async fetchStoresPage() {
      makeTextCall(
        Call.GET_STORES_PAGE,
        'https://www.bricklink.com/browse.asp',
        {
          headers: {
            accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
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
    handleCountryStoresResponse(detail: EventDetail) {
      const response = detail.response
      const storesHtml = extractValueFromHtml(
        response,
        '<!-- Classic Contents Start -->',
        '<!-- Classic Contents End-->',
      )[0]
      const states = [
        {
          name: undefined,
          html: storesHtml,
        },
      ]
      if (storesHtml.includes('<FONT FACE')) {
        states.pop()
        const statesHtml = extractValueFromHtml(storesHtml, 'FACE="Tahoma,Arial', '<FONT')
        statesHtml.forEach((stateHtml: string) => {
          const stateName = extractValueFromHtml(stateHtml, '">', '</FONT>')[0]
          states.push({
            name: stateName,
            html: stateHtml,
          })
        })
      }
      const countryID = detail.request.extraParams.countryID
      const stores: Store[] = []
      states.forEach((stateObj) => {
        const stateHtml = stateObj.html
        const stateName = stateObj.name
        const storesHtml = extractValueFromHtml(stateHtml, '<A HREF=', '<BR>')
        storesHtml.forEach((store: string) => {
          const instantCheckout = store.includes(INSTANT_CHECKOUT_HTML)
          if (instantCheckout) {
            store = store.replace(INSTANT_CHECKOUT_HTML, '')
          }
          const params = extractValuesFromHtml(store, ['p=', '>', ' - '], ["'", '</A>'])
          stores.push({
            stateName,
            id: params[0],
            name: params[1],
            lots: Number.parseInt(params[2].replaceAll(',', '')),
            instantCheckout,
            countryID,
          })
        })
      })
      this.storesMap.set(countryID, stores)
    },
    handleFetchResponse(response: string) {
      const stores = extractValueFromHtml(
        response,
        ["<h3 class='new'>Countries</h3>", '<span>'],
        ' stores',
      )
      this.stores = Number.parseInt(stores[0][0].replaceAll(',', ''))
      const regionTables = extractValueFromHtml(
        response,
        "<h3 class='new'>Countries</h3>",
        'Search stores by name',
      )
      const regions = extractValueFromHtml(
        regionTables[0],
        "<table class='store-list'>",
        '</td></tr></table>',
      )
      regions.forEach((r: string) => {
        const regionId = extractValuesFromHtml(r, "<th colspan='2'>", '</th>')[0]
        const countries = extractValueFromHtml(r, "<tr><td><a href='", '</span></td></tr>')
        const region: Region = {
          name: regionId,
          countryCount: countries.length,
        }
        this.regionsMap.set(regionId, region)
        const x = countries.map((c: string) => {
          const parts = extractValuesFromHtml(
            c,
            [
              'countryID=', // country code
              "src='", // image
              '>', // country name
              '<span>', // store count
            ],
            [c.includes('groupState=') ? '&' : "'>", "'", '</a>'],
          )
          let groupState = 'N'
          if (c.includes('groupState=')) {
            groupState = extractValuesFromHtml(c, 'groupState=', "'")[0]
          }
          return {
            regionId,
            countryCode: parts[0],
            groupState,
            image: 'https://www.bricklink.com' + parts[1],
            countryName: parts[2],
            storeCount: Number.parseInt(parts[3]),
          }
        })
        x.forEach((c: Country) => {
          this.countriesMap.set(c.countryCode, c)
        })
        this.countries += countries.length
      })
      this.regions = this.regionsMap.size
      this.loaded = true
    },
  },
})
