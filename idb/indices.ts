import stores, { type StoreDefinition } from './stores'

export interface IndexDefinition {
  store: StoreDefinition
  name: string
  keyPath: string | string[]
}
const indices: {
  QUEUED_CALLS_BY_DATE: IndexDefinition
} = {
  QUEUED_CALLS_BY_DATE: {
    store: stores.QUEUED_CALLS,
    name: 'date',
    keyPath: 'date',
  },
}

export default indices
