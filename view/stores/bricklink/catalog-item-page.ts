import { defineStore, storeToRefs } from 'pinia'
import {
  Call,
  makeJsonCall,
  makeTextCall,
  processQueue,
  type EventDetail,
} from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml } from '~/assets/js/utils'
import { useModelsStore } from '../models'
import { ONE_DAY, ONE_WEEK } from '@/assets/js/timesToMs'

interface ImagesResponse extends EventDetail {
  request: {
    call: Call
    url: string
    options: { body?: string }
    extraParams: {
      itemType: string
    }
  }
  response: {
    item: {
      strItemNoFull: string
      imglist: {
        main_url: string
      }[]
    }
  }
}

interface InventoriesResponse extends EventDetail {
  request: {
    call: Call
    url: string
    options: { body?: string }
    extraParams: {
      itemNumber: string
      itemType: string
    }
  }
  response: {
    list: {
      idColor: string
      idInv: string
      strDesc: string
      mDisplaySalePrice: string
      strStorename: string
      strSellerCountryCode: string
      strSellerCountryName: string
      codeNew: string
      n4Qty: number
      n4SellerFeedbackScore: number
      idInvImg: number
    }[]
  }
}

function getInventoriesUrl(itemId: string) {
  return `https://www.bricklink.com/ajax/clone/catalogifs.ajax?itemid=${itemId}&ss=AT&rpp=500&iconly=0`
}

function getImagesUrl(itemId: string) {
  return `https://www.bricklink.com/ajax/renovate/catalog/getItemImageList.ajax?idItem=${itemId}&idColor=-1&bIncludeAssoc=1`
}
function getPageUrl(type: string, itemNumber: string) {
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?${type}=${itemNumber}#T=${type}&O={%22ss%22:%22AT%22,%22rpp%22:%22500%22,%22iconly%22:0}`
  // return `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${catItemId}#T=S&O={%22iconly%22:0}`
}

function getOptions(itemType: string, itemId: string) {
  return {
    headers: {
      accept: '*/*',
      'accept-language': 'en,de;q=0.9,es;q=0.8,en-US;q=0.7',
      priority: 'u=1, i',
      'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-requested-with': 'XMLHttpRequest',
    },
    referrer: `https://www.bricklink.com/v2/catalog/catalogitem.page?${itemType}=${itemId}`,
    referrerPolicy: 'no-referrer-when-downgrade',
    body: null,
    method: 'GET',
    mode: 'cors',
    credentials: 'include',
  }
}

export interface ItemInfo {
  yearReleased?: string
  weight?: string
  dimensions?: string
  instructions?: string
}

interface Item {
  itemType: string
  itemName: string
  itemNumber: string
  yearReleased?: string
  weight?: string
  dimensions?: string
  instructions?: string
  categories: string
}

interface Color {
  colorId: string
  cssCode: string
  name: string
  image: string
  sets: number
}

