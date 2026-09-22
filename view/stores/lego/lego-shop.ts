/**
 * What LEGO sells, and for how much, from LEGO's own shop.
 *
 * LEGO is one more seller here, and its offers are lots like any other
 * seller's: a record, a colour, a condition, a quantity and a price, filed in
 * STORE_LOTS under [LEGO_STORE]. What differs is only where they come from.
 * LEGO.com answers GraphQL queries at `/api/graphql/<name>`, the same ones its
 * own pages make, and answers them to anybody: no sign-in, no cookie, and a
 * browser's request passes the bot check that turns `curl` away. Four of them
 * are asked:
 *
 *   - `product(productCode:)` — one set's price and availability.
 *   - `searchElements` over element numbers — Pick a Brick's price for one
 *     part in every colour LEGO sells it in, one request for all of them.
 *   - `searchElements` a page at a time — the whole of Pick a Brick.
 *   - `productListing` over `/categories/all-sets` — every set in the shop.
 *
 * Which shop is the `x-locale` header — `en-DE` — and prices come back in that
 * country's currency. It is asked in English whatever the country, English
 * being what the rest of the app reads.
 *
 * Not a pinia store: nothing here is view state. The same shape as
 * [store-front-page].
 */
import { Call, makeJsonCall, type EventDetail } from '~/assets/js/make-call'
import { ONE_DAY } from '@/assets/js/timesToMs'
import { get, getAll, put, putAll } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'
import type { StoredStoreLot, StoredStoreScope } from '../bricklink/store-front-page'
import type { BrickLinkItem } from '../bricklink/catalog-download-page'
import type { ElementCode } from '../bricklink/element-codes'
import { itemPicture } from '../bricklink/itemPicture'

/**
 * LEGO's address as a seller — what `store:` names and what its lots are
 * filed under.
 *
 * Not `LEGO`, which is a name a BrickLink seller could have: the dot is what
 * no BrickLink username has, so the one address cannot be two sellers.
 */
export const LEGO_STORE = 'LEGO.com'

/** The name the seller columns draw. */
export const LEGO_NAME = 'LEGO'

const GRAPHQL = 'https://www.lego.com/api/graphql/'

/** The shop for a country — `en-DE` — or none where no country is chosen. */
export function legoLocale(country: string | undefined): string | undefined {
  const code = country?.trim().toUpperCase()
  return code && /^[A-Z]{2}$/.test(code) ? `en-${code}` : undefined
}

/**
 * The most elements one page of Pick a Brick answers with. Asking for more is
 * not refused, only answered with this many.
 */
export const ELEMENT_PAGE_SIZE = 400

/**
 * The most element numbers put to one search. LEGO answers seventy-odd in one
 * request without complaint; a part BrickLink knows two hundred element
 * numbers for is three requests rather than one very long one.
 */
export const ELEMENTS_PER_ASK = 60

/**
 * What a lot of LEGO's is on offer in when LEGO states no limit — Pick a
 * Brick states none for most of its elements. A number, because a lot has
 * one; this one, because it is more than anybody's list asks of one element
 * and so never the reason a line goes unfilled.
 */
export const UNSTATED_QUANTITY = 999

const PRODUCT_FIELDS = `
  productCode
  name
  ... on SingleVariantProduct {
    variant {
      price { centAmount currencyCode }
      attributes { availabilityStatus availabilityText maxOrderQuantity }
    }
  }`

const PRODUCT_QUERY = `query LegoProduct($code: String!) {
  product(productCode: $code) { ${PRODUCT_FIELDS} }
}`

const LISTING_QUERY = `query LegoSetPage($slug: String!, $page: Int) {
  productListing(slug: $slug, page: $page) {
    pagination { currentPage totalPages displayedProducts totalProducts }
    tiles { ... on ProductTile { product { ${PRODUCT_FIELDS} } } }
  }
}`

const ELEMENTS_QUERY = `query LegoElements($input: ElementQueryInput!) {
  searchElements(input: $input) {
    total
    count
    results {
      id
      designId
      name
      availability
      maxOrderQuantity
      price { centAmount currencyCode }
    }
  }
}`

