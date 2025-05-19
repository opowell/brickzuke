import { defineStore, storeToRefs } from 'pinia'
import { Call, makeTextCall } from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml, sortItems } from '~/assets/js/utils'
import { useCatalogItemInvPageStore } from './catalog-item-inv-page'
import { useCatalogItemPageStore } from './catalog-item-page'
import { useModelsStore } from '../models'
import { ONE_YEAR } from '@/assets/js/timesToMs'

export interface BrickLinkColor {
  cssCode: string
  colorID: string
  colorName: string
  countParts: number
  countSets: number
  countItems: number
}
export const useColorsPageStore = defineStore('colorsPageStore', {
  state: () => ({
    loaded: false,
    colors: new Map<string, BrickLinkColor>(),
  }),
  getters: {
    colorsArray(state): BrickLinkColor[] {
      return Array.from(state.colors.values())
    },
    filteredColors(state): BrickLinkColor[] {
      const modelsStore = useModelsStore()
      const { search, sorts } = storeToRefs(modelsStore)
      const catalogItemPage = useCatalogItemPageStore()
      const catalogItemPageRefs = storeToRefs(catalogItemPage)
      const singleItem = catalogItemPageRefs.singleItem
      if (singleItem.value) {
        const out: BrickLinkColor[] = []
        const catalogItemInvPage = useCatalogItemInvPageStore()
        const invItems =
          catalogItemInvPage.itemVariants
            .get(singleItem.value.itemType)
            ?.get(singleItem.value.itemNumber) || []
        const activeColors = new Map<string, boolean>()
        invItems.forEach((ii) => {
          if (!ii.colorId) {
            return
          }
          activeColors.set(ii.colorId, true)
        })
        const itemVariants = catalogItemPage.itemVariants.get(
          singleItem.value.itemType + '-' + singleItem.value.itemNumber,
        )
        itemVariants?.forEach((iv) => {
          activeColors.set(iv.colorId, true)
        })
        const keys = Array.from(activeColors.keys())
        keys.forEach((key) => {
          const color = state.colors.get(key)
          if (!color) {
            return
          }
          out.push(color)
        })
        sortItems(out, sorts.value)
        return out
      }
      if (!search.value || search.value === '') {
        return this.colorsArray
      }
      const lowerCaseSearch = search.value.toString().toLowerCase()
      const caseMatch = search.value !== lowerCaseSearch
      const out = this.colorsArray.filter((color: BrickLinkColor) => {
        if (caseMatch && search.value) {
          return color.colorName.includes(search.value?.toString())
        }
        return color.colorName.toLowerCase().includes(lowerCaseSearch)
      })
      sortItems(out, sorts.value)
      return out
    },
  },
  actions: {
    async fetchColorsPage() {
      makeTextCall(
        Call.GET_COLORS_PAGE,
        'https://www.bricklink.com/catalogColors.asp',
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
      const count = extractValueFromHtml(
        response,
        ['Color Guide', '<CENTER><TABLE BORDER="0"', '<TR'],
        ['<!-- Classic Contents End-->', '</CENTER>', '</TR>'],
      )
      const flatted = count.flat(2).filter((row: string) => !row.startsWith(' HEIGHT='))
      const values: BrickLinkColor[] = flatted.map((row: string) => {
        const params = extractValuesFromHtml(
          row,
          [
            '<TD BGCOLOR="', // cssCode
            'colorID=', // colorID
            '<FONT FACE="Tahoma,Arial" SIZE="2">', // colorName
            '<A HREF="/catalogList.asp?catType=P&colorPart=',
            '>', // count parts
            '<A HREF="/catalogList.asp?catType=S&colorInSet=',
            '>', // count sets
          ],
          ['">', '">', '&nbsp;</TD>', '"', '</A>', '"', '</A>'],
        )
        return {
          cssCode: params[0],
          colorID: params[1],
          colorName: params[2],
          countParts: params.length === 7 ? Number.parseInt(params[4]) : 0,
          countSets: params.length === 7 ? Number.parseInt(params[6]) : 0,
          countItems:
            params.length === 7 ? Number.parseInt(params[4]) + Number.parseInt(params[6]) : 0,
        }
      })
      values.forEach((value) => {
        this.colors.set(value.colorID, value)
      })
      this.loaded = true
    },
  },
})
