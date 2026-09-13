/**
 * Scraping and persisting a seller's terms.
 *
 * The fixture is a real `policy.ajax` answer for a German bulk seller,
 * trimmed of the general terms. What is pinned here is the shape BrickLink
 * answers in — where the countries, the methods and the prose are, and the
 * one-letter reach on each method — because the whole of the shipping tables
 * rests on that shape holding.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { handleStorePolicyResponse, storePolicyUrl, toStoredPolicy } from '../store-policy-page'
import type { StoredStorePolicy, StorePolicyResponse } from '../store-policy-page'
import { get } from '../../../../idb/db'
import { getDbConnection } from '../../../../idb/idb'
import STORES from '../../../../idb/stores'
import POLICY from './fixtures/storePolicy-BunteSteinewelt.json'

function detail(username: string, response: unknown): StorePolicyResponse {
  return {
    request: {
      url: storePolicyUrl(1801484),
      call: 'x',
      type: 'x',
      options: {},
      extraParams: {
        username,
      },
    },
    response,
  } as unknown as StorePolicyResponse
}

async function storedFor(username: string): Promise<StoredStorePolicy | undefined> {
  const db = await getDbConnection()
  try {
    return await get<StoredStorePolicy>(db, STORES.STORE_POLICIES, username)
  } finally {
    db.close()
  }
}

describe('the policy', () => {
  it('is addressed by the numeric id the front page gave up, as the lots are', () => {
    expect(storePolicyUrl(1801484)).toBe('https://store.bricklink.com/ajax/clone/store/policy.ajax?sid=1801484')
  })

  it('keeps where the seller ships as the codes the directory keys countries by', () => {
    const policy = toStoredPolicy('BunteSteinewelt', POLICY, 1)
    expect(policy.shipsTo.length).toBe(214)
    expect(policy.shipsTo.slice(0, 3)).toEqual(['AF', 'AL', 'DZ'])
    expect(policy.currencies).toEqual(['EUR'])
    expect(policy.vat).toBe(true)
  })

  it('spells out who each method is offered to', () => {
    const policy = toStoredPolicy('BunteSteinewelt', POLICY, 1)
    expect(policy.methods.length).toBe(16)
    // `D` is the seller's own country, `I` is everyone else; a name with a
    // trailing space is BrickLink's, not the seller's.
    expect(policy.methods.find((method) => method.id === 158426)).toEqual({
      id: 158426,
      name: 'DHL Paket',
      note: '',
      reach: 'domestic'
    })
    expect(policy.methods.find((method) => method.id === 334640)).toEqual({
      id: 334640,
      name: 'DHL Express EU',
      note: '',
      reach: 'international'
    })
    expect(toStoredPolicy('x', {
      shipMethods: [
        {
          id: 1,
          name: 'Request for invoice',
          shipsTo: 'B'
        }
      ]
    }, 1).methods[0].reach).toBe('both')
  })

  it('keeps the shipping terms as text, the HTML being the seller\'s formatting', () => {
    const policy = toStoredPolicy('BunteSteinewelt', POLICY, 1)
    expect(policy.shippingTerms).not.toContain('<')
    expect(policy.shippingTerms).toContain('DHL Paket: 6,90€ (inkl. MwSt.) pro angefangenes 30kg Paket')
    expect(policy.shippingTerms.split('\n')[0]).toBe('Deutschland')
  })

  it('files the policy under the username that was asked for', async () => {
    await handleStorePolicyResponse(detail('BunteSteinewelt', POLICY))
    const stored = await storedFor('BunteSteinewelt')
    expect(stored?.store).toBe('BunteSteinewelt')
    expect(stored?.methods.length).toBe(16)
    expect(stored?.fetched).toBeGreaterThan(0)
  })

  it('writes nothing for a store that answered with an error', async () => {
    await handleStorePolicyResponse(detail('closed', {
      returnCode: -1,
      returnMessage: 'Store not found'
    }))
    expect(await storedFor('closed')).toBeUndefined()
  })
})
