export interface StoreDefinition {
  name: string
  keyPath: string | string[]
  autoIncrement?: boolean
}
const stores: {
  CALLS: StoreDefinition
  SEARCHES: StoreDefinition
  SEARCH_FILTERS: StoreDefinition
  QUEUED_CALLS: StoreDefinition
  ITEM_TYPES: StoreDefinition
  BRICK_LINK_ITEM_TYPES: StoreDefinition
  ITEMS: StoreDefinition
  BRICK_LINK_ITEMS: StoreDefinition
  COLORS: StoreDefinition
  BRICK_LINK_COLORS: StoreDefinition
} = {
  CALLS: {
    name: 'calls',
    keyPath: 'url',
  },
  SEARCHES: {
    name: 'searches',
    keyPath: 'id',
    autoIncrement: true
  },
  SEARCH_FILTERS: {
    name: 'searchFilters',
    keyPath: ['searchId', 'objectType', 'objectKey']
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
  }
}

export default stores
