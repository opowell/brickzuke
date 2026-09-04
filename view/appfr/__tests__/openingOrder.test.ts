/**
 * How each table opens, both halves of it: the order applied on arrival, and
 * the same order standing in for a URL that names no sort.
 */
import { describe, it, expect, vi } from 'vitest'
import { parseQuery } from 'header-content-layout'
import type { ShellQuery } from 'header-content-layout'
import { openedQuery, shellDefaultsFor } from '../openingOrder'

vi.mock('../../../model', async () => {
  const {
    ref 
  } = await import('vue')
  return {
    filters: ref([]),
    search: ref(undefined),
    selectedItemType: ref(null),
    itemTypes: ref([]),
    processingCounts: ref(false),
    selectedCounts: ref(undefined),
  }
})

const {
  catalogSchema 
} = await import('../catalogSchema')

/** A query as the shell hands one over, with the fields under test named. */
function query(fields: Partial<ShellQuery>): ShellQuery {
  return {
    entity: null,
    view: 'cards',
    sort: 'updated',
    dir: 'asc',
    expr: '',
    facets: {},
    page: 1,
    ...fields,
  }
}

describe('opening order', () => {
  it('opens a category list on the item count, biggest first', () => {
    // What pressing Categories on the home screen produces: the shell falls
    // back to a sort of its own, and the original's is the league table.
    const opened = openedQuery(query({
      entity: 'categories',
      sort: 'name' 
    }), null)
    expect(opened.sort).toBe('items')
    expect(opened.dir).toBe('desc')
    expect(opened.view).toBe('table')
  })

  it('opens every other table A-to-Z, whatever sort was carried in', () => {
    const opened = openedQuery(query({
      entity: 'items',
      sort: 'type' 
    }), 'categories')
    expect(opened.sort).toBe('name')
    expect(opened.dir).toBe('asc')
  })

  it('leaves the sort someone picked while a table is up', () => {
    const chosen = query({
      entity: 'categories',
      view: 'table',
      sort: 'name' 
    })
    expect(openedQuery(chosen, 'categories')).toBe(chosen)
  })

  it('leaves the home screen alone — it is the cards view of every type', () => {
    const home = query({})
    expect(openedQuery(home, 'categories')).toBe(home)
  })

  it('resolves a URL that names no sort to the order that table opens in', () => {
    const parsed = parseQuery(
      '?e=categories&v=table',
      catalogSchema.value,
      shellDefaultsFor('categories')
    )
    expect(parsed.sort).toBe('items')
    expect(parsed.dir).toBe('desc')
  })
})
