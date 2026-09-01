import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({
    query: {} 
  }),
}))

import { useQueryStore } from '../query'

describe('queryStore filterString', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('serializes an include filter without an item', () => {
    const store = useQueryStore()
    store.filters = [{
      action: 'include',
      key: 'categories' 
    }]
    expect(store.filterString).toBe('i_categories')
  })

  it('serializes an exclude filter with an item', () => {
    const store = useQueryStore()
    store.filters = [{
      action: 'exclude',
      key: 'items',
      item: '3001' 
    }]
    expect(store.filterString).toBe('e_items_3001')
  })

  it('joins multiple filters with commas', () => {
    const store = useQueryStore()
    store.filters = [
      {
        action: 'include',
        key: 'categories',
        item: '5' 
      },
      {
        action: 'exclude',
        key: 'itemTypes' 
      },
    ]
    expect(store.filterString).toBe('i_categories_5,e_itemTypes')
  })

  it('round-trips through the setState parser format', () => {
    const store = useQueryStore()
    const original = [
      {
        action: 'include' as const,
        key: 'categories',
        item: '5' 
      },
      {
        action: 'exclude' as const,
        key: 'items',
        item: '3001' 
      },
    ]
    store.filters = original
    // Re-parse using the same logic setState() applies to the `f` query param.
    const reparsed = store.filterString!.split(',').map((filterString) => {
      const parts = filterString.split('_')
      const filter: { action: 'include' | 'exclude'; key: string; item?: string } = {
        action: parts[0] === 'i' ? 'include' : 'exclude',
        key: parts[1],
      }
      if (parts.length > 2) {
        filter.item = parts[2]
      }
      return filter
    })
    expect(reparsed).toEqual(original)
  })
})
