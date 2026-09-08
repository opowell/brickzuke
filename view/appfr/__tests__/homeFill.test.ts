/**
 * The home screen while it is still filling itself in.
 *
 * The store directory has no bulk download behind it and the sellers come one
 * country at a time, so for most of a visit these cards are answering from
 * less than the whole truth. What is pinned here is which of the three things
 * a card says — nothing yet, roughly this many, exactly this many — and that
 * the middle one is arrived at from BrickLink's own count of the countries
 * nobody has fetched rather than from a guess about them.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
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
  LOADING, awaitedStores, fetchedCountries, fills
} = await import('../homeFill')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  browsedCounts
} = await import('../catalogCounts')
const {
  forgetPreview, previewFor
} = await import('../catalogPreviews')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  putAll
} = await import('../../../idb/db')
const STORES = (await import('../../../idb/stores')).default

/** What the card for one type reads, which is the whole of this screen. */
const cardCount = (key: string) =>
  catalogSchema.value.entities.find((entity) => entity.key === key)!.count

beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  await putAll(db, STORES.STORE_COUNTRIES, [
    {
      regionId: 'Europe',
      countryCode: 'DE',
      groupState: 'N',
      image: 'https://img.example/de.gif',
      countryName: 'Germany',
      storeCount: 900
    },
    {
      regionId: 'Europe',
      countryCode: 'NL',
      groupState: 'N',
      image: 'https://img.example/nl.gif',
      countryName: 'Netherlands',
      storeCount: 400
    },
    {
      regionId: 'North America',
      countryCode: 'US',
      groupState: 'Y',
      image: 'https://img.example/us.gif',
      countryName: 'United States',
      storeCount: 1_200
    }
  ])
  // Germany fetched, and nowhere else: two sellers stored against a directory
  // that counts nine hundred there and sixteen hundred elsewhere.
  await putAll(db, STORES.BRICK_LINK_STORES, [
    {
      id: 'brickmeister',
      name: 'Brickmeister',
      countryID: 'DE',
      items: 12_000,
      instantCheckout: true
    },
    {
      id: 'steinehaus',
      name: 'Steinehaus',
      countryID: 'DE',
      stateName: 'Bayern',
      items: 3_000,
      instantCheckout: false
    }
  ])
  db.close()
})

beforeEach(() => {
  fills.value = {}
  fetchedCountries.value = new Set(['DE'])
  forgetPreview('stores')
})

describe('what the directory is still holding', () => {
  const directory = [
    {
      code: 'DE',
      stores: 900
    },
    {
      code: 'NL',
      stores: 400
    },
    {
      code: 'US',
      stores: 1_200
    }
  ]

  it('counts the countries nobody has fetched, and only those', () => {
    // Germany is fetched, so its sellers are stored and counted as sellers.
    // Counting the directory's nine hundred as well would state Germany twice.
    expect(awaitedStores(directory)).toBe(1_600)
  })

  it('is nothing once every country has come back', () => {
    fetchedCountries.value = new Set(['DE', 'NL', 'US'])
    expect(awaitedStores(directory)).toBe(0)
  })

  it('ignores a country the directory printed no number against', () => {
    // `storeCount` is parsed out of the page beside the name, and a page that
    // changes shape hands back NaN. A card headed `~NaN` is worse than one
    // that leaves that country out.
    expect(
      awaitedStores([
        {
          code: 'NL',
          stores: Number.NaN
        }
      ])
    ).toBe(0)
  })
})

describe('the count on a card being filled', () => {
  it('is a placeholder before anything is known', () => {
    // Not `0`, which says brickzuke looked and found no sellers, and not the
    // blank it showed before, which says nothing is happening.
    fills.value = {
      stores: {}
    }
    expect(cardCount('stores')).toBe(LOADING)
  })

  it('is the projection, marked as one, as soon as there is one', () => {
    fills.value = {
      stores: {
        estimate: 1_602
      }
    }
    expect(cardCount('stores')).toBe('~1.6k')
  })

  it('is the count itself once the fill is done', () => {
    // Which is the fill saying nothing at all about the type: there is one way
    // to state an exact number, and it is the one every other card uses.
    browsedCounts.value = {
      ...browsedCounts.value,
      stores: 1_602
    }
    expect(cardCount('stores')).toBe('1.6k')
  })
})

describe('the sellers card under a query', () => {
  it('adds what the named region is still holding to what it has read', async () => {
    // Two German sellers stored, and the Netherlands not fetched at all. The
    // card can say roughly how many sellers Europe has long before it can list
    // one of them.
    const preview = await previewFor('stores', 'region:"Europe"')
    expect(preview.count).toBe(402)
    expect(preview.estimated).toBe(true)
  })

  it('projects over the countries the query names and no others', async () => {
    const preview = await previewFor('stores', 'country:"US"')
    expect(preview.count).toBe(1_200)
    expect(preview.estimated).toBe(true)
  })

  it('states what it has read where the directory cannot answer the query', async () => {
    // The directory counts sellers per country and says nothing about any one
    // of them, so there is no projecting `Instant` over countries nobody has
    // fetched — twelve hundred American sellers are not twelve hundred
    // instant-checkout ones. One stored seller matches, and one is the answer.
    const preview = await previewFor('stores', 'instantCheckout:"Instant"')
    expect(preview.count).toBe(1)
    expect(preview.estimated).toBeUndefined()
  })

  it('says nothing extra once every country has come back', async () => {
    fetchedCountries.value = new Set(['DE', 'NL', 'US'])
    const preview = await previewFor('stores', 'region:"Europe"')
    expect(preview.count).toBe(2)
    expect(preview.estimated).toBeUndefined()
  })
})
