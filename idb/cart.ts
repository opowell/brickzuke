/**
 * Carts, and the lots in them.
 *
 * The purchase, held apart from the intent: a shopping list says what is
 * wanted and leaves the seller to the planner, and a cart says which lots, from
 * whom, and how many of each. The two meet nowhere in the data — a cart is
 * filled from the lots table, one quantity box at a time, against whichever
 * cart the `activeCart` setting names.
 *
 * A line is found by its lot, not by its key. The box on a lot knows the lot's
 * BrickLink id and nothing else about the cart, so [setCartLine] is the one
 * write it makes: a quantity for that lot in that cart, which makes a line, or
 * changes one, or — at nought — removes it. [setCartLines] is the same for a
 * table of them at once, which is what the buttons over the column do.
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import type { Cart, CartLine } from './userTypes'
import { dbDelete, putAll } from './db'
import {createRecord,
  listChildren,
  listRecords,
  removeRecord,
  removeWithChildren,
  updateRecord} from './userRecord'

export const NEW_CART_NAME = 'New cart'

/** What a lot says of itself, as much of it as a line keeps — see [CartLine]. */
export type CartLot = Omit<CartLine, 'id' | 'cartId' | 'quantity'>

export async function createCart(
  db: IDBPDatabase,
  name: string = NEW_CART_NAME
): Promise<Cart> {
  return createRecord<Cart>(db, stores.CARTS, {
    name,
    createdAt: new Date()
  })
}

export async function updateCart(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<Cart, 'id'>>
): Promise<Cart | undefined> {
  return updateRecord<Cart>(db, stores.CARTS, id, changes)
}

/** The cart and the lots in it both — see [removeWithChildren]. */
export async function deleteCart(db: IDBPDatabase, id: number): Promise<void> {
  return removeWithChildren(db, stores.CARTS, stores.CART_LINES, indices.CART_LINES_BY_CART, id)
}

export async function loadCarts(db: IDBPDatabase): Promise<Cart[]> {
  return listRecords<Cart>(db, stores.CARTS)
}

export async function loadCartLines(db: IDBPDatabase, cartId: number): Promise<CartLine[]> {
  return listChildren<CartLine>(db, indices.CART_LINES_BY_CART, cartId)
}

/**
 * How many of one lot a cart holds, set.
 *
 * Nought — or less, or nothing finite — takes the lot out; anything else puts
 * it in at that many, making the line if there is none. What the lot said of
 * itself is written over on every change, so a line's price is the one the box
 * was beside when it was last touched, and not the one from a month ago.
 *
 * Gives back the line as it stands, or nothing where it was removed.
 */
export async function setCartLine(
  db: IDBPDatabase,
  cartId: number,
  lot: CartLot,
  quantity: number
): Promise<CartLine | undefined> {
  const held = (await loadCartLines(db, cartId)).find((line) => line.lotId === lot.lotId)
  const wanted = Number.isFinite(quantity) ? Math.round(quantity) : 0
  if (wanted <= 0) {
    if (held) {
      await removeRecord(db, stores.CART_LINES, held.id)
    }
    return undefined
  }
  if (held) {
    return updateRecord<CartLine>(db, stores.CART_LINES, held.id, {
      ...lot,
      quantity: wanted
    })
  }
  return createRecord<CartLine>(db, stores.CART_LINES, {
    ...lot,
    cartId,
    quantity: wanted
  })
}

export async function updateCartLine(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<CartLine, 'id'>>
): Promise<CartLine | undefined> {
  return updateRecord<CartLine>(db, stores.CART_LINES, id, changes)
}

export async function removeCartLine(db: IDBPDatabase, id: number): Promise<void> {
  return removeRecord(db, stores.CART_LINES, id)
}

/** One lot and how many of it — what the header's Apply hands over per row. */
export interface CartLineChange {
  lot: CartLot
  quantity: number
}

/**
 * [setCartLine] for many lots at once: the lines read once, and the puts made
 * in one transaction rather than one each.
 *
 * A seller runs to thousands of lots, and "every one of them to the most the
 * seller has" is that many lines — `putAll` exists for exactly this, as the
 * note on it in db.ts says. The removals are still one each, `dbDelete` being
 * what there is; they are the cheaper half, and a cart emptied is the rarer
 * press. The last change for a lot named twice is the one that stands.
 */
export async function setCartLines(
  db: IDBPDatabase,
  cartId: number,
  changes: CartLineChange[]
): Promise<void> {
  const held = new Map((await loadCartLines(db, cartId)).map((line) => [line.lotId, line]))
  // By lot, so a lot proposed twice is written once, at the later figure —
  // and a lot removed and then wanted again is wanted.
  const puts = new Map<string, Omit<CartLine, 'id'> | CartLine>()
  const removed = new Set<number>()
  for (const {
    lot, quantity
  } of changes) {
    const wanted = Number.isFinite(quantity) ? Math.round(quantity) : 0
    const line = held.get(lot.lotId)
    if (wanted <= 0) {
      puts.delete(lot.lotId)
      if (line) {
        removed.add(line.id)
      }
      continue
    }
    if (line) {
      removed.delete(line.id)
    }
    puts.set(
      lot.lotId,
      line
        ? {
          ...line,
          ...lot,
          quantity: wanted
        }
        : {
          ...lot,
          cartId,
          quantity: wanted
        }
    )
  }
  if (puts.size) {
    await putAll(db, stores.CART_LINES, Array.from(puts.values()))
  }
  for (const id of removed) {
    await dbDelete(db, stores.CART_LINES, id)
  }
}
