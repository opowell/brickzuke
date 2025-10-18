import { getDbConnection } from '../../../idb/idb'

import { useCatalogItemPageStore } from '@/stores/bricklink/catalog-item-page'
import { useCatalogListPageStore } from '@/stores/bricklink/catalog-list-page'
import STORES from '../../../idb/stores'
import { get, put, getAllFromIndex, deleteQueuedCall } from '../../../idb/db'
export interface QueuedCall {
  id: number
  callType: CallType
  call: Call
  url: string
  options: object
  extraParams?: object
  storageTime?: number
}
import indices from '../../../idb/indices'
import { useCatalogDownloadPageStore } from '@/stores/bricklink/catalog-download-page'
import { useCatalogItemInvPageStore } from '@/stores/bricklink/catalog-item-inv-page'
import { useCatalogPageStore } from '@/stores/bricklink/catalog-page'
import { useColorsPageStore } from '@/stores/bricklink/colors-page'
import { useHomePageStore } from '@/stores/bricklink/home-page'
import { useSearchAdvancedPageStore } from '@/stores/bricklink/search-advanced-page'
import { useStoresPageStore } from '@/stores/bricklink/stores-page'
import { handleResponse as handleColorGuidePageResponse } from '../../../sources/bricklink/color-guide'
import catalogTreePage from '@/stores/bricklink/catalog-tree-page'
export enum Call {
  GET_PRICES = 0,
  GET_HOME_PAGE = 1,
  GET_STORES_PAGE = 2,
  GET_COUNTRY_STORES_PAGE = 'https://www.bricklink.com/browseStores.asp',
  GET_COLORS_PAGE = 'https://www.bricklink.com/catalogColors.asp',
  GET_COLOR_GUIDE_PAGE = 'https://v2.bricklink.com/en-us/catalog/color-guide',
  GET_CATALOG_PAGE = 'https://www.bricklink.com/catalog.asp',
  GET_CATALOG_DOWNLOAD_PAGE = 'https://www.bricklink.com/catalogDownload.asp',
  GET_CATALOG_TREE_PAGE = 'https://www.bricklink.com/catalogTree.asp',
  GET_CATALOG_ITEM_PAGE = 'https://www.bricklink.com/catalogitem.page',
  GET_CATALOG_ITEM_IMAGES = 'https://www.bricklink.com/ajax/renovate/catalog/getItemImageList.ajax',
  GET_CATALOG_ITEM_INV_PAGE = 'https://www.bricklink.com/catalogItemInv.asp',
  GET_CATALOG_ITEM_INVENTORIES = 'https://www.bricklink.com/ajax/clone/catalogifs.ajax?itemid=',
  GET_CATALOG_LIST_PAGE = 'https://www.bricklink.com/catalogList.asp',
  GET_CATALOG_LIST_PAGE_ALL = 'https://www.bricklink.com/catalogList.asp#all',
  GET_CATALOG_LIST_PAGE_FIRST_ONLY = 'https://www.bricklink.com/catalogList.asp#first-only',
  GET_SEARCH_ADVANCED_PAGE = 'https://www.bricklink.com/searchAdvanced.asp',
}
export enum CallType {
  JSON = 'json',
  TEXT = 'text',
  SCRAPE = 'scrape'
}
export async function makeTextCall(
  call: Call,
  url: string,
  options: object,
  extraParams?: object,
  storageTime?: number,
) {
  return await queueCall(CallType.TEXT, call, url, options, extraParams, storageTime)
}
export async function makeScrapeCall(
  call: Call,
  url: string,
  options: object,
  extraParams?: object,
  storageTime?: number,
) {
  return await queueCall(CallType.SCRAPE, call, url, options, extraParams, storageTime)
}
export async function makeTextCalls(
  calls: { call: Call; url: string; options: object; extraParams?: object; storageTime?: number }[],
) {
  return await queueCalls(CallType.TEXT, calls)
}
export async function makeJsonCall(
  call: Call,
  url: string,
  options: object,
  extraParams?: object,
  storageTime?: number,
) {
  return await queueCall(CallType.JSON, call, url, options, extraParams, storageTime)
}
export interface EventDetail {
  request: {
    responseType: string
    call: Call
    url: string
    options: { body?: string }
    extraParams?: { [key: string]: string | number }
    storageTime?: number
  }
  response: any
}
export function handleEvent(detail: EventDetail) {
  console.log('handleEvent', detail)
  document.dispatchEvent(new CustomEvent('pulse'))
  try {
    switch (detail.request.call) {
      case Call.GET_HOME_PAGE: {
        const homePage = useHomePageStore()
        homePage.handleFetchResponse(detail.response)
        return
      }
      case Call.GET_STORES_PAGE: {
        const storesPage = useStoresPageStore()
        storesPage.handleFetchResponse(detail.response)
        return
      }
      case Call.GET_COUNTRY_STORES_PAGE: {
        const storesPage = useStoresPageStore()
        storesPage.handleCountryStoresResponse(detail)
        return
      }
      case Call.GET_COLOR_GUIDE_PAGE: {
        handleColorGuidePageResponse(detail.response)
        return
      }
      case Call.GET_COLORS_PAGE: {
        const colorsPage = useColorsPageStore()
        colorsPage.handleFetchResponse(detail.response)
        return
      }
      case Call.GET_CATALOG_PAGE: {
        const catalogPage = useCatalogPageStore()
        catalogPage.handleFetchResponse(detail.response)
        return
      }
      case Call.GET_CATALOG_TREE_PAGE: {
        catalogTreePage.handlePageResponse(detail)
        return
      }
      case Call.GET_CATALOG_DOWNLOAD_PAGE: {
        const catalogPage = useCatalogDownloadPageStore()
        catalogPage.handlePageResponse(detail)
        return
      }
      case Call.GET_CATALOG_ITEM_PAGE: {
        const catalogItemPage = useCatalogItemPageStore()
        catalogItemPage.handlePageResponse(detail)
        return
      }
      case Call.GET_CATALOG_ITEM_INV_PAGE: {
        const catalogItemInvPage = useCatalogItemInvPageStore()
        catalogItemInvPage.handlePageResponse(detail)
        return
      }
      case Call.GET_CATALOG_ITEM_INVENTORIES: {
        const catalogItemPage = useCatalogItemPageStore()
        catalogItemPage.handleInventoriesResponse(detail)
        return
      }
      case Call.GET_CATALOG_ITEM_IMAGES: {
        const catalogItemPage = useCatalogItemPageStore()
        catalogItemPage.handleImagesResponse(detail)
        return
      }
      case Call.GET_CATALOG_LIST_PAGE: {
        const catalogListPage = useCatalogListPageStore()
        catalogListPage.handleFetchResponse(detail, true)
        return
      }
      case Call.GET_CATALOG_LIST_PAGE_ALL: {
        const catalogListPage = useCatalogListPageStore()
        catalogListPage.handleFetchResponseAll(detail)
        return
      }
      case Call.GET_CATALOG_LIST_PAGE_FIRST_ONLY: {
        const catalogListPage = useCatalogListPageStore()
        catalogListPage.handleFetchResponse(detail, false)
        return
      }
      case Call.GET_SEARCH_ADVANCED_PAGE: {
        const store = useSearchAdvancedPageStore()
        store.handleFetchResponse(detail.response)
        return
      }
    }
  } catch (e) {
    console.log('ERROR handling response', detail, e)
  }
}

