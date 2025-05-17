import { defineStore, storeToRefs } from 'pinia'
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { extractValuesFromHtml, sortItems } from '~/assets/js/utils'
import { useCatalogItemPageStore } from './catalog-item-page'
import { useCatalogItemInvPageStore } from './catalog-item-inv-page'
import { useModelsStore } from '../models'
import { computed, ref } from 'vue'
import { ONE_MONTH } from '@/assets/js/timesToMs'

interface BrickLinkItem {
  Number: string
}

function getOptions(type: string) {
  return {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
      'cache-control': 'max-age=0',
      'content-type': 'application/x-www-form-urlencoded',
      priority: 'u=0, i',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    },
    referrer: 'https://www.bricklink.com/catalogDownload.asp',
    referrerPolicy: 'no-referrer-when-downgrade',
    body: `viewType=0&itemType=${type}&selYear=Y&selWeight=Y&selDim=Y&itemTypeInv=S&itemNo=&downloadType=T`,
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
  }
}

function itemKey(itemType: string, item: BrickLinkItem) {
  return itemType + '-' + item.Number
}

const itemTypeMap = new Map<string, string>()
itemTypeMap.set('S', 'Sets')
itemTypeMap.set('P', 'Parts')
itemTypeMap.set('M', 'Minifigures')
itemTypeMap.set('B', 'Books')
itemTypeMap.set('G', 'Gear')
itemTypeMap.set('C', 'Catalogs')

export const useCatalogDownloadPageStore = defineStore('catalogDownloadPageStore', () => {
  const items = ref(new Map<string, Map<string, any>>())
  const itemsArray = computed(() => {
    const values = Array.from(items.value.values()).flatMap((map) => Array.from(map.values()))
    return Array.from(values)
  })
  const filteredItems = computed(() => {
    const catalogItemPage = useCatalogItemPageStore()
    const catalogItemPageRefs = storeToRefs(catalogItemPage)
    const singleItem = catalogItemPageRefs.singleItem
    let out = itemsArray.value
    if (singleItem.value) {
      const catalogItemInvPage = useCatalogItemInvPageStore()
      const invItems = catalogItemInvPage.items
        .get(singleItem.value.itemType)
        ?.get(singleItem.value.itemNumber)
      if (invItems && items.value) {
        out = []
        const uniqueItems = invItems.filter((i, index: number) => {
          const firstIndex = invItems.findIndex(
            (j) => j.itemType === i.itemType && j.itemId === i.itemId,
          )
          return index === firstIndex
        })
        uniqueItems.forEach((invItem) => {
          const typeMap = items.value.get(invItem.itemType)
          if (!typeMap) {
            return
          }
          const item = typeMap.get(invItem.itemId)
          if (!item) {
            return
          }
          const keys = Object.keys(item)
          const dupe = {}
          keys.forEach((key) => (dupe[key] = item[key]))
          dupe.image = invItem.thumbnail
          out.push(dupe)
        })
      }
      // return out;
    }
    const modelsStore = useModelsStore()
    const { filters, search, sorts } = storeToRefs(modelsStore)
    if ((!search.value || search.value === '') && filters.value.length === 0) {
      return out
    }
    const lowerCaseSearch = search.value ? search.value.toLowerCase() : undefined
    const caseMatch = search.value !== lowerCaseSearch
    const filteredCategories = filters.value.filter((f) => f.key === 'category')
    const includedCategoryIds = filteredCategories
      // .filter((f) => f.action === 'include')
      .map((f) => f.value)
    // const excludedCategoryIds = filteredCategories
    //   .filter((f) => f.action === 'exclude')
    //   .map((f) => f.item)
    const filteredItemTypes = filters.value.filter((f) => f.key === 'itemType')
    const includedItemTypeIds = filteredItemTypes
      // .filter((f) => f.action === 'include')
      .map((f) => f.value)
    // const excludedItemTypeIds = filteredItemTypes
    //   .filter((f) => f.action === 'exclude')
    //   .map((f) => f.item)
    out = out.filter((item) => {
      if (search.value) {
        if (caseMatch) {
          if (item.Name.includes(search.value)) {
            return true
          }
          if (item['Category Name'].includes(search.value)) {
            return true
          }
          // if (!singleItem.value) {
          if (includedCategoryIds.length > 0) {
            return includedCategoryIds.includes(item['Category ID'])
            //   } else if (excludedCategoryIds.length > 0) {
            //     return !excludedCategoryIds.includes(item['Category ID'])
            //   }
          }
          return false
        } else {
          if (item.Name.toLowerCase().includes(lowerCaseSearch)) {
            return true
          }
          if (item['Category Name'].toLowerCase().includes(lowerCaseSearch)) {
            return true
          }
          return false
        }
      }
      if (!singleItem.value) {
        if (includedCategoryIds.length > 0) {
          if (!includedCategoryIds.includes(item['Category ID'])) {
            return false
          }
          // } else if (excludedCategoryIds.length > 0) {
          //   if (excludedCategoryIds.includes(item['Category ID'])) {
          //     return false
          //   }
        }
      }
      if (includedItemTypeIds.length > 0) {
        if (!includedItemTypeIds.includes(item.itemType)) {
          return false
        }
        // } else if (excludedItemTypeIds.length > 0) {
        //   if (excludedItemTypeIds.includes(itemType)) {
        //     return false
        //   }
      }
      return true
    })
    sortItems(out, sorts.value)
    return out
  })
  async function fetchItemPage(type: string) {
    return await makeTextCall(
      Call.GET_CATALOG_DOWNLOAD_PAGE,
      'https://www.bricklink.com/catalogDownload.asp?a=a',
      getOptions(type),
      undefined,
      ONE_MONTH,
    )
  }
  async function handlePageResponse(detail: EventDetail) {
    const response = detail.response
    const rows = response.split('\n').map((row: string) => row.replaceAll('\r', '').split('\t'))
    const headers = rows.splice(0, 1)[0]
    const itemType = extractValuesFromHtml(detail.request.options.body, 'itemType=', '&')[0]
    const localItems = rows
      .filter((row) => row.length === headers.length)
      .map((row) => {
        const out = {
          itemType,
        }
        headers.forEach((header, index) => {
          out[header] = row[index]
        })
        out.id = itemKey(itemType, out)
        if (itemType === 'S') {
          out.image = `https://img.bricklink.com/ItemImage/${itemType}T/0/${out.Number}.t2.png`
        } else {
          out.image = `https://img.bricklink.com/ItemImage/${itemType}L/${out.Number}.png`
        }
        out.weight = out['Weight (in Grams)']
        return out
      })
    const map = new Map<string, any>()
    localItems.forEach((item) => {
      map.set(item.Number, item)
    })
    items.value.set(itemType, map)
  }

  // return
  return {
    fetchItemPage,
    filteredItems,
    items,
    itemTypeMap,
    itemsArray,
    handlePageResponse,
  }
})
