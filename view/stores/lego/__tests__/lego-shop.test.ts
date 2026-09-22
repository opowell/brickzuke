/**
 * LEGO's shop, read into lots.
 *
 * The answers below are LEGO.com's own, trimmed, as its GraphQL endpoint gave
 * them for the German shop on 2026-09-22 — Orchid on sale, Galaxy Explorer
 * retired, Pick a Brick's 2x4 brick in two colours. The handlers run against
 * `fake-indexeddb` through brickzuke's own `getDbConnection`, so the stores
 * and key paths are the real ones.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('../../../../model', async () => {
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

const lego = await import('../lego-shop')
const {
  Call
} = await import('../../../assets/js/make-call')
const {
  getDbConnection
} = await import('../../../../idb/idb')
const STORES = (await import('../../../../idb/stores')).default

const ORCHID = {
  productCode: '10311',
  name: 'Orchid',
  variant: {
    price: {
      centAmount: 4999,
      currencyCode: 'EUR'
    },
    attributes: {
      availabilityStatus: 'E_AVAILABLE',
      availabilityText: 'Available now',
      maxOrderQuantity: 5
    }
  }
}

const GALAXY_EXPLORER = {
  productCode: '10497',
  name: 'Galaxy Explorer',
  variant: {
    price: {
      centAmount: 9999,
      currencyCode: 'EUR'
    },
    attributes: {
      availabilityStatus: 'R_RETIRED',
      availabilityText: 'Retired product',
      maxOrderQuantity: 5
    }
  }
}

/** A gift card: several prices, so no one variant. */
const GIFT_CARD = {
  productCode: '5006215',
  name: 'Gift Card'
}

const WHITE_2X4 = {
  id: '300101',
  designId: '3001',
  name: 'BRICK 2X4',
  availability: 'AVAILABLE',
  maxOrderQuantity: null,
  price: {
    centAmount: 21,
    currencyCode: 'EUR'
  }
}

const WARM_PINK_2X4 = {
  id: '6583487',
  designId: '3001',
  name: 'BRICK 2X4',
  availability: 'OUT_OF_STOCK',
  maxOrderQuantity: null,
  price: {
    centAmount: 21,
    currencyCode: 'EUR'
  }
}

const ORCHID_ITEM = {
  Name: 'Orchid',
  Number: '10311-1'
}

const CODES = new Map([
  ['300101', {
    code: '300101',
    record: 'P-3001',
    itemNumber: '3001',
    colorName: 'White',
    colorId: '1'
  }],
  ['6583487', {
    code: '6583487',
    record: 'P-3001',
    itemNumber: '3001',
    colorName: 'Warm Pink',
    colorId: '247'
  }]
])

describe('legoLocale', () => {
  it('is the English shop of the Ship to country', () => {
    expect(lego.legoLocale('DE')).toBe('en-DE')
    expect(lego.legoLocale('nl')).toBe('en-NL')
  })

  it('is no shop without a country', () => {
    expect(lego.legoLocale('')).toBeUndefined()
    expect(lego.legoLocale(undefined)).toBeUndefined()
  })
})

describe('printedPrice', () => {
  it('prints a price the way BrickLink prints a converted one', () => {
    expect(lego.printedPrice({
      centAmount: 4999,
      currencyCode: 'EUR'
    })).toBe('EUR 49.99')
    expect(lego.printedPrice({
      centAmount: 5,
      currencyCode: 'USD'
    })).toBe('US $0.05')
  })
})

describe('orderable', () => {
  it('takes available, pre-order and backorder as things LEGO will sell now', () => {
    expect(lego.orderable('E_AVAILABLE')).toBe(true)
    expect(lego.orderable('A_PRE_ORDER_FOR_DATE')).toBe(true)
    expect(lego.orderable('F_BACKORDER_FOR_DATE')).toBe(true)
  })

  it('takes nothing else as orderable, an unknown status included', () => {
    for (const status of ['D_COMING_SOON', 'H_OUT_OF_STOCK', 'K_SOLD_OUT', 'R_RETIRED', 'Z_NEW_THING', undefined]) {
      expect(lego.orderable(status)).toBe(false)
    }
  })
})

