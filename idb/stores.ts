export interface StoreDefinition {
  name: string
  keyPath: string | string[]
  autoIncrement?: boolean
}
const stores: {
  CALLS: StoreDefinition
  QUEUED_CALLS: StoreDefinition
  ITEM_TYPES: StoreDefinition
  BRICK_LINK_ITEM_TYPES: StoreDefinition
  ITEMS: StoreDefinition
  BRICK_LINK_ITEMS: StoreDefinition
  COLORS: StoreDefinition
  BRICK_LINK_COLORS: StoreDefinition
  CATEGORIES: StoreDefinition
  BRICK_LINK_CATEGORIES: StoreDefinition
  PART_AND_COLOR_CODES: StoreDefinition
  BRICK_LINK_PART_AND_COLOR_CODES: StoreDefinition
  ITEM_INVENTORIES: StoreDefinition
  COLOR_ITEMS: StoreDefinition
  COLOR_SCOPES: StoreDefinition
  STORE_REGIONS: StoreDefinition
  STORE_COUNTRIES: StoreDefinition
  BRICK_LINK_STORES: StoreDefinition
  STORE_LOTS: StoreDefinition
  STORE_LOT_SCOPES: StoreDefinition
} = {
  CALLS: {
    name: 'calls',
    keyPath: 'url',
  },
  QUEUED_CALLS: {
    name: 'queuedCalls',
    keyPath: 'id',
    autoIncrement: true
  },
  ITEMS: {
    name: 'items',
    keyPath: 'id',
    autoIncrement: true
  },
  BRICK_LINK_ITEMS: {
    name: 'brickLinkItems',
    keyPath: 'id'
  },
  ITEM_TYPES: {
    name: 'itemTypes',
    keyPath: 'id',
    autoIncrement: true
  },
  BRICK_LINK_ITEM_TYPES: {
    name: 'brickLinkItemTypes',
    keyPath: 'itemTypeId'
  },
  COLORS: {
    name: 'colors',
    keyPath: 'id',
    autoIncrement: true
  },
  BRICK_LINK_COLORS: {
    name: 'brickLinkColors',
    keyPath: 'colorId'
  },
  CATEGORIES: {
    name: 'categories',
    keyPath: 'id',
    autoIncrement: true
  },
  BRICK_LINK_CATEGORIES: {
    name: 'brickLinkCategories',
    keyPath: 'categoryId'
  },
  PART_AND_COLOR_CODES: {
    name: 'partAndColorCodes',
    keyPath: 'id',
    autoIncrement: true
  },
  BRICK_LINK_PART_AND_COLOR_CODES: {
    name: 'brickLinkPartAndColorCodes',
    keyPath: 'partAndColorCodeId'
  },
  /**
   * What a set is made of: one record per part in one set.
   *
   * Unlike every other store here this is not filled by a bulk download —
   * BrickLink states an inventory one item at a time, so this fills in as items
   * are opened rather than all at once.
   */
  ITEM_INVENTORIES: {
    name: 'itemInventories',
    keyPath: 'id'
  },
  /**
   * What comes in one colour: one record per item BrickLink lists for a
   * colour, under `P` for the parts made in it and `S` for the sets containing
   * it. Filled the same way inventories are — a page at a time, when someone
   * asks — because the bulk downloads state a colour's counts and never which
   * items they are.
   */
  COLOR_ITEMS: {
    name: 'colorItems',
    keyPath: 'id'
  },
  /**
   * How much of a colour was fetched: one record per scope, holding the pages
   * BrickLink says it runs to and the pages actually stored.
   *
   * Kept because the difference outlives the session that found it. A colour
   * stopped at the page cap is read back from IndexedDB ever after, and rows
   * alone cannot say whether a thousand of them is the whole answer or the
   * first fifth of it.
   */
  COLOR_SCOPES: {
    name: 'colorScopes',
    keyPath: 'scope'
  },
  /**
   * The parts of the world BrickLink groups its sellers by — `Europe`, `Asia`.
   * One record per region, holding how many countries it lists.
   */
  STORE_REGIONS: {
    name: 'storeRegions',
    keyPath: 'name'
  },
  /**
   * A country with sellers in it: its code, its flag, the region it sits in
   * and how many stores BrickLink counts there.
   *
   * Kept for the same reason inventories are. The store directory is one page
   * for every country at once and a page per country for the sellers in it,
   * and none of it was held anywhere but memory — so every reload asked
   * BrickLink for the whole world again.
   */
  STORE_COUNTRIES: {
    name: 'storeCountries',
    keyPath: 'countryCode'
  },
  /** One seller, under the country whose page listed it. */
  BRICK_LINK_STORES: {
    name: 'brickLinkStores',
    keyPath: 'id'
  },
  /**
   * One lot a seller has for sale, under the seller who has it.
   *
   * Kept, unlike the lots off an item's page, which are held in memory because
   * a price is only true while the lot is there. The difference is what it
   * costs to ask: an item's lots are one request, and a store's are one per
   * hundred of them — sixty for a middling seller. Something that expensive is
   * not paid twice for the same look.
   */
  STORE_LOTS: {
    name: 'storeLots',
    keyPath: 'id'
  },
  /**
   * How much of a seller's inventory was fetched: one record per store,
   * holding the lots BrickLink says it has and the pages actually stored.
   *
   * The sibling of COLOR_SCOPES, and kept for the same reason — a store
   * stopped at the page cap is read back from IndexedDB ever after, and rows
   * alone cannot say whether three thousand of them is the whole answer.
   */
  STORE_LOT_SCOPES: {
    name: 'storeLotScopes',
    keyPath: 'store'
  }
}

export default stores
