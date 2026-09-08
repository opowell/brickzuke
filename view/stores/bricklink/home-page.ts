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

/**
 * What the front page counts, keyed by the code the catalogue carries for it.
 *
 * MOCs are counted there beside the catalogue's own types and have no
 * one-letter code of their own, so they are keyed by name.
 */
const HOME_PAGE_ITEM_TYPES: {
  id: string
  label: string
}[] = [
  {
    id: 'S',
    label: 'Sets'
  },
  {
    id: 'P',
    label: 'Parts'
  },
  {
    id: 'M',
    label: 'Minifigures'
  },
  {
    id: 'MOC',
    label: 'MOCs'
  },
]

/**
 * The number the front page states beside one type's name.
 *
 * Absent rather than zero when the page states none: a type the page has
 * stopped listing is not a type with nothing in it.
 */
function countOf(response: string, label: string): number | undefined {
  const found = extractValueFromHtml(
    response,
    [`<span class="p-name">${label}</span>`, '<span class="p-meta">'],
    ' items',
  )
  const stated = found?.[0]?.[0]
  if (!stated) {
    return undefined
  }
  const count = Number.parseInt(stated.replaceAll(',', ''))
  return Number.isFinite(count) ? count : undefined
}

export const useHomePageStore = defineStore('homePageStore', {
  state: () => ({
    itemTypes: new Map<string, ItemTypeSummary>(),
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
      HOME_PAGE_ITEM_TYPES.forEach((itemType) => {
        const count = countOf(response, itemType.label)
        if (count === undefined) {
          return
        }
        this.itemTypes.set(itemType.id, {
          id: itemType.id,
          label: itemType.label,
          count,
        })
      })
      this.loaded = true
    },
  },
})