describe('productCodeOf', () => {
  it('is the set number for the first variant, and nothing for anything else', () => {
    expect(lego.productCodeOf('S-10311-1')).toBe('10311')
    expect(lego.productCodeOf('S-10311-2')).toBeUndefined()
    expect(lego.productCodeOf('P-3001')).toBeUndefined()
  })
})

describe('productLot', () => {
  it('is a lot of LEGO’s under the BrickLink set, at LEGO’s price', () => {
    const lot = lego.productLot(ORCHID, 'en-DE', ORCHID_ITEM)
    expect(lot).toMatchObject({
      id: 'lego-S-10311-1',
      store: 'LEGO.com',
      record: 'S-10311-1',
      itemType: 'S',
      itemNumber: '10311-1',
      itemName: 'Orchid',
      condition: 'N',
      quantity: 5,
      price: 49.99,
      displayPrice: 'EUR 49.99',
      nativePrice: 'EUR 49.99',
      description: 'Available now',
      locale: 'en-DE'
    })
  })

  it('keeps a retired set’s price, with none of it on offer', () => {
    const lot = lego.productLot(GALAXY_EXPLORER, 'en-DE', {
      Name: 'Galaxy Explorer',
      Number: '10497-1'
    })
    expect(lot?.price).toBe(99.99)
    expect(lot?.quantity).toBe(0)
    expect(lot?.description).toBe('Retired product')
  })

  it('is nothing for a product with no one price, or no BrickLink set to file it under', () => {
    expect(lego.productLot(GIFT_CARD, 'en-DE', ORCHID_ITEM)).toBeUndefined()
    expect(lego.productLot(ORCHID, 'en-DE', undefined)).toBeUndefined()
  })
})

describe('elementLots', () => {
  it('files each element under the BrickLink part and colour it is', () => {
    const lots = lego.elementLots([WHITE_2X4, WARM_PINK_2X4], CODES, new Map([['P-3001', 'Brick 2 x 4']]), 'en-DE')
    expect(lots).toHaveLength(2)
    expect(lots[0]).toMatchObject({
      id: 'lego-300101',
      store: 'LEGO.com',
      record: 'P-3001',
      itemType: 'P',
      itemNumber: '3001',
      itemName: 'Brick 2 x 4',
      colorId: '1',
      colorName: 'White',
      condition: 'N',
      price: 0.21,
      displayPrice: 'EUR 0.21',
      quantity: lego.UNSTATED_QUANTITY,
      description: 'Element 300101',
      image: 'https://img.bricklink.com/ItemImage/PN/1/3001.png'
    })
  })

  it('offers none of an element that is out of stock, and says so', () => {
    const [, pink] = lego.elementLots([WHITE_2X4, WARM_PINK_2X4], CODES, new Map(), 'en-DE')
    expect(pink.quantity).toBe(0)
    expect(pink.description).toBe('Element 6583487, out of stock')
    // LEGO's own name where the catalogue has none for the part.
    expect(pink.itemName).toBe('BRICK 2X4')
  })

  it('takes LEGO’s own limit where it states one', () => {
    const [lot] = lego.elementLots([{
      ...WHITE_2X4,
      maxOrderQuantity: 200
    }], CODES, new Map(), 'en-DE')
    expect(lot.quantity).toBe(200)
  })

  it('leaves out an element BrickLink has no number for', () => {
    expect(lego.elementLots([{
      ...WHITE_2X4,
      id: '9999999'
    }], CODES, new Map(), 'en-DE')).toEqual([])
  })
})