/** Every set in the shop, as the shop's own "All sets" page lists them. */
const ALL_SETS = '/categories/all-sets'

export interface LegoPrice {
  centAmount: number
  currencyCode: string
}

export interface LegoProduct {
  productCode: string
  name: string
  variant?: {
    price?: LegoPrice
    attributes?: {
      availabilityStatus?: string
      availabilityText?: string
      maxOrderQuantity?: number | null
    }
  }
}

export interface LegoElement {
  id: string
  designId: string
  name: string
  availability?: string
  maxOrderQuantity?: number | null
  price?: LegoPrice
}

/** How far LEGO's shop is stored — the seller's scope, with the two lists it is made of. */
export interface LegoStoreScope extends StoredStoreScope {
  /** The shop it was read from; a different one is a different price list. */
  locale: string
  sets?: number
  setPages?: number
  setPagesFetched: number
  setsSeen: number
  elements?: number
  elementPages?: number
  elementPagesFetched: number
  elementsSeen: number
}

/** A LEGO lot, which says which shop its price is from. */
export interface LegoLot extends StoredStoreLot {
  locale: string
}

function options(locale: string, query: string, variables: object) {
  return {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-locale': locale,
    },
    body: JSON.stringify({
      query,
      variables
    }),
    method: 'POST',
    mode: 'cors',
    // Nothing of the viewer's is wanted: the answer is the same for anybody,
    // and a session cookie would make it the viewer's — a member price, say.
    credentials: 'omit',
  }
}

/*
 * The four requests. Each carries the locale in its extra params as well as in
 * its header: the header is what LEGO reads, and the extra params are what the
 * call cache is keyed by, so without them a German price would be replayed to
 * somebody who has since moved their shop to Switzerland.
 */

export async function fetchLegoProduct(locale: string, record: string, code: string) {
  return await makeJsonCall(
    Call.GET_LEGO_PRODUCT,
    GRAPHQL + 'LegoProduct',
    options(locale, PRODUCT_QUERY, {
      code
    }),
    {
      locale,
      record
    },
    // A day, as a seller's lots are held: a price is only true while it is
    // there, and LEGO's change with its sales.
    ONE_DAY,
  )
}

export async function fetchLegoElements(locale: string, record: string, codes: string[], ask: number) {
  return await makeJsonCall(
    Call.GET_LEGO_ELEMENTS,
    GRAPHQL + 'LegoElements',
    options(locale, ELEMENTS_QUERY, {
      input: {
        query: codes.join(' '),
        page: 1,
        perPage: codes.length
      }
    }),
    {
      locale,
      record,
      ask
    },
    ONE_DAY,
  )
}

export async function fetchLegoElementPage(locale: string, page: number) {
  return await makeJsonCall(
    Call.GET_LEGO_ELEMENT_PAGE,
    GRAPHQL + 'LegoElements',
    options(locale, ELEMENTS_QUERY, {
      input: {
        page,
        perPage: ELEMENT_PAGE_SIZE
      }
    }),
    {
      locale,
      page
    },
    ONE_DAY,
  )
}

export async function fetchLegoSetPage(locale: string, page: number) {
  return await makeJsonCall(
    Call.GET_LEGO_SET_PAGE,
    GRAPHQL + 'LegoSetPage',
    options(locale, LISTING_QUERY, {
      slug: ALL_SETS,
      page
    }),
    {
      locale,
      page
    },
    ONE_DAY,
  )
}

/**
 * How a price is printed, the way BrickLink prints a converted one — `EUR
 * 49.99`, `US $49.99` — so that the one reading of a printed price the tables
 * make reads this one too.
 */
export function printedPrice(price: LegoPrice): string {
  const value = (price.centAmount / 100).toFixed(2)
  return price.currencyCode === 'USD' ? `US $${value}` : `${price.currencyCode} ${value}`
}

