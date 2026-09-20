/**
 * Where the presses on a shopping list lead, and what they leave behind.
 *
 * A list's three tables are addressed by `shoplist:` and by nothing else, so
 * the press that opens one must not carry the query it was pressed under
 * across: `record:"S-10116-1"` — the set whose inventory "Shop parts" was
 * pressed on, or the set a reader narrowed the lists table to — is a record
 * term, which `narrowTo` keeps, and on the plan it is matched against each
 * *part's* record, none of which is the set. That is how the first press on a
 * set's inventory landed on `Nothing matches this query` over a list that had
 * every part on it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { PARAM_ENTITY, PARAM_EXPR, PARAM_SORT } from 'header-content-layout'
import type { ColumnDef, ShellRow } from 'header-content-layout'
import router from '@/router'

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
    selectedCounts: ref(undefined)
  }
})

const {
  openOn
} = await import('../catalogSchema')
const {
  shopListColumns
} = await import('../userSchema')

function columnOf(columns: ColumnDef[], key: string): ColumnDef {
  return columns.find((column) => column.key === key)!
}

const listRow: ShellRow = {
  id: '6',
  entityKey: 'shopLists',
  entityLabel: 'Shopping lists',
  fields: {
    id: 6,
    name: 'Parts for S-10116-1',
    record: 'S-10116-1',
    parts: 27,
    pieces: 44 
  }
}

beforeEach(async () => {
  await router.replace({
    path: '/',
    query: {} 
  })
})

describe('opening a shopping list', () => {
  it('leaves the set the inventory was open on behind — the bar button press', async () => {
    await router.replace({
      path: '/',
      query: {
        [PARAM_ENTITY]: 'inventory',
        [PARAM_EXPR]: 'record:"S-10116-1"',
        [PARAM_SORT]: 'name'
      }
    })
    openOn('shopPlan', 'shoplist', '6')
    await flushPromises()
    const query = router.currentRoute.value.query
    expect(query[PARAM_ENTITY]).toBe('shopPlan')
    expect(query[PARAM_EXPR]).toBe('shoplist:"6"')
    // The plan sorts its own way; the inventory's sort was on a column it has not got.
    expect(query[PARAM_SORT]).toBeUndefined()
  })

  it.each([
    ['parts', 'shopListItems'],
    ['shop', 'shopPlan'],
    ['sellers', 'shopStores']
  ])('does the same from the %s column of the lists table, to %s', async (key, entity) => {
    await router.replace({
      path: '/',
      query: {
        [PARAM_ENTITY]: 'shopLists',
        [PARAM_EXPR]: 'record:"S-10116-1"'
      }
    })
    columnOf(shopListColumns, key).click?.(listRow, {})
    await flushPromises()
    const query = router.currentRoute.value.query
    expect(query[PARAM_ENTITY]).toBe(entity)
    expect(query[PARAM_EXPR]).toBe('shoplist:"6"')
  })

  it('does nothing for a row with no id', async () => {
    await router.replace({
      path: '/',
      query: {
        [PARAM_ENTITY]: 'shopLists' 
      }
    })
    columnOf(shopListColumns, 'shop').click?.({
      ...listRow,
      fields: {} 
    }, {})
    await flushPromises()
    expect(router.currentRoute.value.query[PARAM_ENTITY]).toBe('shopLists')
  })
})