describe('the handlers', () => {
  beforeAll(async () => {
    const db = await getDbConnection()
    await db.put(STORES.BRICK_LINK_ITEMS.name, {
      id: 'S-10311-1',
      itemType: 'S',
      Name: 'Orchid',
      Number: '10311-1'
    })
    await db.put(STORES.BRICK_LINK_ITEMS.name, {
      id: 'P-3001',
      itemType: 'P',
      Name: 'Brick 2 x 4',
      Number: '3001'
    })
    for (const code of CODES.values()) {
      await db.put(STORES.ELEMENT_CODES.name, code)
    }
    db.close()
  })

  /** A response as the extension hands it over. */
  function detail(call: string, extraParams: object, response: unknown) {
    return {
      request: {
        type: 'json',
        call,
        url: 'https://www.lego.com/api/graphql/X',
        options: {},
        extraParams
      },
      response
    } as never
  }

  it('stores a set’s price as a lot of LEGO’s, and notes the answer', async () => {
    await lego.handleLegoProductResponse(detail(Call.GET_LEGO_PRODUCT, {
      locale: 'en-DE',
      record: 'S-10311-1'
    }, {
      data: {
        product: ORCHID
      }
    }))
    const db = await getDbConnection()
    const lot = await db.get(STORES.STORE_LOTS.name, 'lego-S-10311-1')
    db.close()
    expect(lot).toMatchObject({
      store: 'LEGO.com',
      record: 'S-10311-1',
      price: 49.99
    })
    expect(lego.legoAnswers.get(lego.answerKey(Call.GET_LEGO_PRODUCT, 'en-DE', 'S-10311-1'))).toBe(1)
  })

  it('notes an answer with nothing in it, so that nobody waits for more', async () => {
    await lego.handleLegoProductResponse(detail(Call.GET_LEGO_PRODUCT, {
      locale: 'en-DE',
      record: 'S-10179-1'
    }, {
      data: {
        product: null
      }
    }))
    expect(lego.legoAnswers.get(lego.answerKey(Call.GET_LEGO_PRODUCT, 'en-DE', 'S-10179-1'))).toBe(0)
  })

  it('stores a part’s elements under the part that was asked about', async () => {
    await lego.handleLegoElementsResponse(detail(Call.GET_LEGO_ELEMENTS, {
      locale: 'en-DE',
      record: 'P-3001',
      ask: 0
    }, {
      data: {
        searchElements: {
          total: 2,
          count: 2,
          results: [WHITE_2X4, WARM_PINK_2X4]
        }
      }
    }))
    const db = await getDbConnection()
    const white = await db.get(STORES.STORE_LOTS.name, 'lego-300101')
    db.close()
    expect(white).toMatchObject({
      record: 'P-3001',
      colorId: '1',
      itemName: 'Brick 2 x 4'
    })
    expect(lego.legoAnswers.get(lego.answerKey(Call.GET_LEGO_ELEMENTS, 'en-DE', 'P-3001#0'))).toBe(2)
  })

  it('keeps count of how far the shop is stored, page by page', async () => {
    await lego.handleLegoSetPageResponse(detail(Call.GET_LEGO_SET_PAGE, {
      locale: 'en-DE',
      page: 1
    }, {
      data: {
        productListing: {
          pagination: {
            currentPage: 1,
            totalPages: 64,
            displayedProducts: 22,
            totalProducts: 1533
          },
          tiles: [{}, {
            product: ORCHID
          }, {
            product: GIFT_CARD
          }]
        }
      }
    }))
    await lego.handleLegoElementPageResponse(detail(Call.GET_LEGO_ELEMENT_PAGE, {
      locale: 'en-DE',
      page: 1
    }, {
      data: {
        searchElements: {
          total: 16647,
          count: 2,
          results: [WHITE_2X4, WARM_PINK_2X4]
        }
      }
    }))
    const scope = await lego.readLegoScope('en-DE')
    expect(scope).toMatchObject({
      store: 'LEGO.com',
      locale: 'en-DE',
      sets: 1533,
      setPages: 64,
      setPagesFetched: 1,
      setsSeen: 22,
      elements: 16647,
      elementPages: Math.ceil(16647 / lego.ELEMENT_PAGE_SIZE),
      elementPagesFetched: 1,
      elementsSeen: 2,
      lots: 1533 + 16647,
      fetchedLots: 24
    })
    // Another shop's scope is not this one's.
    expect((await lego.readLegoScope('en-CH')).setPagesFetched).toBe(0)
  })
})
