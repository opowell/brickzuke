/**
 * Handing a cart to BrickLink: every lot in it, into the buyer's cart there.
 *
 * A cart here is lots from several sellers, and a cart there is one per
 * seller, so the hand-off is a request per seller — see [cart-add] — each
 * addressed by the numeric id the lots were fetched by, which [storeIdFor]
 * learns from the seller's front page when nothing in memory knows it. The
 * sellers are taken one at a time rather than all at once: the extension
 * makes one fetch per message, and a front page still to be read is a queue
 * drain in the middle of it.
 *
 * What happened is kept here, by cart, for the cell that made the press to
 * draw — see [CellCartActions]. Nothing is written to the cart itself: the
 * lots stay where they were, so the same press twice is the same lots twice
 * in BrickLink's cart, which is what BrickLink's own Add to Cart does too.
 */
import { ref } from 'vue'
import type { CartLine } from '../../idb/userTypes'
import { loadCartLines } from '../../idb/cart'
import { getDbConnection } from '../../idb/idb'
import { addToBrickLinkCart } from '../stores/bricklink/cart-add'
import type { CartAddRefusal } from '../stores/bricklink/cart-add'
import { storeIdFor } from './storeLotsFetch'

/** How a hand-off stands: under way, done, or gone wrong. */
export interface CartTransfer {
  state: 'working' | 'done' | 'failed'
  /** The one line the cell shows. */
  text: string
  /** The rest — which lots were refused and why — for the hover. */
  detail: string
}

/** The latest hand-off of each cart, by the cart's id. */
export const cartTransfers = ref<Map<number, CartTransfer>>(new Map())

export function cartTransferOf(cartId: number): CartTransfer | undefined {
  return cartTransfers.value.get(cartId)
}

function report(cartId: number, transfer: CartTransfer) {
  cartTransfers.value.set(cartId, transfer)
}

/** The lines by the seller each is from, in the order the sellers first appear. */
export function linesBySeller(lines: CartLine[]): Map<string, CartLine[]> {
  const bySeller = new Map<string, CartLine[]>()
  for (const line of lines) {
    const own = bySeller.get(line.store)
    if (own) {
      own.push(line)
    } else {
      bySeller.set(line.store, [line])
    }
  }
  return bySeller
}

/** `12 lots`, `1 lot`. */
function lots(count: number): string {
  return `${count} lot${count === 1 ? '' : 's'}`
}

/** The refusals as lines of text, each naming the lot as the cart table does. */
function refusalDetail(refused: CartAddRefusal[], lines: CartLine[]): string {
  const byLot = new Map(lines.map((line) => [line.lotId, line]))
  return refused
    .map(({
      lotId, reason
    }) => {
      const line = byLot.get(lotId)
      const name = line ? [line.name, line.colorName].filter(Boolean).join(', ') : lotId
      return `${name} (${line?.storeName ?? line?.store ?? ''}): ${reason}`
    })
    .join('\n')
}

/** One hand-off per cart at a time: a second press while one runs is the first. */
const inFlight = new Map<number, Promise<void>>()

/**
 * Puts every lot in the cart into the buyer's BrickLink cart, seller by
 * seller, and reports how it went.
 *
 * A seller whose front page cannot be had — no extension, or none answering —
 * stops the run there, since the sellers after it would fail the same way;
 * what went in before it stays in, and the report says how far it got.
 */
export function moveCartToBrickLink(cartId: number): Promise<void> {
  const running = inFlight.get(cartId)
  if (running) {
    return running
  }
  const attempt = (async () => {
    const db = await getDbConnection()
    let lines: CartLine[]
    try {
      lines = await loadCartLines(db, cartId)
    } finally {
      db.close()
    }
    if (!lines.length) {
      report(cartId, {
        state: 'failed',
        text: 'Nothing to add',
        detail: 'The cart holds no lots.'
      })
      return
    }
    const bySeller = linesBySeller(lines)
    let added = 0
    const refused: CartAddRefusal[] = []
    let sent = 0
    for (const [store, own] of bySeller) {
      report(cartId, {
        state: 'working',
        text: `Adding… ${sent + 1} of ${bySeller.size} seller${bySeller.size === 1 ? '' : 's'}`,
        detail: `Sending ${lots(own.length)} to ${own[0].storeName ?? store}.`
      })
      try {
        const sid = await storeIdFor(store)
        const outcome = await addToBrickLinkCart(
          store,
          sid,
          own.map((line) => ({
            lotId: line.lotId,
            quantity: line.quantity
          }))
        )
        added += outcome.added.length
        refused.push(...outcome.refused)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        const left = Array.from(bySeller.values()).slice(sent).flat()
        report(cartId, {
          state: 'failed',
          text: added ? `Added ${lots(added)}, then failed` : 'Failed',
          detail: [
            `${own[0].storeName ?? store}: ${reason}`,
            left.length > own.length
              ? `${lots(left.length - own.length)} from later sellers ${left.length - own.length === 1 ? 'was' : 'were'} not sent.`
              : '',
            refusalDetail(refused, lines)
          ]
            .filter(Boolean)
            .join('\n')
        })
        return
      }
      sent++
    }
    report(
      cartId,
      refused.length
        ? {
          state: 'failed',
          text: `Added ${added} of ${lots(lines.length)}`,
          detail: refusalDetail(refused, lines)
        }
        : {
          state: 'done',
          text: `Added ${lots(added)}`,
          detail: `Every lot is in your BrickLink cart, at ${bySeller.size} seller${bySeller.size === 1 ? '' : 's'}.`
        }
    )
  })().finally(() => {
    inFlight.delete(cartId)
  })
  inFlight.set(cartId, attempt)
  return attempt
}
