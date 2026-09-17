/**
 * Getting an item's lots when they are not loaded: one page opened, two
 * answers behind it, and a caller that waits for the one it asked for.
 *
 * The bridge to BrickLink is faked here the way the extension answers it — a
 * `bzServerToClient` for every `bzClientToServer` — so what is asserted is
 * the app's own half: which calls go out, and when a caller is told the
 * answer is in. The case worth pinning is the two answers landing apart. The
 * pictures are one call and the lots another, and a wait that ended on
 * either handed the table an empty page that then closed for good.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../../model', async () => {
  const {
    ref: r
  } = await import('vue')
  return {
    filters: r([]),
    search: r(undefined),
    selectedItemType: r(null),
    itemTypes: r([]),
    processingCounts: r(false),
    selectedCounts: r(undefined),
  }
})

const {
  imagesFor,
  lotAsksFor,
  narrowedLotsFill,
  narrowedLotsVersion,
  narrowedStoreInventoriesFor,
  readStoreInventories,
  storeInventoriesFor
} = await import('../itemPageFetch')
const {
  useCatalogItemPageStore
} = await import('../../stores/bricklink/catalog-item-page')

/** The page as `handlePageResponse` reads it: the numeric id, the name, a colour. */
function pageFor(number: string): string {
  return `<html><body>
<a href="//www.bricklink.com/catalogList.asp?catType=P&catString=5">Brick</a>
<h1 id="item-name-title" style="font-size:16px;margin:0;display:inline-block;">Brick ${number}</h1>
<strong>Item Info</strong> <span itemYear='1999'</span> <span class="item-weight-info">1.2g</span> <span class="dimSec">1 x 1</span> Instructions: none\r</font>
<script>getItemQty.ajax?nItemId=99${number}&nColorId</script>
<div class="pciColorTitle">Known Colors:</div><br><div style="display:flex;"><span style="background-color: #ff0000"><a href="x?colorID=5&">Red</a>(3)</div></div><br>
</body></html>`
}

function lot(id: number, condition: string) {
  return {
    idColor: '5',
    idInv: id,
    strDesc: '',
    mDisplaySalePrice: `EUR 0.0${id}`,
    mInvSalePrice: `US $0.0${id}`,
    strColor: 'Red',
    strSellerCountryCode: 'DE',
    strSellerCountryName: 'Germany',
    strStorename: `Store ${id}`,
    strSellerUsername: `store${id}`,
    codeNew: condition,
    n4Qty: id,
    n4SellerFeedbackScore: 100,
    idInvImg: 0
  }
}

const IMAGES = {
  item: {
    strItemNoFull: '',
    imglist: [
      {
        main_url: '//img.example/PN/x.png'
      },
      {
        main_url: '//img.example/PL/x.png'
      },
      {
        main_url: '//img.example/x.png'
      }
    ]
  }
}

/** The extension, answering each call after its own delay. */
function answering(
  delays: { page: number; images: number; lots: number },
  lots: object[] | ((url: string) => object[] | { list: object[]; total_count: number })
) {
  const sent: string[] = []
  const urls: string[] = []
  const listener = (event: Event) => {
    const request = (event as CustomEvent).detail
    const call = String(request.call)
    let response: unknown
    let delay: number
    if (call.includes('catalogitem.page')) {
      const number = /\?P=([^#&]+)/.exec(request.url)?.[1] ?? ''
      response = pageFor(number)
      delay = delays.page
    } else if (call.includes('getItemImageList')) {
      // The page gave the item a numeric id of `99` and its number; the
      // image list states the number itself, as BrickLink's does.
      response = {
        item: {
          ...IMAGES.item,
          strItemNoFull: /idItem=99([^&]+)/.exec(request.url)?.[1] ?? ''
        }
      }
      delay = delays.images
    } else if (call.includes('catalogifs')) {
      const answer = typeof lots === 'function' ? lots(request.url) : lots
      // A page states how many lots the whole answer has; a fake that only
      // says which lots is one page of exactly those.
      response = Array.isArray(answer)
        ? {
          list: answer,
          total_count: answer.length
        }
        : answer
      delay = delays.lots
    } else {
      return
    }
    sent.push(call)
    urls.push(request.url)
    setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent('bzServerToClient', {
          detail: {
            request,
            response
          }
        })
      )
    }, delay)
  }
  document.addEventListener('bzClientToServer', listener)
  return {
    sent,
    urls,
    stop: () => document.removeEventListener('bzClientToServer', listener)
  }
}

let extension: ReturnType<typeof answering> | undefined

beforeAll(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  extension?.stop()
  extension = undefined
})

