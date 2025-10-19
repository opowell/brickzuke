import { ONE_YEAR } from '@/assets/js/timesToMs'
import type { BrickLinkColor } from '@/stores/bricklink/colors-page'
import { Call, makeScrapeCall } from '~/assets/js/make-call'

export const makeCall = async function() {
  await makeScrapeCall(
    Call.GET_COLOR_GUIDE_PAGE,
    'https://v2.bricklink.com/en-us/catalog/color-guide',
    {
      "headers": {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en,de;q=0.9,es;q=0.8,en-US;q=0.7",
        "priority": "u=0, i",
        "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1"
      },
      "body": null,
      "method": "GET",
      "mode": "cors",
      "credentials": "include"
    },
    undefined,
    ONE_YEAR,
  )
}

export const handleResponse = function(response: BrickLinkColor[]) {
  console.log(response)
  // values.forEach((value) => {
    // this.colors.set(value.colorID, value)
  // })
  // this.loaded = true
}