export const useCatalogItemPageStore = defineStore('catalogItemPageStore', {
  state: () => ({
    imagesMap: new Map<string, any>(),
    inventoriesMap: new Map<string, any[]>(),
    itemsMap: new Map<string, Item>(),
    itemVariants: new Map<string, Map<string, Color>>(),
  }),
  getters: {
    singleItem(state): Item | undefined {
      const { itemIds } = useModelsStore()
      if (!itemIds || itemIds.length !== 1) {
        return
      }
      return state.itemsMap.get(itemIds[0])
    },
    filteredImages(state) {
      if (this.singleItem) {
        const { itemIds } = useModelsStore()
        if (!itemIds || itemIds.length !== 1) {
          return
        }
        const images = state.imagesMap.get(itemIds[0])
        return images
      }
      return []
    },
    filteredInventories(state) {
      if (this.singleItem) {
        const { itemIds } = useModelsStore()
        if (!itemIds || itemIds.length !== 1) {
          return
        }
        const inventories = state.inventoriesMap.get(itemIds[0])
        return inventories
      }
      return []
    },
  },
  actions: {
    async fetchImages(itemNumber: string, itemId: string, itemType: string) {
      return await makeJsonCall(
        Call.GET_CATALOG_ITEM_IMAGES,
        getImagesUrl(itemId),
        getOptions(itemType, itemNumber),
        {
          itemType,
        },
        ONE_WEEK,
      )
    },
    async fetchInventories(itemNumber: string, itemId: string, itemType: string) {
      return await makeJsonCall(
        Call.GET_CATALOG_ITEM_INVENTORIES,
        getInventoriesUrl(itemId),
        getOptions(itemType, itemNumber),
        {
          itemType,
          itemId,
          itemNumber,
        },
        ONE_DAY,
      )
    },
    async fetchItemPage(type: string, itemId: string) {
      return await makeTextCall(
        Call.GET_CATALOG_ITEM_PAGE,
        getPageUrl(type, itemId),
        getOptions(type, itemId),
        undefined,
        ONE_WEEK,
      )
    },
    async handleInventoriesResponse(detail: InventoriesResponse) {
      console.log('handleInventoriesResponse', detail)
      const itemNumber = detail.request.extraParams?.itemNumber
      const itemType = detail.request.extraParams?.itemType
      if (!detail.response.list) {
        return
      }
      let storeInventories = detail.response.list.map((i) => {
        let image =
          'https://img.bricklink.com/ItemImage/' +
          itemType +
          'T/' +
          i.idColor +
          '/' +
          itemNumber +
          '.t1.png'
        if (i.idInvImg !== 0) {
          image = 'https://www.bricklink.com/myImg/' + i.idInvImg + '.jpg'
        }
        return {
          invId: i.idInv,
          description: i.strDesc,
          price: i.mDisplaySalePrice,
          sellerCountryCode: i.strSellerCountryCode,
          sellerCountryName: i.strSellerCountryName,
          sellerStoreName: i.strStorename,
          condition: i.codeNew,
          quantity: i.n4Qty,
          sellerFeedbackScore: i.n4SellerFeedbackScore,
          image,
        }
      })
      const modelsStore = useModelsStore()
      const { sorts } = storeToRefs(modelsStore)
      if (sorts.value.length > 0) {
        console.log('sort')
        storeInventories = storeInventories.sort((a, b) => {
          for (let i = 0; i < sorts.value.length; i++) {
            const sort = sorts.value[i]
            if (a[sort.key] === b[sort.key]) {
              continue
            }
            if (sort.dir === 'a') {
              if (a[sort.key] > b[sort.key]) {
                return 1
              } else {
                return -1
              }
            } else if (sort.dir === 'd') {
              if (a[sort.key] < b[sort.key]) {
                return 1
              } else {
                return -1
              }
            }
          }
        })
      }
      this.inventoriesMap.set(itemType + '-' + itemNumber, storeInventories)
    },
    async handleImagesResponse(detail: ImagesResponse) {
      const itemNumber = detail.response.item.strItemNoFull
      const itemType = detail.request.extraParams?.itemType
      const images = detail.response.item.imglist.map((i) => {
        return {
          id: i.main_url,
          image: 'https:' + i.main_url,
        }
      })
      if (
        images[0].image.includes('/' + itemType + 'N/') &&
        images[1].image.includes('/' + itemType + 'L/')
      ) {
        images.splice(1, 1)
      }
      this.imagesMap.set(itemType + '-' + itemNumber, images)
    },
    async handlePageResponse(detail: EventDetail) {
      const categories = extractValueFromHtml(
        detail.response,
        ['<A href="//www.bricklink.com/catalogList.asp?catType=', 'catString='],
        ['<', '"'],
      ).flat()

      let idSelector = 'S='
      if (detail.request.url.includes('P=')) {
        idSelector = 'P='
      }
      const params = extractValuesFromHtml(
        detail.request.url,
        [
          idSelector, // itemNumber
          'T=', // item type,
        ],
        ['#', '&'],
      )
      const itemId = extractValuesFromHtml(
        detail.response,
        'getItemQty.ajax?nItemId=',
        '&nColorId',
      )[0]
      const itemName = extractValuesFromHtml(
        detail.response,
        '<h1 id="item-name-title" style="font-size:16px;margin:0;display:inline-block;">',
        '</h1>',
      )[0]
      const itemInfosHtml = extractValuesFromHtml(
        detail.response,
        '<strong>Item Info</strong>',
        '</font>',
      )[0]
      const itemInfos = extractValuesFromHtml(
        itemInfosHtml,
        [
          'itemYear=', // yearReleased
          'item-weight-info">', // weight
          'dimSec">', // dimensions
          'Instructions: ', // instructions
        ],
        ["'", '</span>', '</span>', '\r'],
      )
      const itemType = params[1]
      const itemNumber = params[0]
      let weight = itemInfos[1]
      if (weight === '?') {
        weight = undefined
      }
      const itemKey = itemType + '-' + itemNumber
      if (itemType === 'P') {
        const colorSection = extractValuesFromHtml(
          detail.response,
          '<div class="pciColorTitle">Known Colors:</div><br>',
          '<br>',
        )[0]
        const colors = extractValueFromHtml(
          colorSection,
          '<div style="display:flex;">',
          '</div></div>',
        )
        let variantsMap = this.itemVariants.get(itemKey)
        if (!variantsMap) {
          variantsMap = new Map<string, Color>()
          this.itemVariants.set(itemKey, variantsMap)
        }
        colors.forEach((color: string) => {
          const values = extractValuesFromHtml(
            color,
            ['background-color: #', 'colorID=', '">', '('],
            ['">', '&', '</a>', ')'],
          )
          const cssCode: string = values[0]
          const colorId: string = values[1]
          const name: string = values[2]
          const sets = Number.parseInt(values[3])
          const image =
            'https://img.bricklink.com/ItemImage/PT/' + colorId + '/' + itemNumber + '.t1.png'
          variantsMap.set(colorId, {
            colorId,
            cssCode,
            name,
            sets,
            image,
          })
        })
      }
      this.itemsMap.set(itemType + '-' + itemNumber, {
        itemType,
        itemName,
        itemNumber,
        yearReleased: itemInfos[0],
        weight,
        dimensions: itemInfos[2],
        instructions: itemInfos[3],
        categories,
      })
      this.fetchImages(itemNumber, itemId, itemType)
      this.fetchInventories(itemNumber, itemId, itemType)
      processQueue(2)
    },
  },
})
