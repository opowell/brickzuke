/**
 * What a cell that pivots to a different table does with a query already on
 * the screen.
 *
 * The item types and categories tables are themselves scoped to nothing of
 * their own, so pressing "Part" or a category's name off a store's listing
 * used to throw the store away — `type:"Part"` on its own, rather than
 * `store:"Bunte Steinewelt" type:"Part"`. These pin the narrow on top of what
 * is already asked, the same shape `openWith`'s other callers get for free
 * once the fix is in one place.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { PARAM_ENTITY, PARAM_EXPR } from 'header-content-layout'
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
    selectedCounts: ref(undefined),
  }
})

const {
  categoryColumns,
  itemTypeColumns
} = await import('../catalogSchema')

function columnOf(columns: ColumnDef[], key: string): ColumnDef {
  return columns.find((column) => column.key === key)!
}

/** Starts the route on `expr`, presses one cell, and reads back where it led. */
async function press(columns: ColumnDef[], key: string, row: ShellRow, expr: string) {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: 'itemTypes',
      [PARAM_EXPR]: expr
    }
  })
  columnOf(columns, key).click?.(row)
  await flushPromises()
  const query = router.currentRoute.value.query
  return {
    entity: query[PARAM_ENTITY],
    expr: query[PARAM_EXPR]
  }
}

beforeEach(async () => {
  await router.replace({ path: '/', query: {} })
})

describe('pressing a cell that pivots to a different table', () => {
  it('narrows an item type on top of a store already asked for', async () => {
    const row: ShellRow = {
      id: '07',
      entityKey: 'itemTypes',
      entityLabel: 'Item types',
      fields: { type: 'Part', items: 14000, categories: 855 }
    }
    expect(await press(itemTypeColumns, 'name', row, 'store:"Bunte Steinewelt"')).toEqual({
      entity: 'items',
      expr: 'store:"Bunte Steinewelt" type:Part'
    })
  })

  it('narrows a category on top of a store already asked for', async () => {
    const row: ShellRow = {
      id: '748',
      entityKey: 'categories',
      entityLabel: 'Categories',
      fields: { category: 748, name: 'Plate, Modified', items: 187 }
    }
    expect(await press(categoryColumns, 'name', row, 'store:"Bunte Steinewelt"')).toEqual({
      entity: 'items',
      expr: 'store:"Bunte Steinewelt" category:748'
    })
  })

  it('still replaces a term of its own field, rather than ANDing two values of it', async () => {
    const row: ShellRow = {
      id: '05',
      entityKey: 'itemTypes',
      entityLabel: 'Item types',
      fields: { type: 'Minifigure', items: 1300, categories: 181 }
    }
    // A query already asking for one type pivoting to another states which
    // type it means now — asking for both at once would find nothing.
    expect(await press(itemTypeColumns, 'name', row, 'type:"Set"')).toEqual({
      entity: 'items',
      expr: 'type:"Minifigure"'
    })
  })
})