describe('an item whose lots are not loaded', () => {
  it('waits for the lots themselves, however early the pictures land', async () => {
    // The pictures answer at once and the lots a good while later — which is
    // the order they arrive in from the real page too, the image list being
    // replayed from the cache in the tick the page is.
    extension = answering({
      page: 10,
      images: 10,
      lots: 150
    }, [lot(1, 'N'), lot(2, 'U')])
    const lots = await storeInventoriesFor('P-3005')
    expect(lots.map((one) => one.invId)).toEqual(['1', '2'])
    // Three calls, once each: the page, and the two the page's own handler
    // queues behind it.
    expect(extension.sent.filter((call) => call.includes('catalogitem.page'))).toHaveLength(1)
    expect(extension.sent.filter((call) => call.includes('catalogifs'))).toHaveLength(1)
  })

  it('is answered by an empty list, and not asked about again', async () => {
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, [])
    expect(await storeInventoriesFor('P-3006')).toEqual([])
    const sentBefore = extension.sent.length
    // Nothing on offer is what the page said, and the page was read: the
    // second ask is the map, not the extension.
    expect(await storeInventoriesFor('P-3006')).toEqual([])
    expect(extension.sent.length).toBe(sentBefore)
    expect(useCatalogItemPageStore().inventoriesMap.has('P-3006')).toBe(true)
  })

  it('hands the pictures to the caller that asked for them, off the same page', async () => {
    extension = answering({
      page: 10,
      images: 100,
      lots: 10
    }, [lot(7, 'N')])
    const [images, lots] = await Promise.all([imagesFor('P-3007'), storeInventoriesFor('P-3007')])
    expect(lots).toHaveLength(1)
    // The list as stored: `PN` and `PL` collapse to one, so two of the three.
    expect(images).toHaveLength(2)
    expect(extension.sent.filter((call) => call.includes('catalogitem.page'))).toHaveLength(1)
  })

  it('has nothing to wait for on a type the page reader cannot parse', async () => {
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, [lot(9, 'N')])
    expect(await storeInventoriesFor('M-sw0001')).toEqual([])
    expect(extension.sent).toHaveLength(0)
  })
})

/*
 * A narrowed ask: the condition and the region put to BrickLink's list rather
 * than taken out of its first page afterwards. What is pinned is the ask
 * itself — the parameters on the wire — that the answer is filed apart from
 * the un-narrowed page and read back with it, and that a region the list
 * takes as two of its own is two asks joined.
 */
describe('an item\'s lots under a narrowing', () => {
  /** Lots as BrickLink answers the narrowing on the wire, by the URL asked. */
  const byAsk = (url: string) => {
    const cond = /cond=([NU])/.exec(url)?.[1]
    const reg = /reg=(\d+)/.exec(url)?.[1]
    if (cond === 'N' && reg === '6') return [lot(31, 'N'), lot(32, 'N')]
    if (cond === 'N' && reg === '3') return [lot(41, 'N')]
    if (cond === 'N' && reg === '4') return [lot(42, 'N')]
    if (!cond && !reg) return [lot(1, 'U'), lot(2, 'N')]
    return []
  }

  it('turns the query\'s words into what the list takes', () => {
    expect(lotAsksFor({
      condition: 'N',
      region: 'Europe'
    })).toEqual([{
      cond: 'N',
      reg: 6
    }])
    expect(lotAsksFor({
      condition: 'N'
    })).toEqual([{
      cond: 'N'
    }])
    // Nothing the list can take is still an ask — the whole list, paged.
    expect(lotAsksFor({})).toEqual([{}])
    expect(lotAsksFor({
      condition: 'New',
      region: 'Atlantis'
    })).toEqual([{}])
  })

  it('asks BrickLink for the condition and the region, off the item\'s page', async () => {
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, byAsk)
    const lots = await narrowedStoreInventoriesFor('P-3010', {
      condition: 'N',
      region: 'Europe'
    })
    expect(lots?.map((one) => one.invId)).toEqual(['31', '32'])
    const asked = extension.urls.filter((url) => url.includes('catalogifs'))
    expect(asked.some((url) => url.includes('cond=N') && url.includes('reg=6'))).toBe(true)
    // Filed under the ask, and the un-narrowed page still where it was.
    const store = useCatalogItemPageStore()
    expect(store.narrowedLotsMap.get('P-3010|cond=N|reg=6')).toHaveLength(2)
    expect(store.inventoriesMap.get('P-3010')?.map((one) => one.invId)).toEqual(['1', '2'])
    // Read back as what browsing gathered: every lot once, from either list.
    expect(readStoreInventories('P-3010').map((one) => one.invId).sort()).toEqual(['1', '2', '31', '32'])
  })

  it('asks twice for a region the list files as two', async () => {
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, byAsk)
    const lots = await narrowedStoreInventoriesFor('P-3011', {
      condition: 'N',
      region: 'Americas'
    })
    expect(lots?.map((one) => one.invId).sort()).toEqual(['41', '42'])
  })

  it('has nothing to say without fetching until the ask has been made', async () => {
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, byAsk)
    const narrowing = {
      condition: 'N',
      region: 'Europe'
    }
    expect(await narrowedStoreInventoriesFor('P-3012', narrowing, false)).toBeUndefined()
    await narrowedStoreInventoriesFor('P-3012', narrowing)
    expect((await narrowedStoreInventoriesFor('P-3012', narrowing, false))?.length).toBe(2)
  })
})

