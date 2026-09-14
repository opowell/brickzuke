/**
 * Buying a list: which seller, and what from each.
 *
 * The planning is a fold over whatever lots it is handed — see the note at the
 * top of shopParts.ts for why the walk is a parameter — so these are a handful
 * of made-up lots rather than a database, and every rule it follows is stated
 * here as the case that would otherwise get it wrong.
 */
import { describe, it, expect } from 'vitest'
import type { CandidateLot, LotWalk, WantedLine } from '../shopParts'
import { planPurchase } from '../shopParts'

/** The walk, over a fixed list — what `eachLot` does off a cursor. */
function walking(lots: CandidateLot[]): LotWalk {
  return async (visit) => {
    for (const lot of lots) {
      visit(lot)
    }
    return lots.length
  }
}

function lot(fields: Partial<CandidateLot>): CandidateLot {
  return {
    record: 'P-3001',
    colorId: '5',
    condition: 'N',
    quantity: 10,
    price: 0.1,
    store: 'cheapbricks',
    storeName: 'Cheap Bricks',
    country: 'DE',
    countryName: 'Germany',
    ...fields
  }
}

function wanting(fields: Partial<WantedLine> = {}): WantedLine {
  return {
    key: '1',
    record: 'P-3001',
    colorId: '5',
    name: 'Brick 2 x 4',
    quantity: 4,
    ...fields
  }
}

describe('the cheapest seller for each part', () => {
  it('takes the cheapest lot that covers the whole line', async () => {
    const plan = await planPurchase(
      [wanting()],
      walking([
        lot({
          store: 'dear',
          price: 0.5 
        }),
        lot({
          store: 'cheap',
          price: 0.08 
        }),
        lot({
          store: 'middling',
          price: 0.2 
        })
      ])
    )
    expect(plan.lines[0].store).toBe('cheap')
    expect(plan.lines[0].price).toBe(0.08)
    expect(plan.lines[0].covered).toBe(4)
    expect(plan.lines[0].short).toBe(0)
    // Four at 0.08, and the line's cost is the whole of the order's.
    expect(plan.lines[0].cost).toBe(0.32)
    expect(plan.cost).toBe(0.32)
    expect(plan.short).toBe(0)
  })

  it('prefers a whole line at a higher price to a part of one at the best', async () => {
    // A lot with three of the four at a penny less is a second order for the
    // fourth, which is nobody's better answer.
    const plan = await planPurchase(
      [wanting({
        quantity: 4 
      })],
      walking([
        lot({
          store: 'nearly',
          price: 0.05,
          quantity: 3 
        }),
        lot({
          store: 'whole',
          price: 0.09,
          quantity: 4 
        })
      ])
    )
    expect(plan.lines[0].store).toBe('whole')
    expect(plan.lines[0].short).toBe(0)
  })

  it('counts the shortfall when nobody has enough', async () => {
    const plan = await planPurchase(
      [wanting({
        quantity: 10 
      })],
      walking([lot({
        store: 'some',
        quantity: 3,
        price: 0.1 
      })])
    )
    expect(plan.lines[0].covered).toBe(3)
    expect(plan.lines[0].short).toBe(7)
    expect(plan.lines[0].shortfall).toBe('quantity')
    expect(plan.short).toBe(7)
  })

  it('takes the larger lot when two fall equally short at the same price', async () => {
    const plan = await planPurchase(
      [wanting({
        quantity: 10 
      })],
      walking([
        lot({
          store: 'fewer',
          quantity: 2,
          price: 0.1 
        }),
        lot({
          store: 'more',
          quantity: 6,
          price: 0.1 
        })
      ])
    )
    expect(plan.lines[0].store).toBe('more')
    expect(plan.lines[0].short).toBe(4)
  })
})

