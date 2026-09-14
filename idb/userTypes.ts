/**
 * What somebody wrote themselves.
 *
 * Every other type in brickzuke describes something BrickLink has: a category
 * it lists, an item it catalogues, a lot a seller is offering. These describe
 * what a reader has of their own — a piece the catalogue does not carry, a set
 * they designed, a list of parts they mean to buy, a cart of lots they mean to
 * order — and they are the only records here that cannot be fetched again if
 * they are lost. That is the whole of what makes them different, and it is why
 * the stores holding them are exempt from the clearing in idb.ts.
 *
 * Not to be confused with `idb/types.ts`, which declares a `ShopList` and a
 * `ShopListItem` of its own. That file is the older model's type dump and
 * nothing imports it — `Cart`, `InvItem` and `Store` in it have no backing
 * store and no callers either. These are the live ones.
 *
 * An item is referred to by its record — BrickLink's own for one of theirs,
 * `S-10511-1`, `P-3001`, and `U-3` for one of somebody's own: see
 * [userItemRecord]. One field, whichever kind, because that is what every
 * table here already carries in `record`, what a lot on offer is matched
 * against, and what a set's parts are filed under. A part with no record is
 * a part nothing can be bought for.
 */

/** A category of somebody's own, for what BrickLink has no category for. */
export interface UserCategory {
  id: number
  name: string
  createdAt: Date
}

/**
 * An item of somebody's own — a piece BrickLink does not list, or a set they
 * designed. Which of the two it is, is whether anything is filed under its
 * record in USER_INVENTORY_LINES: an item with parts is a set, as it is in
 * the catalogue.
 */
export interface UserItem {
  id: number
  name: string
  /**
   * The category it is filed under — one of BrickLink's or one of theirs, in
   * the one field, because a reader filing an item does not care which table
   * the category came from. BrickLink's id where it is BrickLink's, and the
   * negative of the [UserCategory] id where it is theirs: see [userCategoryRef]
   * for why the sign is the whole of the encoding.
   */
  categoryId?: number
  note?: string
  createdAt: Date
}

/**
 * One part of one of somebody's own sets.
 *
 * The same shape ITEM_INVENTORIES gives a part of a BrickLink set — the set it
 * is in, the part it is, how many — under the same `record`, so one table
 * lists both and one address opens either: `record:"U-3"` reads these where
 * `record:"S-10511-1"` reads BrickLink's.
 */
export interface UserInventoryLine {
  id: number
  /** The set this is a part of — always one of theirs, `U-3`. */
  record: string
  /** The part — BrickLink's, `P-3001`, or one of theirs, `U-5`. */
  part?: string
  /** BrickLink's own colour id, as every other table here holds it. */
  colorId?: string
  /** What the line is called, held on the line so a table can draw it. */
  name?: string
  quantity: number
}

/**
 * A list of parts to buy.
 *
 * What somebody wants, and not what they will get: which seller each line comes
 * from is worked out from the lots on offer when they ask — see [shopParts] —
 * because a price is true only while the lot is there.
 */
export interface ShopList {
  id: number
  name: string
  /** The set the lines were copied from, where they were — theirs or BrickLink's. */
  sourceRecord?: string
  createdAt: Date
}

/** One wanted part. */
export interface ShopListItem {
  id: number
  listId: number
  /** The part wanted — `P-3001`, or `U-5` for one of theirs, which no seller has. */
  record?: string
  colorId?: string
  name?: string
  /** How many are wanted. The one figure the planner has to satisfy. */
  minQuantity: number
  /** The most to pay for one of them, in the currency the lots are shown in. */
  maxPrice?: number
  /** BrickLink's own code — `N` or `U` — or absent for either. */
  condition?: 'N' | 'U'
}

/**
 * A cart: lots picked off sellers' tables, to be ordered.
 *
 * The other half of a shopping list. A list says what is wanted and leaves the
 * seller to the planner; a cart says which lots, from whom, and how many of
 * each — the decision, once it is made. Several can stand at once, and the one
 * being filled is the `activeCart` setting: the quantity box on every lot
 * writes into that one and no other.
 */
export interface Cart {
  id: number
  name: string
  createdAt: Date
}

/**
 * One lot in one cart, and how many of it.
 *
 * Keyed to the lot by BrickLink's own inventory id — the `id` every row of the
 * lots table carries, whether it came off an item's page or a seller's front —
 * so the box on a lot can find its own line. The rest is what the lot said of
 * itself when it was put in, kept here so the cart reads as parts and prices
 * rather than as ids: a lot goes stale, is re-fetched, or is sold out, and a
 * cart drawn only from lots still held would go blank line by line.
 */
export interface CartLine {
  id: number
  cartId: number
  /** BrickLink's inventory id for the lot — `421934511`. */
  lotId: string
  /** The seller's username, as a lot and a `store:` term carry it. */
  store: string
  storeName?: string
  /** The item the lot is of — `P-3001`. */
  record?: string
  name?: string
  colorId?: string
  colorName?: string
  /** BrickLink's own code, `N` or `U`. */
  condition?: string
  /** What one cost, converted, when it was put in. */
  price?: number
  /** The same, as BrickLink printed it — `EUR 0.11` — and in the seller's own currency. */
  displayPrice?: string
  nativePrice?: string
  /** How many the seller had, when it was put in: the most the box allows. */
  available?: number
  quantity: number
}

/**
 * A price modifier profile: one named set of factors.
 *
 * Somebody who buys for two purposes prices lots two ways — postage weighed
 * one way when an order is a handful of parts and another when it is a
 * set's worth, used lots welcome for one build and not for another — and a
 * single set of factors would have to be retyped between the two. So the
 * factors are filed under a profile, several profiles can stand at once, and
 * the one whose factors are applied to every lot is the `activeProfile`
 * setting: the factor box on every table writes into that one and no other,
 * and the modified price column reads that one and no other.
 */
export interface PriceModifierProfile {
  id: number
  name: string
  createdAt: Date
}

/**
 * A price modifier: a factor on the price of every lot of one thing, in one
 * profile.
 *
 * The thing is a row of one of the catalogue's cross-sections over the lots —
 * a colour, a seller, a category, a condition, a country, an item type — named
 * by the table it is a row of and the key that table's own `scope` field
 * carries: `colors` and `5` for Red, `stores` and `brickmeister`. A lot's
 * modified price is its price times every factor in the active profile that
 * applies to it, so a factor of 1.1 on Red and 0.9 on one seller prices that
 * seller's red lots at 0.99 of what they ask. Blank is no factor, and not a
 * factor of nought: nought is a factor, and prices every lot of the thing at
 * nothing. Below nought is refused, a negative price not being a price.
 *
 * Why anybody wants one: prices across sellers are not the whole cost — this
 * seller's postage is dear, that colour is always a bargain second-hand — and
 * a factor is the plainest way to say so once and have every lot say it.
 */
export interface PriceModifier {
  /** The [PriceModifierProfile] this is one factor of. */
  profileId: number
  /** The table the modified thing is a row of — `colors`, `stores`. */
  entity: string
  /** That row's key as its `scope` field carries it, as text — `5`, `brickmeister`. */
  key: string
  /** What the price is multiplied by. Nought or more. */
  factor: number
}
