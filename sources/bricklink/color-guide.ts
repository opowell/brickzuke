import { ONE_YEAR } from '@/assets/js/timesToMs'
import { extractValueFromHtml, extractValuesFromHtml } from '@/assets/js/utils'
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

export const handleResponse = function(response: string) {
      const count = extractValueFromHtml(
        response,
        ['Color Guide', '<CENTER><TABLE BORDER="0"', '<TR'],
        ['<!-- Classic Contents End-->', '</CENTER>', '</TR>'],
      )
      const flatted = count.flat(2).filter((row: string) => !row.startsWith(' HEIGHT='))
      const values: BrickLinkColor[] = flatted.map((row: string) => {
        const params = extractValuesFromHtml(
          row,
          [
            '<TD BGCOLOR="', // cssCode
            'colorID=', // colorID
            '<FONT FACE="Tahoma,Arial" SIZE="2">', // colorName
            '<A HREF="/catalogList.asp?catType=P&colorPart=',
            '>', // count parts
            '<A HREF="/catalogList.asp?catType=S&colorInSet=',
            '>', // count sets
          ],
          ['">', '">', '&nbsp;</TD>', '"', '</A>', '"', '</A>'],
        )

        const secondParamsStarts = []
        const secondParamsEnds = []
        const countWantedSkip = '<A HREF="/catalogList.asp?catType=P&viewWanted=Y&colorWanted='
        const hasWantedCount = row.includes(countWantedSkip)
        if (hasWantedCount) {
          secondParamsStarts.push(countWantedSkip, '>')
          secondParamsEnds.push('"', '</A>')
        }
        const countForSaleSkip = '<A HREF="/browseList.asp?colorID='
        const hasForSaleCount = row.includes(countForSaleSkip)
        if (hasForSaleCount) {
          secondParamsStarts.push(countForSaleSkip, '>')
          secondParamsEnds.push('"', '</A>')
        }
        const secondParams = extractValuesFromHtml(
          row,
          [...secondParamsStarts, '<FONT FACE="Tahoma,Arial" SIZE="2">&nbsp;'],
          [...secondParamsEnds, '&nbsp;</TD>'],
        )
        let secondParamsIndex = 0
        let countWanted = 0
        if (hasWantedCount) {
          secondParamsIndex++
          countWanted = Number.parseInt(secondParams[secondParamsIndex])
          secondParamsIndex++
        }
        let countForSale = 0
        if (hasForSaleCount) {
          secondParamsIndex++
          countForSale = Number.parseInt(secondParams[secondParamsIndex])
          secondParamsIndex++
        }
        const yearText = secondParams[secondParamsIndex]
        let yearStart = undefined
        let yearEnd = undefined
        if (!yearText.includes('?')) {
          const parts = yearText.replaceAll('&nbsp;', '').split('-')
          yearStart = parts[0]
          yearEnd = parts[1]
        }
        if (secondParams)
          return {
            cssCode: params[0],
            colorID: params[1],
            colorName: params[2],
            countParts: params.length === 7 ? Number.parseInt(params[4]) : 0,
            countSets: params.length === 7 ? Number.parseInt(params[6]) : 0,
            countItems:
              params.length === 7 ? Number.parseInt(params[4]) + Number.parseInt(params[6]) : 0,
            countWanted,
            countForSale,
            yearStart,
            yearEnd,
          }
      })
  console.log(values)
      values.forEach((value) => {
        // this.colors.set(value.colorID, value)
      })
      // this.loaded = true
    }
