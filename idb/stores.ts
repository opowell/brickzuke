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
  }
}

export default stores
