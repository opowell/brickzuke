/**
 * The sellers a table is about, and their terms, fetched while it is up.
 *
 * Pinned: which countries a query is about, that only what is missing is
 * asked for, the biggest seller first — and that BrickLink's bot check is a
 * pause rather than a run of failures that ends the fill.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'

vi.mock('../../../model', async () => {
  const {
    ref
  } = await import('vue')
  return {
    itemTypes: ref([]),
    processingCounts: ref(false),
    selectedCounts: ref({})
  }
})

/** Every country whose sellers were fetched, in order. */
const listed: string[] = []
/** Every seller whose terms were fetched, in order. */
const termsAsked: string[] = []
/** Sellers whose terms answer with the bot check this many times first. */
const checkedFor = new Map<string, number>()

vi.mock('../storesFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../storesFetch')>()
  return {
    ...original,
    storesFor: async (countryId?: string) => {
      if (countryId) {
        listed.push(countryId)
      }
      return []
    }
  }
})

vi.mock('../storePolicyFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../storePolicyFetch')>()
  const {
    noteBotCheck, noteAnswer
  } = await import('../../assets/js/bot-check')
  return {
    ...original,
    storePolicyFor: async (username: string) => {
      termsAsked.push(username)
      const left = checkedFor.get(username) ?? 0
      if (left > 0) {
        checkedFor.set(username, left - 1)
        noteBotCheck(`https://store.bricklink.com/${username}`)
        throw new Error('bot check')
      }
      noteAnswer()
      return {
        store: username,
        methods: []
      }
    }
  }
})

const {
  countriesInScope,
  startSellerFill,
  stopSellerFill
} = await import('../sellerFill')
const {
  reachGapMs
} = await import('../settings')
const {
  botCheck
} = await import('../../assets/js/bot-check')

beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  const country = (countryCode: string, regionId: string, storeCount: number) => ({
    countryCode,
    countryName: countryCode,
    regionId,
    groupState: 'N',
    image: '',
    storeCount
  })
  await putAll(db, STORES.STORE_COUNTRIES, [
    country('AT', 'Europe', 3),
    country('CH', 'Europe', 2),
    // Counted by the directory as having nobody: no page to wait for.
    country('LI', 'Europe', 0),
    country('JP', 'Asia', 4)
  ])
  await putAll(db, STORES.BRICK_LINK_STORES, [
    {
      id: 'wien-klein',
      name: 'Wien Klein',
      countryID: 'AT',
      items: 10
    },
    {
      id: 'wien-gross',
      name: 'Wien Gross',
      countryID: 'AT',
      items: 900
    },
    {
      id: 'wien-bekannt',
      name: 'Wien Bekannt',
      countryID: 'AT',
      items: 500
    }
  ])
  // Terms already read, which are not asked for again.
  await putAll(db, STORES.STORE_POLICIES, [
    {
      store: 'wien-bekannt',
      methods: []
    }
  ])
  db.close()
})

beforeEach(() => {
  listed.length = 0
  termsAsked.length = 0
  checkedFor.clear()
  botCheck.value = undefined
  reachGapMs.value = 100
  vi.useFakeTimers()
})

afterEach(() => {
  stopSellerFill()
  vi.useRealTimers()
})

async function settle(ms = 30_000): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('countriesInScope', () => {
  // A read of the directory and no fill: nothing here to wind a clock for.
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('is the countries named, by country or by the country a province is in', async () => {
    expect(await countriesInScope('country:"AT"', true)).toEqual(['AT'])
    expect(await countriesInScope('province:"US-Ohio"', true)).toEqual(['US'])
  })

  it('is every country with sellers in a region, when wide', async () => {
    expect((await countriesInScope('region:"Europe"', true)).sort()).toEqual(['AT', 'CH'])
    // Not wide: a region is the home screen's own fill to work through.
    expect(await countriesInScope('region:"Europe"', false)).toEqual([])
  })

  it('is every country with sellers when the query names no place', async () => {
    expect((await countriesInScope('type:S', true)).sort()).toEqual(['AT', 'CH', 'JP'])
    expect(await countriesInScope('type:S', false)).toEqual([])
  })
})

describe('the directory', () => {
  it('lists the sellers of each country in scope that has none stored', async () => {
    startSellerFill('directory', 'region:"Europe"')
    await settle()
    // Austria's are stored already.
    expect(listed).toEqual(['CH'])
  })
})

describe('the shipping terms', () => {
  it('asks for every seller in scope with none stored, biggest first', async () => {
    startSellerFill('policies', 'country:"AT"')
    await settle()
    expect(termsAsked).toEqual(['wien-gross', 'wien-klein'])
  })

  it('waits out BrickLink\'s bot check and asks again, rather than moving on', async () => {
    checkedFor.set('wien-gross', 2)
    startSellerFill('policies', 'country:"AT"')
    await settle(5_000)
    // Asked once, answered with the check, and paused on it.
    expect(termsAsked).toEqual(['wien-gross'])
    expect(botCheck.value?.url).toBe('https://store.bricklink.com/wien-gross')
    await settle(120_000)
    // Asked again after each pause until it answered, then on to the next.
    expect(termsAsked).toEqual(['wien-gross', 'wien-gross', 'wien-gross', 'wien-klein'])
    expect(botCheck.value).toBeUndefined()
  })
})