/**
 * Whether LEGO will take an order for it now. Available and pre-order are;
 * so is anything on backorder, which LEGO takes and sends later. Coming soon,
 * sold out, out of stock and retired are not — and an unknown status is not
 * taken to be either, rather than guessed to be one.
 */
export function orderable(status: string | undefined): boolean {
  return !!status && (/^(E_AVAILABLE|A_PRE_ORDER)/.test(status) || /BACKORDER/.test(status))
}

/** How many of it LEGO has on offer: what it will take in one order, or none. */
function quantity(canOrder: boolean, limit: number | null | undefined): number {
  if (!canOrder) {
    // Still a lot. The price is LEGO's own for it, retired or not, and that is
    // what the lot is here to say; a quantity of none is what keeps it out of
    // a cart and out of a plan.
    return 0
  }
  return typeof limit === 'number' && limit > 0 ? limit : UNSTATED_QUANTITY
}

/**
 * The BrickLink set a LEGO product is: its code with BrickLink's first
 * variant — `10311` is `S-10311-1`. LEGO sells one version of a set, and it
 * is always the one BrickLink numbers first.
 */
export function setRecordOf(productCode: string): string {
  return `S-${productCode}-1`
}

/** The product code of a BrickLink set LEGO would sell — `S-10311-1` is `10311` — or none. */
export function productCodeOf(record: string): string | undefined {
  return /^S-(\d+)-1$/.exec(record)?.[1]
}

/**
 * One set of LEGO's as a lot, or nothing where LEGO states no one price for
 * it — a gift card has several — or where `item` says BrickLink has no such
 * set to file it under.
 */
export function productLot(product: LegoProduct, locale: string, item: Pick<BrickLinkItem, 'Name' | 'Number'> | undefined): LegoLot | undefined {
  const price = product.variant?.price
  if (!item || !price || !Number.isFinite(price.centAmount)) {
    return undefined
  }
  const attributes = product.variant?.attributes
  const record = setRecordOf(product.productCode)
  const printed = printedPrice(price)
  return {
    id: `lego-${record}`,
    store: LEGO_STORE,
    record,
    itemType: 'S',
    itemNumber: item.Number,
    itemName: item.Name,
    // LEGO's own word on it — "Available now", "Sold out", "Retired product" —
    // which is the seller's note about the lot, as a BrickLink seller's is.
    description: attributes?.availabilityText ?? '',
    condition: 'N',
    quantity: quantity(orderable(attributes?.availabilityStatus), attributes?.maxOrderQuantity),
    price: price.centAmount / 100,
    displayPrice: printed,
    nativePrice: printed,
    image: itemPicture('S', item.Number),
    locale,
  }
}

/**
 * Pick a Brick's elements as lots, each filed under the BrickLink part and
 * colour `codes` says it is. An element BrickLink has no number for is left
 * out: there is no record to file its price under.
 */
export function elementLots(
  elements: LegoElement[],
  codes: Map<string, ElementCode>,
  names: Map<string, string>,
  locale: string,
): LegoLot[] {
  const lots: LegoLot[] = []
  for (const element of elements) {
    const code = codes.get(element.id)
    const price = element.price
    if (!code || !price || !Number.isFinite(price.centAmount)) {
      continue
    }
    const printed = printedPrice(price)
    const available = element.availability === undefined || element.availability === 'AVAILABLE'
    lots.push({
      id: `lego-${element.id}`,
      store: LEGO_STORE,
      record: code.record,
      itemType: 'P',
      itemNumber: code.itemNumber,
      itemName: names.get(code.record) ?? element.name,
      // The element number, which is what LEGO's own basket and a Pick a Brick
      // search go by — the one thing on this lot a buyer needs that BrickLink's
      // numbering does not say.
      description: available ? `Element ${element.id}` : `Element ${element.id}, out of stock`,
      condition: 'N',
      colorId: code.colorId,
      colorName: code.colorName,
      quantity: quantity(available, element.maxOrderQuantity),
      price: price.centAmount / 100,
      displayPrice: printed,
      nativePrice: printed,
      image: code.colorId
        ? `https://img.bricklink.com/ItemImage/PN/${code.colorId}/${code.itemNumber}.png`
        : itemPicture('P', code.itemNumber),
      locale,
    })
  }
  return lots
}

