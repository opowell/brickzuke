import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml, sortItems } from '~/assets/js/utils'
import { useCatalogItemPageStore } from './catalog-item-page'
import { ONE_DAY } from '@/assets/js/timesToMs'
import { useModelsStore } from '../models'

export interface ItemInventory {
  quantity: number
  itemVariant: ItemVariant
}

export interface ItemVariant {
  itemType: string
  itemId: string
  name: string
  thumbnail: string
  colorId?: string
  colorName?: string
  catType: string
  catString: string
  variantId: string
  categoryName: string
}

export const useCatalogItemInvPageStore = defineStore('catalogItemInvPageStore', () => {
  const itemVariants = ref(new Map<string, Map<string, ItemVariant[]>>())
  const itemInventories = ref(new Map<string, Map<string, ItemInventory[]>>())
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
      undefined,
      ONE_DAY,
    )
  }
  const filteredItemVariants = computed<ItemVariant[] | undefined>(() => {
    const catalogItemPage = useCatalogItemPageStore()
    const catalogItemPageRefs = storeToRefs(catalogItemPage)
    const singleItem = catalogItemPageRefs.singleItem
    if (!singleItem.value) {
      return
    }
    let variants = itemVariants.value
      .get(singleItem.value.itemType)
      ?.get(singleItem.value.itemNumber)
    console.log('filteredItemVariants', singleItem.value?.itemType, singleItem.value?.itemNumber)
    const modelsStore = useModelsStore()
    const { filters, sorts } = storeToRefs(modelsStore)
    console.log('filteredItemVariants', itemVariants.value, variants, filters)
    const colorFilters = filters.value.filter((f) => f.key === 'color').map((f) => f.value)
    const categoryFilters = filters.value.filter((f) => f.key === 'category').map((f) => f.value)
    variants = variants?.filter((variant) => {
      if (colorFilters.length > 0) {
        if (!variant.colorId) {
          return false
        }
        if (!colorFilters.includes(variant.colorId)) {
          return false
        }
      }
      if (categoryFilters.length > 0) {
        if (!categoryFilters.includes(variant.catString)) {
          return false
        }
      }
      return true
    })
    if (!!variants) {
      sortItems(variants, sorts.value)
    }
    return variants
  })
  const filteredItemInventories = computed<ItemInventory[] | undefined>(() => {
    const catalogItemPage = useCatalogItemPageStore()
    const catalogItemPageRefs = storeToRefs(catalogItemPage)
    const singleItem = catalogItemPageRefs.singleItem
    if (!singleItem.value) {
      return
    }
    let invItems = itemInventories.value
      .get(singleItem.value.itemType)
      ?.get(singleItem.value.itemNumber)
    const modelsStore = useModelsStore()
    const { filters, sorts } = storeToRefs(modelsStore)
    const colorFilters = filters.value.filter((f) => f.key === 'color').map((f) => f.value)
    const categoryFilters = filters.value.filter((f) => f.key === 'category').map((f) => f.value)
    invItems = invItems?.filter((invItem) => {
      const variant = invItem.itemVariant
      if (colorFilters.length > 0) {
        if (!variant.colorId) {
          return false
        }
        if (!colorFilters.includes(variant.colorId)) {
          return false
        }
      }
      if (categoryFilters.length > 0) {
        if (!categoryFilters.includes(variant.catString)) {
          return false
        }
      }
      return true
    })
    if (!!invItems) {
      sortItems(invItems, sorts.value)
    }
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
    console.log(listHtml, detail)
    if (!listHtml) {
      return
    }
    const rowsHtml = extractValueFromHtml(listHtml, 'class="IV_', '</TR>')
    const parsedInvItems: ItemInventory[] = rowsHtml.map((row: string) => {
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
      const name = params[1]
      let colorId = undefined
      let colorName = undefined
      if (row.includes('idColor=')) {
        colorId = extractValuesFromHtml(
          row,
          'idColor=', // colorId
          '"',
        )[0]
        const variantName = extractValuesFromHtml(
          row,
          '</A></TD><TD><B>', // variantName
          '</B>',
        )[0]
        if (!!variantName) {
          colorName = variantName.replace(name, '').trim()
        }
      }

      const itemId = params[0]
      return {
        quantity: Number.parseInt(params[3]),
        itemVariant: {
          itemType: params[4],
          itemId,
          name,
          thumbnail: params[2],
          colorId,
          colorName,
          catType: params[5],
          catString: params[6],
          categoryName: params[7],
          variantId: itemId + '-' + colorId,
        },
      }
    })
    let variantMap = itemVariants.value.get(itemType)
    if (!variantMap) {
      variantMap = new Map<string, ItemVariant[]>()
      itemVariants.value.set(itemType, variantMap)
    }
    variantMap.set(
      urlParams[1],
      parsedInvItems.map((ii) => ii.itemVariant),
    )
    let invMap = itemInventories.value.get(itemType)
    if (!invMap) {
      invMap = new Map<string, ItemInventory[]>()
      itemInventories.value.set(itemType, invMap)
    }
    invMap.set(urlParams[1], parsedInvItems)
  }
  return {
    fetchItemPage,
    handlePageResponse,
    itemInventories,
    itemVariants,
    filteredItemVariants,
    filteredItemInventories,
  }
})
