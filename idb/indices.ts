import stores, { type StoreDefinition } from './stores'

export interface IndexDefinition {
  store: StoreDefinition
  name: string
  keyPath: string | string[]
}
const indices: {
  QUEUED_CALLS_BY_DATE: IndexDefinition
  BRICK_LINK_CATEGORIES_BY_CATEGORY_ID: IndexDefinition
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
  }
}

export default indices
