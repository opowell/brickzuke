/**
 * What a cell that pivots to a different table does with a query already on
 * the screen, and which table it pivots to.
 *
 * The item types and categories tables are themselves scoped to nothing of
 * their own, so pressing "Part" or a category's name off a store's listing
 * used to throw the store away — `type:"Part"` on its own, rather than
 * `store:"Bunte Steinewelt" type:"Part"`. These pin the narrow on top of what
 * is already asked, the same shape `openWith`'s other callers get for free
 * once the fix is in one place.
 *
 * They also pin which table the narrow lands on. A count column names the
 * population it counts — Item types' Items column leads to the items table,
 * its Categories column to the categories table — so it pivots there. Name,
 * being the bucket's own identity and not a count of any one population,
 * pivots to `Everything` instead.
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
  itemInventoryColumns,
  itemTypeColumns,
  storeInventoryColumns
} = await import('../catalogSchema')

function columnOf(columns: ColumnDef[], key: string): ColumnDef {
  return columns.find((column) => column.key === key)!
}

/** Starts the route on `expr`, presses one cell, and reads back where it led. */
async function press(
  columns: ColumnDef[],
  key: string,
  row: ShellRow,
  expr: string,
  from = 'itemTypes'
) {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: from,
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
  await router.replace({
    path: '/',
    query: {} 
  })
})

const itemTypeRow: ShellRow = {
  id: '07',
  entityKey: 'itemTypes',
  entityLabel: 'Item types',
  fields: {
    type: 'Part',
    items: 14000,
    categories: 855 
  }
}

const categoryRow: ShellRow = {
  id: '748',
  entityKey: 'categories',
  entityLabel: 'Categories',
  fields: {
    category: 748,
    name: 'Plate, Modified',
    items: 187 
  }
}

describe('pressing a cell that pivots to a different table', () => {
  it('narrows an item type\'s Name to Everything, on top of a store already asked for', async () => {
    expect(await press(itemTypeColumns, 'name', itemTypeRow, 'store:"Bunte Steinewelt"')).toEqual({
      entity: undefined,
      expr: 'store:"Bunte Steinewelt" type:Part'
    })
  })

  it('narrows an item type\'s Items count to the items table, on top of a store already asked for', async () => {
    expect(await press(itemTypeColumns, 'items', itemTypeRow, 'store:"Bunte Steinewelt"')).toEqual({
      entity: 'items',
      expr: 'store:"Bunte Steinewelt" type:Part'
    })
  })

  it('narrows an item type\'s Categories count to the categories table', async () => {
    expect(await press(itemTypeColumns, 'categories', itemTypeRow, 'store:"Bunte Steinewelt"')).toEqual({
      entity: 'categories',
      expr: 'store:"Bunte Steinewelt" type:Part'
    })
  })

  it('narrows a category\'s Name to Everything, on top of a store already asked for', async () => {
    expect(await press(categoryColumns, 'name', categoryRow, 'store:"Bunte Steinewelt"')).toEqual({
      entity: undefined,
      expr: 'store:"Bunte Steinewelt" category:748'
    })
  })

  it('narrows a category\'s Items count to the items table', async () => {
    expect(await press(categoryColumns, 'items', categoryRow, 'store:"Bunte Steinewelt"')).toEqual({
      entity: 'items',
      expr: 'store:"Bunte Steinewelt" category:748'
    })
  })

  it('names a second record of its own field beside the first, on Everything', async () => {
    const row: ShellRow = {
      id: '05',
      entityKey: 'itemTypes',
      entityLabel: 'Item types',
      fields: {
        type: 'Minifigure',
        items: 1300,
        categories: 181 
      }
    }
    // A record's own name opens Everything, where two types named are either
    // of them — the same press the standing column's `+` makes. Only a type
    // opened on a record replaces the one before it — see `addTerms`.
    expect(await press(itemTypeColumns, 'name', row, 'type:"Set"')).toEqual({
      entity: undefined,
      expr: 'type:Set type:Minifigure'
    })
  })

  it('still replaces a term of its own field where it opens a type on a record', async () => {
    // The inventory table is opened on one set: an address is one lookup,
    // and two sets named are no address at all.
    const line: ShellRow = {
      id: 'S-10001-1',
      entityKey: 'itemInventories',
      entityLabel: 'Item inventories',
      fields: {
        record: 'S-10001-1' 
      }
    }
    expect(await press(itemInventoryColumns, 'record', line, 'record:"S-10511-1"')).toEqual({
      entity: 'inventory',
      expr: 'record:"S-10001-1"'
    })
  })

  it('drops a stray text term picked up while finding the row, pivoting to Everything', async () => {
    // "plate" narrowed the item types table down to find this row by name; it
    // says nothing once the press is on the record itself.
    expect(await press(itemTypeColumns, 'name', itemTypeRow, 'store:"Bunte Steinewelt" plate')).toEqual({
      entity: undefined,
      expr: 'store:"Bunte Steinewelt" type:Part'
    })
  })

  it('keeps a term the lots answered, pivoting from a country to its sellers', async () => {
    // The countries table has no quantity: `quantity>100` was put to the lots,
    // and the 47 beside Austria is its sellers with such a lot. The sellers'
    // table reads the term the same way, so it has to arrive there.
    const austria: ShellRow = {
      id: 'AT',
      entityKey: 'countries',
      entityLabel: 'Countries',
      fields: {
        country: 'AT',
        name: 'Austria',
        region: 'Europe',
        stores: 47
      }
    }
    expect(
      await press(countryColumns, 'stores', austria, 'region:Europe quantity>100', 'countries')
    ).toEqual({
      entity: 'stores',
      expr: 'region:Europe quantity>100 country:AT'
    })
  })

  it('drops a term the table being left answered itself', async () => {
    // `name` is a country's own name here, and would be a seller's name there.
    const austria: ShellRow = {
      id: 'AT',
      entityKey: 'countries',
      entityLabel: 'Countries',
      fields: {
        country: 'AT',
        name: 'Austria',
        stores: 153
      }
    }
    expect(await press(countryColumns, 'stores', austria, 'name:Aus quantity>100', 'countries')).toEqual({
      entity: 'stores',
      expr: 'quantity>100 country:AT'
    })
  })

  it('keeps a lot\'s own term, pivoting off the lots', async () => {
    // A lot's quantity is the lots' own field, and the one every other type
    // is read off through the join — so it means the same thing everywhere.
    const lot: ShellRow = {
      id: '1',
      entityKey: 'inventories',
      entityLabel: 'Store inventories',
      fields: {
        type: 'P',
        itemId: '4073',
        colorid: 11
      }
    }
    expect(
      await press(storeInventoryColumns, 'image', lot, 'quantity>100 store:jgutzwar97', 'inventories')
    ).toEqual({
      entity: undefined,
      expr: 'quantity>100 store:jgutzwar97 record:P-4073 colorid:11'
    })
  })
})
