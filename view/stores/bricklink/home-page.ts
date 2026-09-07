import { ONE_YEAR } from '@/assets/js/timesToMs'
import { defineStore } from 'pinia'
import { Call, makeTextCall } from '~/assets/js/make-call'
import { extractValueFromHtml } from '~/assets/js/utils'

interface ItemTypeSummary {
  id: string
  label: string
  count: number
  image?: string
}

export const useHomePageStore = defineStore('homePageStore', {
  state: () => ({
    itemTypes: new Map<string, ItemTypeSummary>(),
    sets: 0,
    parts: 0,
    minifigures: 0,
    MOCs: 0,
    loaded: false,
  }),
  actions: {
    async fetch() {
      makeTextCall(
        Call.GET_HOME_PAGE,
        'https://www.bricklink.com/v2/main.page',
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
        ONE_YEAR,
      )
    },
    handleFetchResponse(response: string) {
      const sets = extractValueFromHtml(
        response,
        ['<span class="p-name">Sets</span>', '<span class="p-meta">'],
        ' items',
      )
      this.sets = Number.parseInt(sets[0][0].replace(',', ''))
      const parts = extractValueFromHtml(
        response,
        ['<span class="p-name">Parts</span>', '<span class="p-meta">'],
        ' items',
      )
      this.parts = Number.parseInt(parts[0][0].replace(',', ''))
      const minifigures = extractValueFromHtml(
        response,
        ['<span class="p-name">Minifigures</span>', '<span class="p-meta">'],
        ' items',
      )
      this.minifigures = Number.parseInt(minifigures[0][0].replace(',', ''))
      const MOCs = extractValueFromHtml(
        response,
        ['<span class="p-name">MOCs</span>', '<span class="p-meta">'],
        ' items',
      )
      this.MOCs = Number.parseInt(MOCs[0][0].replace(',', ''))
      this.loaded = true
    },
  },
})
