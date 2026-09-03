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
  }
}

export default stores