/**
 * Answers that have arrived, by what was asked — see [answerKey].
 *
 * A search for a part LEGO does not sell answers with nothing, and nothing
 * stored looks exactly like nothing arrived yet. So an answer is noted here
 * whether or not it held any lots, and waiting for one is waiting for this.
 * Held in memory: it is only wanted while a request is in flight, and a
 * replay from the call cache notes it again.
 */
export const legoAnswers = new Map<string, number>()

/** What an answer is noted under: which request, in which shop, for what. */
export function answerKey(call: Call, locale: string, what: string | number): string {
  return `${call}#${locale}#${what}`
}

interface LegoResponse extends EventDetail {
  request: EventDetail['request'] & {
    extraParams: {
      locale: string
      record?: string
      page?: number
      ask?: number
    }
  }
}

/** The catalogue's own records for these, by record — the name every other lot of them carries. */
async function catalogueItems(records: string[]): Promise<Map<string, BrickLinkItem>> {
  const db = await getDbConnection()
  try {
    const found = await Promise.all(records.map((record) => get<BrickLinkItem>(db, STORES.BRICK_LINK_ITEMS, record)))
    const items = new Map<string, BrickLinkItem>()
    found.forEach((item, i) => {
      if (item) {
        items.set(records[i], item)
      }
    })
    return items
  } finally {
    db.close()
  }
}

/** The element codes for these element numbers, by element number. */
async function codesOf(elementIds: string[]): Promise<Map<string, ElementCode>> {
  const db = await getDbConnection()
  try {
    const found = await Promise.all(elementIds.map((id) => get<ElementCode>(db, STORES.ELEMENT_CODES, id)))
    return new Map(found.filter((code): code is ElementCode => !!code).map((code) => [code.code, code]))
  } finally {
    db.close()
  }
}

async function store(lots: LegoLot[]) {
  if (!lots.length) {
    return
  }
  const db = await getDbConnection()
  try {
    await putAll<LegoLot>(db, STORES.STORE_LOTS, lots)
  } finally {
    db.close()
  }
}

/** Elements as lots, named as the catalogue names their parts. */
async function lotsOfElements(elements: LegoElement[], locale: string): Promise<LegoLot[]> {
  const codes = await codesOf(elements.map((element) => element.id))
  const items = await catalogueItems([...new Set([...codes.values()].map((code) => code.record))])
  const names = new Map([...items].map(([record, item]) => [record, item.Name]))
  return elementLots(elements, codes, names, locale)
}

/** Products as lots, for the ones BrickLink has a set for. */
async function lotsOfProducts(products: LegoProduct[], locale: string): Promise<LegoLot[]> {
  const items = await catalogueItems(products.map((product) => setRecordOf(product.productCode)))
  return products
    .map((product) => productLot(product, locale, items.get(setRecordOf(product.productCode))))
    .filter((lot): lot is LegoLot => !!lot)
}

export async function handleLegoProductResponse(detail: LegoResponse) {
  const {
    locale, record = ''
  } = detail.request.extraParams ?? {}
  const product = detail.response?.data?.product as LegoProduct | null | undefined
  const lots = product ? await lotsOfProducts([product], locale) : []
  await store(lots)
  legoAnswers.set(answerKey(Call.GET_LEGO_PRODUCT, locale, record), lots.length)
}

export async function handleLegoElementsResponse(detail: LegoResponse) {
  const {
    locale, record = '', ask = 0
  } = detail.request.extraParams ?? {}
  const elements = (detail.response?.data?.searchElements?.results ?? []) as LegoElement[]
  // Only the elements of the part that was asked about: a search by number
  // matches on more than the number now and then.
  const lots = (await lotsOfElements(elements, locale)).filter((lot) => lot.record === record)
  await store(lots)
  legoAnswers.set(answerKey(Call.GET_LEGO_ELEMENTS, locale, `${record}#${ask}`), lots.length)
}

