import { Call, makeTextCall } from '@/assets/js/make-call'
import { extractValueFromHtml, extractValuesFromHtml } from '../../view/assets/js/utils'
import { ONE_YEAR } from '@/assets/js/timesToMs'

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
  forms.forEach(form => {
    const itemType = extractValueFromHtml(
      form,
      '<a href="/catalogTree.asp?itemType=',
      '">',
    )
    console.log(itemType)
    const options: string[] = extractValueFromHtml(
      form,
      "<OPTION VALUE='",
      '</OPTION>',
    )
    const splitOptions = options.map(option => {
      const parts = option.split("'>")
      return {
        brickLinkCategoryId: parts[0],
        brickLinkCategoryName: parts[1],
      }
    })
    console.log(splitOptions)
  })
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
