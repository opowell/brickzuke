import stores, { type StoreDefinition } from './stores'

export interface IndexDefinition {
  store: StoreDefinition
  name: string // Cannot contain "space" character!
  keyPath: string | string[]
}
const indices: {
  QUEUED_CALLS_BY_DATE: IndexDefinition
  BRICK_LINK_CATEGORIES_BY_CATEGORY_ID: IndexDefinition
  BRICK_LINK_COLORS_BY_COLOR_ID: IndexDefinition
  BRICK_LINK_ITEM_TYPES_BY_ITEM_TYPE_ID: IndexDefinition
  BRICK_LINK_ITEMS_BY_ITEM_ID: IndexDefinition
  BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID: IndexDefinition
  ITEM_INVENTORIES_BY_RECORD: IndexDefinition
  COLOR_ITEMS_BY_SCOPE: IndexDefinition
  BRICK_LINK_STORES_BY_COUNTRY: IndexDefinition
  STORE_LOTS_BY_STORE: IndexDefinition
  STORE_LOTS_BY_RECORD: IndexDefinition
  USER_INVENTORY_LINES_BY_RECORD: IndexDefinition
  SHOP_LIST_ITEMS_BY_LIST: IndexDefinition
  CART_LINES_BY_CART: IndexDefinition
  PRICE_MODIFIERS_BY_PROFILE: IndexDefinition
} = {
  QUEUED_CALLS_BY_DATE: {
    store: stores.QUEUED_CALLS,
    name: 'date',
    keyPath: 'date',
  },
  BRICK_LINK_CATEGORIES_BY_CATEGORY_ID: {
    store: stores.BRICK_LINK_CATEGORIES,
    name: 'bzCategoryId',
    keyPath: 'bzCategoryId'
  },
  BRICK_LINK_COLORS_BY_COLOR_ID: {
    store: stores.BRICK_LINK_COLORS,
    name: 'bzColorId',
    keyPath: 'bzColorId'
  },
  BRICK_LINK_ITEM_TYPES_BY_ITEM_TYPE_ID: {
    store: stores.BRICK_LINK_ITEM_TYPES,
    name: 'bzItemTypeId',
    keyPath: 'bzItemTypeId'
  },
  BRICK_LINK_ITEMS_BY_ITEM_ID: {
    store: stores.BRICK_LINK_ITEMS,
    name: 'bzItemId',
    keyPath: 'bzItemId'
  },
  BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID: {
    store: stores.BRICK_LINK_ITEMS,
    name: 'categoryId',
    keyPath: 'categoryId'
  },
  /**
   * Every part of one set, by the BrickLink record it belongs to — `S-10511-1`.
   * The same shape as BRICK_LINK_ITEMS_BY_ITEM_ID: one indexed lookup answers
   * "what is in this".
   */
  ITEM_INVENTORIES_BY_RECORD: {
    store: stores.ITEM_INVENTORIES,
    name: 'record',
    keyPath: 'record'
  },
  /**
   * Every item of one colour and type — `P-2` is the parts made in colour 2.
   * The same shape as ITEM_INVENTORIES_BY_RECORD, and for the same reason: one
   * indexed lookup answers "what is in this".
   */
  COLOR_ITEMS_BY_SCOPE: {
    store: stores.COLOR_ITEMS,
    name: 'scope',
    keyPath: 'scope'
  },
  /**
   * Every seller in one country. The third of the same shape: one indexed
   * lookup answers "what is in this", and it is also how a country's page is
   * known to have been fetched at all.
   */
  BRICK_LINK_STORES_BY_COUNTRY: {
    store: stores.BRICK_LINK_STORES,
    name: 'countryID',
    keyPath: 'countryID'
  },
  /**
   * Every lot one seller has. The fourth of the same shape, and the reason a
   * store's inventory is read back rather than re-fetched.
   */
  STORE_LOTS_BY_STORE: {
    store: stores.STORE_LOTS,
    name: 'store',
    keyPath: 'store'
  },
  /**
   * Every stored lot of one item — `P-3001`, whoever is selling it. The same
   * store the other way round: a seller's front is fetched a seller at a time,
   * but what a query naming an item asks of those lots is "who has this", and
   * without this that was a walk over every lot held to find the few dozen
   * that are of it.
   */
  STORE_LOTS_BY_RECORD: {
    store: stores.STORE_LOTS,
    name: 'record',
    keyPath: 'record'
  },
  /**
   * Every part of one set of somebody's own, by the set's record — `U-3`. The
   * fifth of the same shape as ITEM_INVENTORIES_BY_RECORD, under the same
   * field, so `record:"U-3"` is the one indexed lookup answering "what is in
   * this" exactly as `record:"S-10511-1"` is.
   */
  USER_INVENTORY_LINES_BY_RECORD: {
    store: stores.USER_INVENTORY_LINES,
    name: 'record',
    keyPath: 'record'
  },
  /** Every part one shopping list wants. The sixth of them. */
  SHOP_LIST_ITEMS_BY_LIST: {
    store: stores.SHOP_LIST_ITEMS,
    name: 'listId',
    keyPath: 'listId'
  },
  /** Every lot in one cart. The seventh of them. */
  CART_LINES_BY_CART: {
    store: stores.CART_LINES,
    name: 'cartId',
    keyPath: 'cartId'
  },
  /**
   * Every factor in one price modifier profile. The eighth, and the last of
   * them — and the one whose store has no `id`: a factor is deleted by the
   * compound key this index hands back the row for, see [deletePriceModifierProfile].
   */
  PRICE_MODIFIERS_BY_PROFILE: {
    store: stores.PRICE_MODIFIERS,
    name: 'profileId',
    keyPath: 'profileId'
  }
}

export default indices
