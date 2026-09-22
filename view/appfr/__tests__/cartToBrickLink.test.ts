/**
 * Handing a cart to BrickLink, seller by seller.
 *
 * BrickLink's cart is one per seller, so the one press on the carts table is a
 * request per seller the cart's lots come from — each addressed by the id
 * the front page gives up, and each carrying only that seller's lots. What is
 * pinned is that split, the report the cell reads as it goes, and what a run
 * says when a seller cannot be reached at all: what went in before stays in,
 * and the report says how far it got.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDbConnection } from '../../../idb/idb'
import { createCart, setCartLines } from '../../../idb/cart'
import type { CartAddLot } from '../../stores/bricklink/cart-add'

/** Every request made: which seller, with which lots. */
const sent: {
  username: string
  sid: number
  lots: CartAddLot[]
}[] = []

/** What BrickLink answers each seller with, or the failure that stands in. */
const answers = new Map<string, ((lots: CartAddLot[]) => unknown) | Error>()

vi.mock('../storeLotsFetch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../storeLotsFetch')>()
  return {
    ...original,
    storeIdFor: async (username: string) => {
      const answer = answers.get(username)
      if (answer instanceof Error) {
        throw answer
      }
      return username.length
    }
  }
})

vi.mock('../../stores/bricklink/cart-add', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../stores/bricklink/cart-add')>()
  return {
    ...original,
    addToBrickLinkCart: async (username: string, sid: number, lots: CartAddLot[]) => {
      sent.push({
        username,
        sid,
        lots
      })
      const answer = answers.get(username)
      const response = typeof answer === 'function' ? answer(lots) : undefined
      return original.readCartAddResponse(response, lots)
    }
  }
})

const {
  cartTransferOf, linesBySeller, moveCartToBrickLink
} = await import('../cartToBrickLink')

/** Every lot taken, as BrickLink answers when they all are. */
function allTaken(lots: CartAddLot[]) {
  return {
    returnCode: 0,
    errors: 0,
    itemReturnStatus: lots.map((lot) => ({
      invID: Number(lot.lotId),
      code: 0
    }))
  }
}

function lot(lotId: string, store: string, name: string) {
  return {
    lotId,
    store,
    storeName: store,
    record: 'P-3001',
    name,
    colorName: 'Red',
    condition: 'N',
    price: 0.1,
    quantity: 2
  }
}

/** A cart of three lots from two sellers, in the table's order. */
async function cartOf(...lines: ReturnType<typeof lot>[]): Promise<number> {
  const db = await getDbConnection()
  try {
    const cart = await createCart(db)
    await setCartLines(
      db,
      cart.id,
      lines.map((line) => ({
        lot: line,
        quantity: line.quantity
      }))
    )
    return cart.id
  } finally {
    db.close()
  }
}

beforeEach(() => {
  sent.length = 0
  answers.clear()
})

describe('the lots by seller', () => {
  it('are grouped in the order the sellers first appear', () => {
    const grouped = linesBySeller([
      lot('1', 'steinehaus', 'Brick 2 x 4'),
      lot('2', 'brickflip', 'Brick 1 x 1'),
      lot('3', 'steinehaus', 'Plate 1 x 2')
    ] as never[])
    expect(Array.from(grouped.keys())).toEqual(['steinehaus', 'brickflip'])
    expect(grouped.get('steinehaus')?.map((line) => line.lotId)).toEqual(['1', '3'])
  })
})

describe('the hand-off', () => {
  it('is one request per seller, each with only that seller’s lots and its own id', async () => {
    answers.set('steinehaus', allTaken)
    answers.set('brickflip', allTaken)
    const cartId = await cartOf(
      lot('101', 'steinehaus', 'Brick 2 x 4'),
      lot('102', 'brickflip', 'Brick 1 x 1'),
      lot('103', 'steinehaus', 'Plate 1 x 2')
    )
    await moveCartToBrickLink(cartId)
    expect(sent.map((s) => [s.username, s.sid, s.lots.map((l) => l.lotId)])).toEqual([
      ['steinehaus', 'steinehaus'.length, ['101', '103']],
      ['brickflip', 'brickflip'.length, ['102']]
    ])
    expect(sent[0].lots[0].quantity).toBe(2)
    expect(cartTransferOf(cartId)).toEqual({
      state: 'done',
      text: 'Added 3 lots',
      detail: 'Every lot is in your BrickLink cart, at 2 sellers.'
    })
  })

  it('counts a lot BrickLink refused against the total, and says why on the hover', async () => {
    answers.set('steinehaus', (lots) => ({
      returnCode: 0,
      errors: 1,
      itemReturnStatus: lots.map((l) => ({
        invID: Number(l.lotId),
        code: l.lotId === '103' ? 4 : 0,
        msg: l.lotId === '103' ? 'Lot no longer available' : undefined
      }))
    }))
    const cartId = await cartOf(lot('101', 'steinehaus', 'Brick 2 x 4'), lot('103', 'steinehaus', 'Plate 1 x 2'))
    await moveCartToBrickLink(cartId)
    const transfer = cartTransferOf(cartId)
    expect(transfer?.state).toBe('failed')
    expect(transfer?.text).toBe('Added 1 of 2 lots')
    expect(transfer?.detail).toBe('Plate 1 x 2, Red (steinehaus): Lot no longer available')
  })

  it('stops at a seller nothing answers for, keeping what went in before', async () => {
    answers.set('steinehaus', allTaken)
    answers.set('brickflip', new Error('No answer from the BrickZuke extension.'))
    const cartId = await cartOf(
      lot('101', 'steinehaus', 'Brick 2 x 4'),
      lot('102', 'brickflip', 'Brick 1 x 1'),
      lot('104', 'brickflip', 'Brick 1 x 2'),
      lot('105', 'legoland', 'Brick 1 x 3')
    )
    await moveCartToBrickLink(cartId)
    expect(sent.map((s) => s.username)).toEqual(['steinehaus'])
    const transfer = cartTransferOf(cartId)
    expect(transfer?.state).toBe('failed')
    expect(transfer?.text).toBe('Added 1 lot, then failed')
    expect(transfer?.detail).toBe(
      'brickflip: No answer from the BrickZuke extension.\n1 lot from later sellers was not sent.'
    )
  })

  it('sends LEGO’s lots nowhere, and says each is bought on LEGO.com', async () => {
    answers.set('steinehaus', allTaken)
    const cartId = await cartOf(
      lot('lego-S-10311-1', 'LEGO.com', 'Orchid'),
      lot('101', 'steinehaus', 'Brick 2 x 4')
    )
    await moveCartToBrickLink(cartId)
    expect(sent.map((s) => s.username)).toEqual(['steinehaus'])
    const transfer = cartTransferOf(cartId)
    expect(transfer?.state).toBe('failed')
    expect(transfer?.text).toBe('Added 1 of 2 lots')
    expect(transfer?.detail).toBe('Orchid, Red (LEGO.com): LEGO sells this on LEGO.com, not through BrickLink.')
  })

  it('has nothing to send for an empty cart, and says so without a request', async () => {
    const cartId = await cartOf()
    await moveCartToBrickLink(cartId)
    expect(sent).toEqual([])
    expect(cartTransferOf(cartId)?.text).toBe('Nothing to add')
  })
})
