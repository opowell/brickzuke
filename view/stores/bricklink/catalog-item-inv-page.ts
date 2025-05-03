import { defineStore } from 'pinia'
import { Call, makeTextCall, type EventDetail } from '~/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml } from '~/assets/js/utils'

interface BrickLinkItem {
  Number: string
}

function itemKey(itemType: string, item: BrickLinkItem) {
  return itemType + '-' + item.Number
}

export const useCatalogItemInvPageStore = defineStore('catalogItemInvPageStore', {
  state: () => ({
    items: new Map<string, Map<string, any>>(),
  }),
  actions: {
    async fetchItemPage(type: string, itemId: string) {
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
    },
    async handlePageResponse(detail: EventDetail) {
      const urlParams = extractValuesFromHtml(detail.request.url, ['?', ''], ['=', ''])
      const itemType = urlParams[0]
      const response = detail.response
      const listHtml = extractValuesFromHtml(
        response,
        '<TABLE BORDER="0" CELLPADDING="3" CELLSPACING="0" WIDTH="100%" CLASS="ta">',
        '<!-- Classic Contents End-->',
      )[0]
      const rowsHtml = extractValueFromHtml(listHtml, 'class="IV_', '</TR>')
      const items = rowsHtml.map((row) => {
        const params = extractValuesFromHtml(
          row,
          [
            '', // item number
            'Name: ', // item name
            "SRC='", // thumbnail
            '<TD ALIGN="RIGHT">&nbsp;', // quantity
            'itemType=', // itemType
          ],
          [' ', '"', "'", '&nbsp;', '"'],
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
        }
      })
      let typeMap = this.items.get(itemType)
      if (!typeMap) {
        typeMap = new Map<string, any>()
        this.items.set(itemType, typeMap)
      }
      typeMap.set(urlParams[1], items)
    },
  },
})
