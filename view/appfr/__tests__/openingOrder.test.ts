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

  it('opens a colour list on the parts count, biggest first', () => {
    const opened = openedQuery(query({
      entity: 'colors',
      sort: 'name' 
    }), null)
    // `items` is the field behind the column the colour guide labels Parts.
    expect(opened.sort).toBe('items')
    expect(opened.dir).toBe('desc')
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

  it('leaves the view someone picked while a table is up', () => {
    // A view is a choice like a sort is: made while a type is up, it is
    // theirs, and the next query change is not an arrival at anything.
    const chosen = query({
      entity: 'categories',
      view: 'cards',
      sort: 'items',
      dir: 'desc'
    })
    expect(openedQuery(chosen, 'categories')).toBe(chosen)
  })

  it('opens as a table on arrival, whatever view was carried in', () => {
    const opened = openedQuery(query({
      entity: 'colors',
      view: 'cards'
    }), 'items')
    expect(opened.view).toBe('table')
  })

  it('leaves the home screen alone — it is the cards view of every type', () => {
    const home = query({})
    expect(openedQuery(home, 'categories')).toBe(home)
  })

  it('sends a cleared type back to the home screen rather than to an empty Everything', () => {
    // The shell's Everything is a table across every type at once, which
    // brickzuke answers with nothing. Pressing it from inside a table left the
    // table view standing over no type, which is that empty screen.
    const opened = openedQuery(query({
      view: 'table',
      sort: 'items',
      dir: 'desc',
      page: 3
    }), 'categories')
    expect(opened.view).toBe('cards')
    expect(opened.page).toBe(1)
    // Nothing else touched: the sort is still the one that was up, and the
    // home screen does not read it.
    expect(opened.sort).toBe('items')
    expect(opened.dir).toBe('desc')
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

  it('resolves a URL that names a type and no view to that type as a table', () => {
    const parsed = parseQuery('?e=items', catalogSchema.value, shellDefaultsFor('items'))
    expect(parsed.view).toBe('table')
  })

  it('resolves a URL naming neither to the home screen, which is cards', () => {
    const parsed = parseQuery('', catalogSchema.value, shellDefaultsFor(null))
    expect(parsed.view).toBe('cards')
  })

  /*
   * The half that makes a picked view survive being read back: it differs from
   * what the type in force opens as, so the shell writes it to the URL, and
   * the URL is where the query lives.
   */
  it('reads a view named against a type back as that view', () => {
    const parsed = parseQuery('?e=items&v=cards', catalogSchema.value, shellDefaultsFor('items'))
    expect(parsed.view).toBe('cards')
  })
})