describe('what a line refuses', () => {
  it('leaves out lots over the line own price limit', async () => {
    const plan = await planPurchase(
      [wanting({
        maxPrice: 0.1 
      })],
      walking([lot({
        store: 'dear',
        price: 0.5 
      })])
    )
    expect(plan.lines[0].covered).toBe(0)
    // Told apart from finding nothing at all, because what a reader does about
    // it is different: raise the limit, rather than go and fetch more sellers.
    expect(plan.lines[0].shortfall).toBe('price')
    expect(plan.lines[0].offers).toBe(1)
  })

  it('leaves out the wrong colour and the wrong condition', async () => {
    const plan = await planPurchase(
      [wanting({
        condition: 'N' 
      })],
      walking([lot({
        colorId: '11' 
      }), lot({
        condition: 'U' 
      })])
    )
    expect(plan.lines[0].shortfall).toBe('none')
    expect(plan.lines[0].offers).toBe(0)
  })

  it('takes any colour when the line names none', async () => {
    const plan = await planPurchase(
      [wanting({
        colorId: undefined 
      })],
      walking([lot({
        colorId: '11',
        price: 0.3 
      }), lot({
        colorId: '5',
        price: 0.2 
      })])
    )
    expect(plan.lines[0].covered).toBe(4)
    expect(plan.lines[0].price).toBe(0.2)
  })

  it('leaves out a lot with no price, there being nothing to compare', async () => {
    const plan = await planPurchase([wanting()], walking([lot({
      price: undefined 
    })]))
    expect(plan.lines[0].shortfall).toBe('none')
  })

  it('takes a lot at nought, that being a modifier of nought and not a missing price', async () => {
    const plan = await planPurchase([wanting()], walking([
      lot({
        store: 'dear',
        price: 0.5
      }),
      lot({
        store: 'free',
        price: 0
      })
    ]))
    expect(plan.lines[0].store).toBe('free')
    expect(plan.lines[0].price).toBe(0)
    expect(plan.lines[0].cost).toBe(0)
  })

  it('says a part of somebody own is not for sale anywhere', async () => {
    // A `U-` record — one of theirs — which no lot will ever carry, however
    // many lots are walked.
    const plan = await planPurchase(
      [wanting({
        record: 'U-7',
        name: 'Sprue offcut' 
      })],
      walking([lot({
        record: 'U-7' 
      })])
    )
    expect(plan.lines[0].shortfall).toBe('own')
    expect(plan.lines[0].offers).toBe(0)
    expect(plan.stores).toHaveLength(0)
  })
})

describe('the whole list from one seller', () => {
  it('says how much of it each has, and what that costs there', async () => {
    const lines = [
      wanting({
        key: 'a',
        record: 'P-3001',
        quantity: 4 
      }),
      wanting({
        key: 'b',
        record: 'P-3002',
        quantity: 2 
      })
    ]
    const plan = await planPurchase(
      lines,
      walking([
        // One seller has both, dearer.
        lot({
          store: 'both',
          record: 'P-3001',
          price: 0.2 
        }),
        lot({
          store: 'both',
          record: 'P-3002',
          price: 0.5 
        }),
        // The other has one of them, cheaper.
        lot({
          store: 'one',
          record: 'P-3001',
          price: 0.1 
        })
      ])
    )

    // Most of the list first: the seller worth looking at is the one who can
    // fill it, not the one with the cheapest single brick.
    expect(plan.stores.map((store) => store.store)).toEqual(['both', 'one'])
    const both = plan.stores[0]
    expect(both.lines).toBe(2)
    expect(both.quantity).toBe(6)
    expect(both.short).toBe(0)
    // Four at 0.2 and two at 0.5.
    expect(both.cost).toBe(1.8)
    expect(both.storeName).toBe('Cheap Bricks')
    expect(both.country).toBe('DE')

    // And the per-part plan still buys each line wherever it is cheapest,
    // which is not one seller — the two questions have two answers.
    expect(plan.lines.find((line) => line.key === 'a')?.store).toBe('one')
    expect(plan.lines.find((line) => line.key === 'b')?.store).toBe('both')
  })

  it('counts the lines a seller cannot fill in full', async () => {
    const plan = await planPurchase(
      [wanting({
        quantity: 10 
      })],
      walking([lot({
        store: 'few',
        quantity: 3 
      })])
    )
    expect(plan.stores[0].short).toBe(1)
    expect(plan.stores[0].quantity).toBe(3)
  })

  it('walks the lots once however long the list is', async () => {
    let walks = 0
    const walk: LotWalk = async (visit) => {
      walks++
      visit(lot({}))
    }
    await planPurchase(
      Array.from({
        length: 50 
      }, (_, index) => wanting({
        key: String(index) 
      })),
      walk
    )
    // A cursor over every lot brickzuke holds, once — not once per part.
    expect(walks).toBe(1)
  })

  it('does not walk at all for a list with nothing buyable on it', async () => {
    let walks = 0
    await planPurchase([wanting({
      record: undefined,
      userItemId: 1 
    })], async () => {
      walks++
    })
    expect(walks).toBe(0)
  })
})
