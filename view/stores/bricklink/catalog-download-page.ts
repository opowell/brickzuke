import { defineStore, storeToRefs } from 'pinia'
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { extractValuesFromHtml, sortItems } from '~/assets/js/utils'
import { useCatalogItemPageStore } from './catalog-item-page'
import { useCatalogItemInvPageStore } from './catalog-item-inv-page'
import { useModelsStore } from '../models'
import { computed, ref } from 'vue'
import { ONE_MONTH } from '@/assets/js/timesToMs'
import { getDbConnection } from '../../../idb/idb'
import stores, { type StoreDefinition } from '../../../idb/stores'
import { get, getAll, put } from '../../../idb/db'
import { BRICK_LINK_CATALOG } from './catalog-codes'

export interface BrickLinkItem {
  image: string
  itemType: string
  id: string
  Name: string
  Number: string
  itemId: number
  'Category ID': string
  categoryId?: string
  weight: string
  'Weight (in Grams)': string
  'Category Name': string
}

export interface Item {
  brickLinkItems?: BrickLinkItem[]
  id: number
}

export interface UiItem extends Item {
  score: number
  image: any
  category: string
  name: string
  itemTypeId: string
  itemTypeName: string
}

export interface ItemType {
  brickLinkItemTypes?: BrickLinkItemType[]
  name?: string
  countItems?: number
  categories?: number
  id: number
}

export interface Color {
  yearTo?: number
  yearFrom?: number
  countForSale?: number
  brickLinkColors?: BrickLinkColor[]
  name?: string
  countParts?: number
  countSets?: number
  countItems?: number
  countWanted?: number
  image?: string
  id: number
}

export interface Category {
  name?: string
  brickLinkCategories?: BrickLinkCategory[] | undefined
  id?: number
  items?: number
  type?: string
}

interface PartAndColorCode {
  id: number
}

interface BrickLinkPartAndColorCode {
  id: number
}

