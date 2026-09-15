/**
 * A related-entity cell that a row already carries a field for — a
 * category's Type, a country's or province's Region — should narrow the
 * table it is on rather than pivot to that entity's own table. Categories'
 * Type used to leave for the items table on a press, and Countries' and
 * Provinces' Region used to leave for the regions table; these pin the fix,
 * staying on the table pressed from with the field added to whatever query
 * was already there.
 *
 * A count column is not this: Item types' Items and Categories columns, and
 * Regions' own Countries column, count a different population and rightly
 * pivot to it — see `pivotNarrow.test.ts`.
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
  countryColumns,
  provinceColumns
} = await import('../catalogSchema')

function columnOf(columns: ColumnDef[], key: string): ColumnDef {
  return columns.find((column) => column.key === key)!
}

/** Starts the route on one entity with `expr`, presses one cell, and reads back where it led. */
async function press(entity: string, columns: ColumnDef[], key: string, row: ShellRow, expr: string) {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: entity,
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

describe('pressing a related-entity cell a row already carries the field for', () => {
  it('narrows Categories by Type without leaving for the item types table', async () => {
    const row: ShellRow = {
      id: '748',
      entityKey: 'categories',
      entityLabel: 'Categories',
      fields: { typeId: 'P', name: 'Plate, Modified', items: 187 }
    }
    expect(await press('categories', categoryColumns, 'type', row, 'store:"Bunte Steinewelt"')).toEqual({
      entity: 'categories',
      expr: 'store:"Bunte Steinewelt" type:"P"'
    })
  })

  it('narrows Countries by Region without leaving for the regions table', async () => {
    const row: ShellRow = {
      id: 'DE',
      entityKey: 'countries',
      entityLabel: 'Countries',
      fields: { region: 'Europe', name: 'Germany', stores: 120 }
    }
    expect(await press('countries', countryColumns, 'region', row, 'stores>0')).toEqual({
      entity: 'countries',
      expr: 'stores>0 region:"Europe"'
    })
  })

  it('narrows Provinces by Region without leaving for the regions table', async () => {
    const row: ShellRow = {
      id: 'ON',
      entityKey: 'provinces',
      entityLabel: 'Provinces',
      fields: { region: 'North America', countryName: 'Canada', name: 'Ontario', stores: 4 }
    }
    expect(await press('provinces', provinceColumns, 'region', row, 'country:"CA"')).toEqual({
      entity: 'provinces',
      expr: 'country:"CA" region:"North America"'
    })
  })
})
