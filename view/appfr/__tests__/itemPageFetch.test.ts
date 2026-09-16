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
  imagesFor, storeInventoriesFor
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
function answering(delays: { page: number; images: number; lots: number }, lots: object[]) {
  const sent: string[] = []
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
      response = {
        list: lots
      }
      delay = delays.lots
    } else {
      return
    }
    sent.push(call)
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
