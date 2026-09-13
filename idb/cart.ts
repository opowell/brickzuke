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
 * changes one, or — at nought — removes it.
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import type { Cart, CartLine } from './userTypes'
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
