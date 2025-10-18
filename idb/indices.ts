import stores, { type StoreDefinition } from './stores'

export interface IndexDefinition {
  store: StoreDefinition
  name: string
  keyPath: string | string[]
}
const indices: {
  QUEUED_CALLS_BY_DATE: IndexDefinition
  BRICK_LINK_CATEGORIES_BY_CATEGORY_ID: IndexDefinition
  BRICK_LINK_COLORS_BY_COLOR_ID: IndexDefinition
  BRICK_LINK_ITEM_TYPES_BY_ITEM_TYPE_ID: IndexDefinition
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
  }
}

export default indices