/** The shop's scope as it stands, or a fresh one where it is another shop's or none. */
export async function readLegoScope(locale: string): Promise<LegoStoreScope> {
  const db = await getDbConnection()
  try {
    const held = await get<LegoStoreScope>(db, STORES.STORE_LOT_SCOPES, LEGO_STORE)
    if (held && held.locale === locale) {
      return held
    }
  } finally {
    db.close()
  }
  return {
    store: LEGO_STORE,
    locale,
    lots: 0,
    fetchedLots: 0,
    setPagesFetched: 0,
    setsSeen: 0,
    elementPagesFetched: 0,
    elementsSeen: 0
  }
}

/** Writes the scope back, with the two figures every seller's scope carries summed from its parts. */
async function writeLegoScope(scope: LegoStoreScope) {
  const db = await getDbConnection()
  try {
    await put<LegoStoreScope>(db, STORES.STORE_LOT_SCOPES, {
      ...scope,
      lots: (scope.sets ?? 0) + (scope.elements ?? 0),
      fetchedLots: scope.setsSeen + scope.elementsSeen
    })
  } finally {
    db.close()
  }
}

export async function handleLegoSetPageResponse(detail: LegoResponse) {
  const {
    locale, page = 1
  } = detail.request.extraParams ?? {}
  const listing = detail.response?.data?.productListing
  if (!listing) {
    legoAnswers.set(answerKey(Call.GET_LEGO_SET_PAGE, locale, page), 0)
    return
  }
  const products = ((listing.tiles ?? []) as { product?: LegoProduct }[])
    .map((tile) => tile.product)
    .filter((product): product is LegoProduct => !!product)
  const lots = await lotsOfProducts(products, locale)
  await store(lots)
  const scope = await readLegoScope(locale)
  const pagination = listing.pagination ?? {}
  // The highest seen rather than a running sum, as a seller's scope is kept: a
  // page replayed from the call cache must not make the shop look longer.
  await writeLegoScope({
    ...scope,
    sets: pagination.totalProducts ?? scope.sets,
    setPages: pagination.totalPages ?? scope.setPages,
    setPagesFetched: Math.max(scope.setPagesFetched, page),
    setsSeen: Math.max(scope.setsSeen, Math.min(pagination.displayedProducts ?? 0, pagination.totalProducts ?? Infinity))
  })
  legoAnswers.set(answerKey(Call.GET_LEGO_SET_PAGE, locale, page), lots.length)
}

export async function handleLegoElementPageResponse(detail: LegoResponse) {
  const {
    locale, page = 1
  } = detail.request.extraParams ?? {}
  const search = detail.response?.data?.searchElements
  if (!search) {
    legoAnswers.set(answerKey(Call.GET_LEGO_ELEMENT_PAGE, locale, page), 0)
    return
  }
  const elements = (search.results ?? []) as LegoElement[]
  const lots = await lotsOfElements(elements, locale)
  await store(lots)
  const scope = await readLegoScope(locale)
  const total = Number(search.total ?? 0)
  await writeLegoScope({
    ...scope,
    elements: total,
    elementPages: Math.ceil(total / ELEMENT_PAGE_SIZE),
    elementPagesFetched: Math.max(scope.elementPagesFetched, page),
    elementsSeen: Math.max(scope.elementsSeen, Math.min((page - 1) * ELEMENT_PAGE_SIZE + elements.length, total))
  })
  legoAnswers.set(answerKey(Call.GET_LEGO_ELEMENT_PAGE, locale, page), lots.length)
}

/** Every LEGO lot stored, whichever shop it is from — for clearing out another shop's. */
export async function readLegoLots(): Promise<LegoLot[]> {
  const db = await getDbConnection()
  try {
    return ((await getAll<LegoLot>(db, STORES.STORE_LOTS, IDBKeyRange.bound('lego-', 'lego-￿'))) ?? [])
  } finally {
    db.close()
  }
}
