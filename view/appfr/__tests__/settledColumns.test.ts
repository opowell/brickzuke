/**
 * Dropping the columns a query has already answered.
 *
 * A column asks a question of every row. Once the query fixes the answer, the
 * column is the same value repeated down the table — `Store` under
 * `store:"brick8"` — which is width spent saying what the header already says.
 *
 * These pin both halves: which columns go, and which stay. A column removed
 * because a filter *might* have settled it is worse than one left in, so the
 * cases that must not fire are as much of this as the cases that must.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { DataShell, PARAM_ENTITY, PARAM_EXPR, createMemoryAdapter } from 'header-content-layout'
import type { DataSource, ShellRow } from 'header-content-layout'
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
  catalogSchema
} = await import('../catalogSchema')

/** Puts the app where a press would, then reads a type's columns back. */
async function columnsOf(entity: string, expr = ''): Promise<string[]> {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: entity,
      [PARAM_EXPR]: expr
    }
  })
  const type = catalogSchema.value.entities.find((one) => one.key === entity)!
  return (type.columns ?? []).map((column) => column.key ?? column.label ?? '')
}

describe('a seller\'s own lots', () => {
  it('drops every column the seller settles, not just the one naming them', async () => {
    const columns = await columnsOf('inventories', 'store:"brick8"')
    // The seller is fixed, so where they are and what feedback they carry are
    // fixed with it — one store has one country and one score, and three
    // columns of the same value are three columns of nothing.
    expect(columns).not.toContain('storeName')
    expect(columns).not.toContain('countryName')
    expect(columns).not.toContain('feedback')
    // What varies over one seller's lots is what they are selling.
    expect(columns).toContain('item')
    expect(columns).toContain('color')
    expect(columns).toContain('priceValue')
  })

  it('keeps the seller columns when the lots are one item\'s', async () => {
    const columns = await columnsOf('inventories', 'record:"P-3001"')
    // The other way round: every row is the same item, and who is selling it
    // is the whole question. Feedback earns its place here and only here.
    expect(columns).not.toContain('item')
    expect(columns).toContain('storeName')
    expect(columns).toContain('countryName')
    expect(columns).toContain('feedback')
  })

  it('names a row by the remark once the item is settled', async () => {
    await router.replace({
      path: '/',
      query: {
        [PARAM_ENTITY]: 'inventories',
        [PARAM_EXPR]: 'record:"P-3001"'
      }
    })
    const type = catalogSchema.value.entities.find((one) => one.key === 'inventories')!
    const identity = (type.columns ?? []).find((column) => column.role === 'identity')
    // The identity is what names a row wherever the shell is not drawing a
    // table. Dropping the Item column must not leave nothing naming anything.
    expect(identity?.key).toBe('description')
  })

  it('leaves everything alone when the query narrows nothing', async () => {
    const columns = await columnsOf('inventories')
    expect(columns).toEqual(
      expect.arrayContaining(['item', 'color', 'storeName', 'countryName', 'feedback'])
    )
  })

  it('keeps a column a query narrows to more than one value', async () => {
    const columns = await columnsOf('inventories', 'store:"brick8" OR store:"steinehaus"')
    // Two sellers still differ row to row, so the column still says something.
    expect(columns).toContain('storeName')
  })

  it('keeps a column narrowed by something other than equality', async () => {
    const columns = await columnsOf('inventories', 'quantity>10 store:"brick8"')
    expect(columns).not.toContain('storeName')
    expect(columns).toContain('quantity')
  })
})

describe('the store directory', () => {
  it('drops the country column from one country\'s sellers', async () => {
    const columns = await columnsOf('stores', 'country:"DE"')
    expect(columns).not.toContain('country')
    expect(columns).toContain('province')
    expect(columns).toContain('items')
  })

  it('drops the region column from one region\'s countries', async () => {
    const columns = await columnsOf('countries', 'region:"Europe"')
    expect(columns).not.toContain('region')
    expect(columns).toContain('stores')
  })
})

/** One lot off an item's own page, as `toStoreInventoryRow` shapes it. */
const lot: ShellRow = {
  id: '552481250',
  entityKey: 'inventories',
  entityLabel: 'Store inventories',
  fields: {
    id: '552481250',
    record: 'P-3001',
    itemName: 'Brick 2 x 4',
    description: 'Heavy playwear.',
    price: 'EUR 0.10',
    priceValue: 0.1,
    nativePrice: 'US $0.12',
    colorName: 'Red',
    colorid: 5,
    country: 'FI',
    countryName: 'Finland',
    store: 'kotkamies',
    storeName: 'Mompi Bear Bricks',
    condition: 'U',
    conditionName: 'Used',
    quantity: 1,
    feedback: 95,
    type: 'P',
    itemId: '3001'
  }
}

/**
 * The table as the shell actually draws it, with the schema and the route
 * agreeing — which is the state the app is in, ItemsShell handing the shell
 * the same router this schema reads.
 */
async function mountLots(expr: string) {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: 'inventories',
      [PARAM_EXPR]: expr
    }
  })
  const source: DataSource = {
    query: () => ({
      rows: [lot],
      total: 1,
      unfiltered: false
    })
  }
  const shell = mount(DataShell, {
    props: {
      schema: catalogSchema.value,
      source,
      route: createMemoryAdapter(
        `?${PARAM_ENTITY}=inventories&v=table&${PARAM_EXPR}=${encodeURIComponent(expr)}`
      ),
      defaults: {
        landing: 'entity',
        entity: 'inventories',
        view: 'table'
      },
    },
  })
  for (let i = 0; i < 10; i++) {
    await nextTick()
  }
  return shell
}

describe('the table the shell draws', () => {
  it('draws headers and a row for a seller\'s lots', async () => {
    const shell = await mountLots('store:"kotkamies"')
    const text = shell.text()
    expect(text).toContain('Item')
    expect(text).toContain('Brick 2 x 4')
  })

  it('still draws them once the item is settled and the identity moves', async () => {
    // The regression this exists for: promoting the identity onto another
    // column left the table drawing nothing at all — no rows and no header —
    // while the count above it went on saying how many there were.
    const shell = await mountLots('record:"P-3001"')
    const text = shell.text()
    expect(text).toContain('Remark')
    expect(text).toContain('Heavy playwear.')
  })
})
