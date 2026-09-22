/**
 * LEGO as a seller: where it is, what of its shop is asked for next, and what
 * becomes of one country's prices when the Ship to country changes.
 *
 * Against `fake-indexeddb` through brickzuke's own `getDbConnection`; the
 * requests themselves are LEGO.com's and are not made here — see
 * [lego-shop.test] for what their answers become.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

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
  legoSeller, legoStorePages, settleLegoShop, readLegoStoreLots
} = await import('../legoLotsFetch')
const {
  storePolicyFor
} = await import('../storePolicyFetch')
const {
  storeIdFor
} = await import('../storeLotsFetch')
const {
  shipTo
} = await import('../settings')
const {
  getDbConnection
} = await import('../../../idb/idb')
const STORES = (await import('../../../idb/stores')).default

/** LEGO's scope as the handlers leave it, in one shop. */
async function scopeOf(locale: string, fields: object) {
  const db = await getDbConnection()
  await db.put(STORES.STORE_LOT_SCOPES.name, {
    store: 'LEGO.com',
    locale,
    lots: 0,
    fetchedLots: 0,
    setPagesFetched: 0,
    setsSeen: 0,
    elementPagesFetched: 0,
    elementsSeen: 0,
    ...fields
  })
  db.close()
}

beforeEach(async () => {
  shipTo.value = 'DE'
  const db = await getDbConnection()
  await db.clear(STORES.STORE_LOT_SCOPES.name)
  await db.clear(STORES.STORE_LOTS.name)
  db.close()
})

describe('legoSeller', () => {
  it('is LEGO, in the country it ships to', () => {
    expect(legoSeller()).toEqual({
      id: 'LEGO.com',
      name: 'LEGO',
      countryID: 'DE'
    })
  })

  it('is nobody without a Ship to country', () => {
    shipTo.value = ''
    expect(legoSeller()).toBeUndefined()
  })
})

describe('LEGO’s shop, a page at a time', () => {
  it('starts on the sets while nothing says how many there are', async () => {
    const pages = legoStorePages()
    expect(await pages.next()).toBe(1)
    expect(await pages.reach()).toBe(0)
  })

  it('goes on to Pick a Brick once every page of sets is in', async () => {
    await scopeOf('en-DE', {
      setPages: 64,
      setPagesFetched: 64
    })
    const pages = legoStorePages()
    expect(await pages.next()).toBe(65)
    expect(await pages.reach()).toBe(64)
  })

  it('is done when both lists are', async () => {
    await scopeOf('en-DE', {
      setPages: 64,
      setPagesFetched: 64,
      elementPages: 42,
      elementPagesFetched: 42
    })
    expect(await legoStorePages().next()).toBeUndefined()
  })

  it('reads another shop’s progress as none of this one’s', async () => {
    await scopeOf('en-CH', {
      setPages: 64,
      setPagesFetched: 64
    })
    expect(await legoStorePages().next()).toBe(1)
  })

  it('asks for nothing without a Ship to country', async () => {
    shipTo.value = ''
    expect(await legoStorePages().next()).toBeUndefined()
  })
})

describe('a changed Ship to country', () => {
  it('drops the other shop’s prices and progress, and keeps this one’s', async () => {
    await scopeOf('en-CH', {
      setPages: 64,
      setPagesFetched: 3
    })
    const db = await getDbConnection()
    await db.put(STORES.STORE_LOTS.name, {
      id: 'lego-S-10311-1',
      store: 'LEGO.com',
      record: 'S-10311-1',
      locale: 'en-CH',
      price: 59.9
    })
    await db.put(STORES.STORE_LOTS.name, {
      id: 'lego-300101',
      store: 'LEGO.com',
      record: 'P-3001',
      locale: 'en-DE',
      price: 0.21
    })
    // A BrickLink seller's lot, which is nobody's business here.
    await db.put(STORES.STORE_LOTS.name, {
      id: '123',
      store: 'steinehaus',
      record: 'P-3001',
      price: 0.1
    })
    db.close()

    await settleLegoShop()

    expect((await readLegoStoreLots()).map((lot) => lot.id)).toEqual(['lego-300101'])
    const after = await getDbConnection()
    expect(await after.get(STORES.STORE_LOTS.name, '123')).toBeDefined()
    expect(await after.get(STORES.STORE_LOT_SCOPES.name, 'LEGO.com')).toBeUndefined()
    after.close()
  })
})

describe('what BrickLink is not asked about LEGO', () => {
  it('has no BrickLink store id to look up', async () => {
    await expect(storeIdFor('LEGO.com')).rejects.toThrow('not a BrickLink store')
  })

  it('has no BrickLink shipping policy to fetch', async () => {
    await expect(storePolicyFor('LEGO.com')).rejects.toThrow('no shipping terms')
  })
})
