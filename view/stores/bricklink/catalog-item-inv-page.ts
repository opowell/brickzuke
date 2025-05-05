import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml } from '~/assets/js/utils'
import { useCatalogItemPageStore } from './catalog-item-page'

interface ItemVariant {
  itemType: string
  itemId: string
  name: string
  thumbnail: string
  quantity: number
  colorId: string
  catType: string
  catString: string
}

export const useCatalogItemInvPageStore = defineStore('catalogItemInvPageStore', () => {
  const items = ref(new Map<string, Map<string, ItemVariant[]>>())
  async function fetchItemPage(type: string, itemId: string) {
    return await makeTextCall(
      Call.GET_CATALOG_ITEM_INV_PAGE,
      `https://www.bricklink.com/catalogItemInv.asp?${type}=${itemId}`,
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
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
        },
        referrerPolicy: 'no-referrer-when-downgrade',
        body: null,
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
      },
    )
  }
  const filteredItemVariants = computed(() => {
    const catalogItemPage = useCatalogItemPageStore()
    const catalogItemPageRefs = storeToRefs(catalogItemPage)
    const singleItem = catalogItemPageRefs.singleItem
    if (!singleItem.value) {
      return
    }
    const itemVariants = items.value
      .get(singleItem.value.itemType)
      ?.get(singleItem.value.itemNumber)
      ?.map((invItem) => {
        return {
          ...invItem,
          quantity: undefined,
        }
      })
    return itemVariants
  })
  const filteredItemInventories = computed(() => {
    const catalogItemPage = useCatalogItemPageStore()
    const catalogItemPageRefs = storeToRefs(catalogItemPage)
    const singleItem = catalogItemPageRefs.singleItem
    if (!singleItem.value) {
      return
    }
    const invItems = items.value.get(singleItem.value.itemType)?.get(singleItem.value.itemNumber)
    return invItems
  })
  async function handlePageResponse(detail: EventDetail) {
    const urlParams = extractValuesFromHtml(detail.request.url, ['?', ''], ['=', ''])
    const itemType = urlParams[0]
    const response = detail.response
    const listHtml = extractValuesFromHtml(
      response,
      '<TABLE BORDER="0" CELLPADDING="3" CELLSPACING="0" WIDTH="100%" CLASS="ta">',
      '<!-- Classic Contents End-->',
    )[0]
    const rowsHtml = extractValueFromHtml(listHtml, 'class="IV_', '</TR>')
    const parsedInvItems = rowsHtml.map((row: string) => {
      const params = extractValuesFromHtml(
        row,
        [
          '', // item number
          'Name: ', // item name
          "SRC='", // thumbnail
          '<TD ALIGN="RIGHT">&nbsp;', // quantity
          'itemType=', // itemType
          'catType=', // catType
          'catString=', // catString
          '>', // categoryName
        ],
        [' ', '"', "'", '&nbsp;', '"', '&', "'", '<'],
      )
      let colorId = undefined
      if (row.includes('idColor=')) {
        colorId = extractValuesFromHtml(
          row,
          'idColor=', // colorId
          '"',
        )[0]
      }

      return {
        itemType: params[4],
        itemId: params[0],
        name: params[1],
        thumbnail: params[2],
        quantity: Number.parseInt(params[3]),
        colorId,
        catType: params[5],
        catString: params[6],
        categoryName: params[7],
      }
    })
    let typeMap = items.value.get(itemType)
    if (!typeMap) {
      typeMap = new Map<string, ItemVariant[]>()
      items.value.set(itemType, typeMap)
    }
    typeMap.set(urlParams[1], parsedInvItems)
  }
  return {
    fetchItemPage,
    handlePageResponse,
    items,
    filteredItemVariants,
    filteredItemInventories,
  }
})
