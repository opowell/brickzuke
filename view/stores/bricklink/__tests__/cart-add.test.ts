/**
 * Handing lots to a BrickLink cart: the request as the store front makes it,
 * and the answer as it reads it.
 *
 * Both were read off `storebuildjs` rather than a captured exchange — the
 * add is a write, and there is no fixture of one that is not also an order
 * placed — so what is pinned here is that the request keeps the store
 * front's shape, and that every way the answer can come back is read as
 * lots in the cart or lots refused, and never as anything else.
 */
import { describe, it, expect } from 'vitest'
import {CART_ADD_URL,
  cartAddBody,
  cartAddOptions,
  readCartAddResponse} from '../cart-add'

const LOTS = [
  {
    lotId: '421934511',
    quantity: 2
  },
  {
    lotId: '421934512',
    quantity: 1
  }
]

describe('the request', () => {
  it('is posted to the store host, as the store front posts it', () => {
    expect(CART_ADD_URL).toBe('https://store.bricklink.com/ajax/clone/cart/add.ajax')
    const options = cartAddOptions('BunteSteinewelt', 1801484, LOTS)
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('include')
    expect(options.headers['content-type']).toContain('application/x-www-form-urlencoded')
    expect(options.referrer).toBe('https://store.bricklink.com/BunteSteinewelt')
  })

  it('carries the lots as the one JSON field the store front sends, with the seller twice over', () => {
    const body = new URLSearchParams(cartAddBody(1801484, LOTS))
    expect(body.get('sid')).toBe('1801484')
    expect(body.get('srcLocation')).toBe('1100')
    expect(JSON.parse(body.get('itemArray') ?? '')).toEqual([
      {
        invID: '421934511',
        invQty: 2,
        sellerID: 1801484,
        sourceType: 1
      },
      {
        invID: '421934512',
        invQty: 1,
        sellerID: 1801484,
        sourceType: 1
      }
    ])
  })
})

describe('the answer', () => {
  it('is every lot in the cart when the request took and each status is nought', () => {
    const outcome = readCartAddResponse(
      {
        returnCode: 0,
        errors: 0,
        itemReturnStatus: [
          {
            invID: 421934511,
            code: 0
          },
          {
            invID: 421934512,
            code: '0'
          }
        ]
      },
      LOTS
    )
    expect(outcome.added).toEqual(['421934511', '421934512'])
    expect(outcome.refused).toEqual([])
  })

  it('keeps what BrickLink said about a lot it would not take', () => {
    const outcome = readCartAddResponse(
      {
        returnCode: 0,
        errors: 1,
        itemReturnStatus: [
          {
            invID: 421934511,
            code: 0
          },
          {
            invID: 421934512,
            code: 3,
            msg: 'Quantity exceeds what is available'
          }
        ]
      },
      LOTS
    )
    expect(outcome.added).toEqual(['421934511'])
    expect(outcome.refused).toEqual([
      {
        lotId: '421934512',
        reason: 'Quantity exceeds what is available'
      }
    ])
  })

  it('treats a lot the answer never mentions as refused, since nothing said it went in', () => {
    const outcome = readCartAddResponse(
      {
        returnCode: 0,
        itemReturnStatus: [
          {
            invID: 421934511,
            code: 0
          }
        ]
      },
      LOTS
    )
    expect(outcome.added).toEqual(['421934511'])
    expect(outcome.refused.map((r) => r.lotId)).toEqual(['421934512'])
  })

  it('refuses every lot for the one reason when the whole request was refused', () => {
    const outcome = readCartAddResponse(
      {
        returnCode: -2,
        returnMessage: 'This store is closed.'
      },
      LOTS
    )
    expect(outcome.added).toEqual([])
    expect(outcome.refused).toEqual([
      {
        lotId: '421934511',
        reason: 'This store is closed.'
      },
      {
        lotId: '421934512',
        reason: 'This store is closed.'
      }
    ])
  })

  it('says so when the answer is not an answer at all', () => {
    const outcome = readCartAddResponse('<html>Sign in</html>', LOTS)
    expect(outcome.added).toEqual([])
    expect(outcome.refused[0].reason).toContain('refused the request')
  })
})