export async function processQueue(reps = 1) {
  const db = await getDbConnection()
  const queuedCalls = await getAllFromIndex<QueuedCall>(db, indices.QUEUED_CALLS_BY_DATE)
  if (!queuedCalls) {
    return
  }
  queuedCalls.reverse()
  let callsMade = 0
  for (let i = 0; i < queuedCalls.length; i++) {
    const queuedCall = queuedCalls[i]
    const cached = await makeCall(
      queuedCall.callType,
      queuedCall.call,
      queuedCall.url,
      queuedCall.options,
      queuedCall.extraParams,
      queuedCall.storageTime,
    )
    await deleteQueuedCall(db, queuedCall.id)
    if (!cached) {
      callsMade++
      if (callsMade >= reps) {
        break
      }
    }
  }
}

export async function queueCalls(
  callType: CallType,
  callObjects: {
    call: Call
    url: string
    options: object
    extraParams?: object
    storageTime?: number
  }[],
) {
  const db = await getDbConnection()
  const callsToQueue = []
  for (let i = 0; i < callObjects.length; i++) {
    const callObject = callObjects[i]
    const url = callObject.url
    const options = callObject.options
    const value = await get<Call>(db, STORES.CALLS, callKey(url, options, callObject.extraParams))
    if (value) {
      const call = callObject.call
      handleEvent({
        request: {
          call,
          url,
          options,
        },
        response: value.response,
      })
    } else {
      callsToQueue.push(callObject)
    }
  }
  for (let i = callsToQueue.length - 1; i >= 0; i--) {
    const callObject = callObjects[i]
    const url = callObject.url
    const call = callObject.call
    const options = callObject.options
    const extraParams = callObject.extraParams
    const storageTime = callObject.storageTime
    await put(db, STORES.QUEUED_CALLS, {
      callType,
      call,
      url,
      options,
      extraParams,
      date: new Date(),
      storageTime,
    })
  }
}

export function callKey(url: string, options: { body?: string }, extraParams?: object) {
  let out = url
  if (options?.body) {
    out += '#' + options.body
  }
  if (extraParams) {
    out += '#' + JSON.stringify(extraParams)
  }
  return out
}

/**
 * @param callType - the type of call to be made, either json or text.
 * @param call - which call is being made
 * @param url - the url to call
 * @param options - extra options to pass to the fetch request
 * @param extraParams - extra params to associate with this call
 * @param storageTime - how long to store the response of this call
 * @returns
 *
 */
export async function queueCall(
  callType: CallType,
  call: Call,
  url: string,
  options: object,
  extraParams?: object,
  storageTime?: number,
) {
  const db = await getDbConnection()
  const value = await get(db, STORES.CALLS, callKey(url, options, extraParams))
  // If the call is already stored, return the stored response.
  if (value) {
    handleEvent({
      request: {
        responseType: callType,
        call,
        url,
        options,
        extraParams,
      },
      response: value.response,
    })
    return true
  }
  // Otherwise put the call in the queue.
  await put(db, STORES.QUEUED_CALLS, {
    callType,
    call,
    url,
    options,
    extraParams,
    date: new Date(),
    storageTime,
  })
  return false
}

export async function makeCall(
  type: CallType,
  call: Call,
  url: string,
  options: object,
  extraParams?: object,
  storageTime?: number,
): Promise<boolean> {
  const db = await getDbConnection()
  const value = await get(db, STORES.CALLS, callKey(url, options, extraParams))
  // If the call is already stored, return the stored response.
  if (value) {
    handleEvent({
      request: {
        call,
        url,
        options,
        extraParams,
      },
      response: value.response,
    })
    return true
  }
  // Otherwise dispatch the call to the server.
  console.log('dispatch', url)
  document.dispatchEvent(
    new CustomEvent('bzClientToServer', {
      detail: {
        callType: 'fetch',
        responseType: type,
        call,
        url,
        options,
        extraParams,
        storageTime,
      },
    }),
  )
  return false
}
