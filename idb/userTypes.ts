/**
 * What somebody wrote themselves.
 *
 * Every other type in brickzuke describes something BrickLink has: a category
 * it lists, an item it catalogues, a lot a seller is offering. These six
 * describe what a reader has of their own — a piece the catalogue does not
 * carry, a set they designed, a list of parts they mean to buy — and they are
 * the only records here that cannot be fetched again if they are lost. That is
 * the whole of what makes them different, and it is why the stores holding them
 * are exempt from the clearing in idb.ts.
 *
 * Not to be confused with `idb/types.ts`, which declares a `ShopList` and a
 * `ShopListItem` of its own. That file is the older model's type dump and
 * nothing imports it — `Cart`, `InvItem` and `Store` in it have no backing
 * store and no callers either. These are the live ones.
 *
 * A catalogue item is referred to by BrickLink's own record — `S-10511-1`,
 * `P-3001` — rather than by brickzuke's auto-increment key, because that is
 * what every table here already carries in `record` and what a lot on offer is
 * matched against. One of `record` and `userItemId` is set on a line; a line
 * naming neither is a line nothing can be bought for.
 */

/** A category of somebody's own, for what BrickLink has no category for. */
export interface UserCategory {
  id: number
  name: string
  createdAt: Date
}

/** An item of somebody's own. */
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

/** A set of somebody's own: a MOC, or parts to add to one the catalogue has. */
export interface UserInventory {
  id: number
  name: string
  /**
   * The BrickLink record this is about, where it is about one — `S-10511-1` for
   * the parts somebody means to add to that set. Absent for a set of their own.
   */
  record?: string
  createdAt: Date
}

/** One part of one such set. */
export interface UserInventoryLine {
  id: number
  inventoryId: number
  /** The catalogue item, where the part is one BrickLink lists. */
  record?: string
  /** A [UserItem] id, where it is one of theirs. */
  userItemId?: number
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
  /** The [UserInventory] the lines were copied from, where they were. */
  sourceInventoryId?: number
  /** The BrickLink set they were copied from, where it was a set. */
  sourceRecord?: string
  createdAt: Date
}

/** One wanted part. */
export interface ShopListItem {
  id: number
  listId: number
  record?: string
  userItemId?: number
  colorId?: string
  name?: string
  /** How many are wanted. The one figure the planner has to satisfy. */
  minQuantity: number
  /** The most to pay for one of them, in the currency the lots are shown in. */
  maxPrice?: number
  /** BrickLink's own code — `N` or `U` — or absent for either. */
  condition?: 'N' | 'U'
}