export interface BrickLinkItemType {
  'Item Type ID': string
  'Item Type Name': string
  itemTypeId: string
  bzItemTypeId?: number
  categories?: number
}
export interface BrickLinkColor {
  image?: string
  Parts: string
  Wanted: string
  'For Sale': string
  'In Sets': string
  'colorId': string
  'bzColorId': string
  'Color Name': string
  'Year From': string
  'Year To': string
}
export interface BrickLinkCategory {
  items?: number
  categoryId: string
  type?: string
  bzCategoryId: number
  'Category Name': string
}
function getOptions(itemType: string, viewType: number = 0) {
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
    body: `viewType=${viewType}&itemType=${itemType}&selYear=Y&selWeight=Y&selDim=Y&itemTypeInv=S&itemNo=&downloadType=T`,
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
    const modelsStore = useModelsStore()
    const {
      filters, search, sorts 
    } = storeToRefs(modelsStore)
    if (singleItem.value) {
      const catalogItemInvPage = useCatalogItemInvPageStore()
      const invItems = catalogItemInvPage.itemInventories
        .get(singleItem.value.itemType)
        ?.get(singleItem.value.itemNumber)
      if (invItems && items.value) {
        out = []
        const uniqueItems = invItems.filter((i, index: number) => {
          const firstIndex = invItems.findIndex(
            (j) =>
              j.itemVariant.itemType === i.itemVariant.itemType &&
              j.itemVariant.itemId === i.itemVariant.itemId,
          )
          return index === firstIndex
        })
        const filteredCategories = filters.value.filter((f) => f.key === 'category')
        const includedCategoryIds = filteredCategories.map((f) => f.value)
        uniqueItems.forEach((invItem) => {
          const typeMap = items.value.get(invItem.itemVariant.itemType)
          if (!typeMap) {
            return
          }
          const item = typeMap.get(invItem.itemVariant.itemId)
          if (!item) {
            return
          }
          if (includedCategoryIds.length > 0) {
            if (!includedCategoryIds.includes(invItem.itemVariant.catString)) {
              return
            }
          }
          const keys = Object.keys(item)
          const dupe = {}
          keys.forEach((key) => (dupe[key] = item[key]))
          dupe.image = invItem.itemVariant.thumbnail
          out.push(dupe)
        })
      }
      // return out;
    }
    if ((!search.value || search.value === '') && filters.value.length === 0) {
      return out
    }
    const lowerCaseSearch = search.value ? search.value.toLowerCase() : undefined
    const caseMatch = search.value !== lowerCaseSearch
    const filteredCategories = filters.value.filter((f) => f.key === 'category')
    const includedCategoryIds = filteredCategories.map((f) => f.value)
    const filteredItemTypes = filters.value.filter((f) => f.key === 'itemType')
    const includedItemTypeIds = filteredItemTypes.map((f) => f.value)
    out = out.filter((item) => {
      if (search.value) {
        if (includedCategoryIds.length > 0) {
          if (!includedCategoryIds.includes(item['Category ID'])) {
            return false
          }
        }
        if (caseMatch) {
          if (item.Name.includes(search.value)) {
            return true
          }
        } else {
          if (item.Name.toLowerCase().includes(lowerCaseSearch)) {
            return true
          }
        }
        if (item['Category Name'].includes(search.value)) {
          return true
        }
        return false
      }
      if (!singleItem.value) {
        if (includedCategoryIds.length > 0) {
          if (!includedCategoryIds.includes(item['Category ID'])) {
            return false
          }
        }
      }
      if (includedItemTypeIds.length > 0) {
        if (!includedItemTypeIds.includes(item.itemType)) {
          return false
        }
      }
      return true
    })
    sortItems(out, sorts.value)
    return out
  })
  async function fetchItemPage(itemType: string) {
    return await makeTextCall(
      Call.GET_CATALOG_DOWNLOAD_PAGE,
      'https://www.bricklink.com/catalogDownload.asp?a=a',
      getOptions(itemType),
      {
        itemType 
      },
      ONE_MONTH,
    )
  }
  async function fetchCatalogTree(itemType: string) {
    return await makeTextCall(
      Call.GET_CATALOG_TREE_PAGE,
      'https://www.bricklink.com/catalogTree.asp?itemType=' + itemType,
      getOptions(itemType),
      {
        itemType 
      },
      ONE_MONTH,
    )
  }
  async function fetchViewType(viewType: number) {
    return await makeTextCall(
      Call.GET_CATALOG_DOWNLOAD_PAGE,
      'https://www.bricklink.com/catalogDownload.asp?a=a',
      getOptions('S', viewType),
      {
        viewType
      },
      ONE_MONTH,
    )
  }
  async function handlePageResponse(detail: EventDetail) {
    console.log('Handling catalog download page response for view type:', detail.request.extraParams?.viewType)
    switch (detail.request.extraParams?.viewType) {
      case BRICK_LINK_CATALOG.ITEM_TYPES:
        await handleItemTypes(detail)
        break
      case BRICK_LINK_CATALOG.COLORS:
        await handleColors(detail)
        break
      case BRICK_LINK_CATALOG.CATEGORIES:
        await handleCategories(detail)
        break
      case BRICK_LINK_CATALOG.PART_AND_COLOR_CODES:
        await handlePartAndColorCodes(detail)
        break
      default:
        await handleCatalogItems(detail)
        break
    }
  }
  async function handleDownload<S, T>(
    detail: EventDetail,
    store: StoreDefinition,
    brickLinkStore: StoreDefinition,
    idField: string,
    bzIdField: string,
    brickLinkObjectIdField: string
  ) {
    const response = detail.response
    const rows = response.split('\n').map((row: string) => row.replaceAll('\r', '').split('\t'))
    const headers = rows.splice(0, 1)[0]
    const objects = rows
      .filter((row: string[]) => row.length === headers.length)
      .map((row: string[]) => {
        const out: { [key: string]: string } = {}
        headers.forEach((header: string, index: number) => {
          out[header] = row[index]
        })
        return out
      })
    const db = await getDbConnection()
    for (let i = 0; i < objects.length; i++) {
      const brickLinkObject = objects[i]
      const id = brickLinkObject[brickLinkObjectIdField]
      const existingBzObject = await get<S>(db, store, id)
      let bzId
      if (existingBzObject) {
        bzId = existingBzObject[bzIdField]
      } else {
        bzId = await put<S>(db, store, {})
      }
      if (!bzId || typeof bzId !== 'number') {
        console.log('not number, stop')
        return
      }
      brickLinkObject[bzIdField] = bzId
      brickLinkObject[idField] = id
      delete brickLinkObject[brickLinkObjectIdField]
      await put<T>(db, brickLinkStore, brickLinkObject)
    }
    db.close()
  }
  async function handleItemTypes(detail: EventDetail) {
    const response = await handleDownload<ItemType, BrickLinkItemType>(
      detail,
      stores.ITEM_TYPES,
      stores.BRICK_LINK_ITEM_TYPES,
      'itemTypeId',
      'bzItemTypeId',
      'Item Type ID'
    )
    const db = await getDbConnection()
    const brickLinkItemTypes = await getAll<BrickLinkItemType>(db, stores.BRICK_LINK_ITEM_TYPES)
    db.close()
    if (brickLinkItemTypes) {
      for (let i = 0; i < brickLinkItemTypes?.length; i++) {
        const type = brickLinkItemTypes[i].itemTypeId
        await fetchItemPage(type)
      }
    }
    return response
  }
  async function updateCatalogTree() {
    const db = await getDbConnection()
    const brickLinkItemTypes = await getAll<BrickLinkItemType>(db, stores.BRICK_LINK_ITEM_TYPES)
    db.close()
    if (!brickLinkItemTypes) {
      return
    }
    for (let i = 0; i < brickLinkItemTypes?.length; i++) {
      const type = brickLinkItemTypes[i].itemTypeId
      await fetchCatalogTree(type)
    }
  }
  async function handleColors(detail: EventDetail) {
    return await handleDownload<Color, BrickLinkColor>(
      detail,
      stores.COLORS,
      stores.BRICK_LINK_COLORS,
      'colorId',
      'bzColorId',
      'Color ID'
    )
  }
  async function handleCategories(detail: EventDetail) {
    return await handleDownload<Category, BrickLinkCategory>(
      detail,
      stores.CATEGORIES,
      stores.BRICK_LINK_CATEGORIES,
      'categoryId',
      'bzCategoryId',
      'Category ID'
    )
  }
  async function handlePartAndColorCodes(detail: EventDetail) {
    return await handleDownload<PartAndColorCode, BrickLinkPartAndColorCode>(
      detail,
      stores.PART_AND_COLOR_CODES,
      stores.BRICK_LINK_PART_AND_COLOR_CODES,
      'partAndColorCodeId',
      'bzPartAndColorCodeId',
      'Code'
    )
  }
  async function handleCatalogItems(detail: EventDetail) {
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
        out.categoryId = out['Category ID']
        return out
      })
    const map = new Map<string, any>()
    const db = await getDbConnection()
    for (let i = 0; i < localItems.length; i++) {
      const brickLinkItem = localItems[i]
      // map.set(brickLinkItem.Number, brickLinkItem)
      console.log(brickLinkItem.Number, brickLinkItem)
      const itemId = await put<Item>(db, stores.ITEMS, { })
      if (!itemId || typeof itemId !== 'number') {
        console.log('not number, stop')
        return
      }
      brickLinkItem.bzItemId = itemId
      await put<BrickLinkItem>(db, stores.BRICK_LINK_ITEMS, brickLinkItem)
    }
    db.close()

    items.value.set(itemType, map)
  }

  // return
  return {
    fetchItemPage,
    fetchViewType,
    filteredItems,
    items,
    itemTypeMap,
    itemsArray,
    handlePageResponse,
    updateCatalogTree
  }
})
