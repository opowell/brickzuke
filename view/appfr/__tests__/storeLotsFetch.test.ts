/**
 * A seller with nothing on offer is an answer, not a silence.
 *
 * Their first page is a page of no lots, which stores none — and waited for as
 * lots it ran out the deadline and was reported as an extension that never
 * answered, three of which in a row ended a whole run of sellers.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

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

const {
  storeLotsFor
} = await import('../storeLotsFetch')
const {
  storeIds
} = await import('../../stores/bricklink/store-front-page')
const {
  installResponseListener
} = await import('../../assets/js/init-brick-link-worker')

beforeAll(() => {
  setActivePinia(createPinia())
  installResponseListener()
  // The extension's half: every page of lots asked for is a page of none.
  document.addEventListener('bzClientToServer', (e) => {
    const request = (e as CustomEvent).detail
    document.dispatchEvent(
      new CustomEvent('bzServerToClient', {
        detail: {
          request,
          response: {
            returnCode: 0,
            result: {
              totalLotCnt: 0,
              groups: []
            }
          }
        }
      })
    )
  })
})

describe('a seller with nothing on offer', () => {
  it('is answered with no lots, well inside the deadline', async () => {
    // The front page is what learns this; it is not what is being tested.
    storeIds.set('empty-shop', 4242)
    const started = Date.now()
    await expect(storeLotsFor('empty-shop')).resolves.toEqual([])
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})
