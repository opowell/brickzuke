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
