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
}

export default indices