/*
 * The rest of a narrowed answer: the first page is what the table is drawn
 * from, and the fill brings the pages after it while the table is up. The
 * fake's page size is BrickLink's, so a two-page answer is one of more than
 * five hundred lots — stated by `total_count`, which is what the fill counts
 * from.
 */
describe('the rest of a narrowed answer', () => {
  const PAGE = 500
  const pageOf = (first: number, count: number) =>
    Array.from({
      length: count
    }, (_one, at) => lot(first + at, 'N'))

  /** A 700-lot answer: 500 on the first page, 200 on the second. */
  const paged = (url: string) => {
    if (!/cond=N/.test(url) || !/reg=6/.test(url)) {
      return []
    }
    const page = Number(/pi=(\d+)/.exec(url)?.[1] ?? 1)
    return {
      list: page === 1 ? pageOf(1000, PAGE) : page === 2 ? pageOf(2000, 200) : [],
      total_count: 700
    }
  }

  it('draws the table from the first page and fills the second behind it', async () => {
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, paged)
    const narrowing = {
      condition: 'N',
      region: 'Europe'
    }
    const first = await narrowedStoreInventoriesFor('P-3020', narrowing)
    expect(first).toHaveLength(PAGE)
    const store = useCatalogItemPageStore()
    expect(store.narrowedLotsScope.get('P-3020|cond=N|reg=6')).toEqual({
      total: 700,
      pages: 1
    })

    const fill = narrowedLotsFill('P-3020', narrowing)!
    const before = narrowedLotsVersion.value
    await fill.run()
    // One more page, landed and announced — and then no more to ask for.
    expect(narrowedLotsVersion.value).toBe(before + 1)
    expect(store.narrowedLotsScope.get('P-3020|cond=N|reg=6')?.pages).toBe(2)
    expect(await narrowedStoreInventoriesFor('P-3020', narrowing, false)).toHaveLength(700)
    const pages = extension.urls.filter((url) => url.includes('catalogifs') && url.includes('reg=6'))
    expect(pages.filter((url) => url.includes('pi=2'))).toHaveLength(1)
    expect(pages.some((url) => url.includes('pi=3'))).toBe(false)
  }, 15_000)

  it('walks the whole list when the query narrows by nothing, from the page already read', async () => {
    // The page handler's own un-narrowed fetch is the bare ask's first page:
    // one request for it, not two, and the fill carries on from page two.
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, (url) => {
      const page = Number(/pi=(\d+)/.exec(url)?.[1] ?? 1)
      return {
        list: page === 1 ? pageOf(3000, PAGE) : page === 2 ? pageOf(4000, 200) : [],
        total_count: 700
      }
    })
    const first = await narrowedStoreInventoriesFor('P-3030', {})
    expect(first).toHaveLength(PAGE)
    expect(extension.urls.filter((url) => url.includes('catalogifs'))).toHaveLength(1)
    const store = useCatalogItemPageStore()
    expect(store.narrowedLotsScope.get('P-3030|cond=|reg=')).toEqual({
      total: 700,
      pages: 1
    })
    await narrowedLotsFill('P-3030', {}).run()
    expect(await narrowedStoreInventoriesFor('P-3030', {}, false)).toHaveLength(700)
    const asked = extension.urls.filter((url) => url.includes('catalogifs'))
    expect(asked).toHaveLength(2)
    expect(asked[1]).toContain('pi=2')
    // And the un-narrowed read is the whole of it too, each lot once.
    expect(readStoreInventories('P-3030')).toHaveLength(700)
  }, 15_000)

  it('has nothing to fill when the first page was the whole answer', async () => {
    extension = answering({
      page: 10,
      images: 10,
      lots: 10
    }, byAskShort)
    const narrowing = {
      condition: 'N',
      region: 'Europe'
    }
    await narrowedStoreInventoriesFor('P-3021', narrowing)
    const before = narrowedLotsVersion.value
    const sent = extension.urls.length
    await narrowedLotsFill('P-3021', narrowing)!.run()
    expect(narrowedLotsVersion.value).toBe(before)
    expect(extension.urls.length).toBe(sent)
  })

  /** Two lots, and BrickLink saying two: the first page is the answer. */
  function byAskShort(url: string) {
    return /cond=N/.test(url) ? [lot(51, 'N'), lot(52, 'N')] : []
  }
})
