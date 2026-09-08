/**
 * What pressing a picture asks for.
 *
 * A thumbnail on any table that has a colour on the row is of a part in that
 * colour, so the press has to carry both halves: the part alone is the picture
 * with the colour taken out of it, which is what it used to lead to. These pin
 * the pair, and pin the one table where there is no colour to carry.
 */
import { describe, it, expect, vi } from 'vitest'
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
  colorItemColumns,
  imageColumns,
  inventoryColumns,
  itemInventoryColumns,
  itemVariantColumns,
  storeInventoryColumns
} = await import('../catalogSchema')

/** A row of whichever table, carrying the fields a picture presses on. */
function rowOf(fields: Record<string, unknown>): ShellRow {
  return {
    id: '1',
    entityKey: 'inventories',
    entityLabel: 'Store inventories',
    fields
  }
}

function imageOf(columns: ColumnDef[]): ColumnDef {
  return columns.find((column) => column.key === 'image')!
}

/** Presses a picture and reads back where the app ended up. */
async function press(columns: ColumnDef[], fields: Record<string, unknown>) {
  imageOf(columns).click?.(rowOf(fields))
  // The press pushes without awaiting, so the route is a navigation behind
  // until the microtasks it queued have run.
  await flushPromises()
  const query = router.currentRoute.value.query
  return {
    entity: query[PARAM_ENTITY],
    expr: query[PARAM_EXPR]
  }
}

const coloured = {
  type: 'P',
  itemId: '3001',
  colorid: 11
}

describe('pressing a picture', () => {
  it('asks for the part in that colour, on every table that has one', async () => {
    for (const columns of [
      inventoryColumns,
      colorItemColumns,
      itemInventoryColumns,
      itemVariantColumns,
      storeInventoryColumns
    ]) {
      // The lots table addressed by the item and narrowed to the colour, which
      // is BrickLink's part-and-colour page: everyone selling that brick in
      // black.
      expect(await press(columns, coloured)).toEqual({
        entity: 'inventories',
        expr: 'record:"P-3001" colorid:"11"'
      })
    }
  })

  it('falls back to the catalogue entry for a row with no colour', async () => {
    // The pictures table knows which item a photograph is of and nothing more,
    // so the press leads where it always did rather than to a colour it would
    // have to invent.
    expect(await press(imageColumns, {
      type: 'P',
      itemId: '3001'
    })).toEqual({
      entity: 'items',
      expr: 'name:"(P-3001)"'
    })
  })

  it('leads nowhere when the row does not say which item', async () => {
    await press(storeInventoryColumns, coloured)
    // Nothing to address the lots by is nothing to ask for, so the press is a
    // no-op rather than a navigation to `record:"-"`.
    expect(await press(storeInventoryColumns, {
      colorid: 11
    })).toEqual({
      entity: 'inventories',
      expr: 'record:"P-3001" colorid:"11"'
    })
  })
})
