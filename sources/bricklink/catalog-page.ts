import { Call, makeTextCall } from '@/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml } from '../../view/assets/js/utils'
import { ONE_YEAR } from '@/assets/js/timesToMs'
import { getDbConnection } from '../../idb/idb'
import { get, put } from '../../idb/db'
import stores from '../../idb/stores'
import type { BrickLinkCategory, BrickLinkItemType } from '@/stores/bricklink/catalog-download-page'

interface Category {
  id: string
  name: string
}

async function fetchPage() {
  makeTextCall(
    Call.GET_CATALOG_PAGE,
    'https://www.bricklink.com/catalog.asp',
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
}
async function handleFetchResponse(response: string) {
  const forms: string[] = extractValueFromHtml(
    response,
    'action="catalogList.asp">',
    '</select>',
  )
  const db = await getDbConnection()
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i]
    const itemType = extractValueFromHtml(
      form,
      '<a href="/catalogTree.asp?itemType=',
      '">',
    )[0]
    const options: string[] = extractValueFromHtml(
      form,
      "<OPTION VALUE='",
      '</OPTION>',
    )
    for (let j = 0; j < options.length; j++) {
      const option = options[j]
      const parts = option.split("'>")
      const id = parts[0]
      const categoryObject = await get<BrickLinkCategory>(db, stores.BRICK_LINK_CATEGORIES, id)
      if (!categoryObject) {
        continue
      }
      categoryObject.type = itemType
      await put(db, stores.BRICK_LINK_CATEGORIES, categoryObject!)
    }
    const itemTypeObject = await get<BrickLinkItemType>(db, stores.BRICK_LINK_ITEM_TYPES, itemType)
    if (!itemTypeObject) {
      continue
    }
    itemTypeObject.categories = options.length
    await put(db, stores.BRICK_LINK_ITEM_TYPES, itemTypeObject)
  }
  // numCategories = categories.flat().length
  // categories = categories.flat().map((c: string) => {
  //   const parts = c.replace("='", '').split("'>")
  //   return {
  //     id: parts[0],
  //     name: parts[1],
  //   }
  // })
}

export default {
  fetchPage,
  handleFetchResponse
}
