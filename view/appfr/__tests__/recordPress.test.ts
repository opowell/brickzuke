/**
 * Where a press on a record's own name leads.
 *
 * The name of a category, a country or a seller is the record itself and not
 * a count of anything, so pressing it opens `Everything` narrowed to that
 * record — and, with ⇧ or ⌘ held, `Everything` with that record left out.
 * Either accumulates: two records named on one field are either of them,
 * and two left out are both left out, which is what two such presses asked
 * for.
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
    selectedCounts: ref(undefined)
  }
})

const {
  categoryColumns,
  countryColumns,
  storeColumns
} = await import('../catalogSchema')

function nameOf(columns: ColumnDef[]): ColumnDef {
  return columns.find((column) => column.role === 'identity')!
}

const category = (id: number): ShellRow => ({
  id: String(id),
  entityKey: 'categories',
  entityLabel: 'Categories',
  fields: {
    id,
    category: id,
    name: `Category ${id}`
  }
})

const country: ShellRow = {
  id: 'AT',
  entityKey: 'countries',
  entityLabel: 'Countries',
  fields: {
    id: 'AT',
    country: 'AT',
    name: 'Austria',
    region: 'Europe'
  }
}

const store: ShellRow = {
  id: '123',
  entityKey: 'stores',
  entityLabel: 'Stores',
  fields: {
    id: 123,
    store: 123,
    name: 'Bricks & Co',
    country: 'AT'
  }
}

async function open(entity: string | null, expr: string) {
  await router.replace({
    path: '/',
    query: {
      ...(entity ? {
        [PARAM_ENTITY]: entity 
      } : {}),
      ...(expr ? {
        [PARAM_EXPR]: expr 
      } : {})
    }
  })
}

function query() {
  return router.currentRoute.value.query
}

beforeEach(async () => {
  await open(null, '')
})

describe('pressing a record by its name', () => {
  it('opens Everything narrowed to it', async () => {
    await open('categories', 'name:brick')
    nameOf(categoryColumns).click!(category(5))
    await flushPromises()
    expect(query()[PARAM_ENTITY]).toBeUndefined()
    // The name term is a question about a value, which means nothing on the
    // far side; only record terms carry over, and there were none.
    expect(query()[PARAM_EXPR]).toBe('category:"5"')
  })

  it('opens Everything with it left out, when the press says so', async () => {
    await open('categories', '')
    nameOf(categoryColumns).click!(category(5), {
      exclude: true 
    })
    await flushPromises()
    expect(query()[PARAM_ENTITY]).toBeUndefined()
    expect(query()[PARAM_EXPR]).toBe('-category:5')
  })

  it('leaves a second record out beside the first', async () => {
    await open('categories', '-category:"5"')
    nameOf(categoryColumns).click!(category(7), {
      exclude: true 
    })
    await flushPromises()
    // Written back through the shell's formatter, which quotes only where it must.
    expect(query()[PARAM_EXPR]).toBe('-category:5 -category:7')
  })

  it('turns a record narrowed to into one left out, and back', async () => {
    await open('categories', 'category:"5"')
    nameOf(categoryColumns).click!(category(5), {
      exclude: true 
    })
    await flushPromises()
    expect(query()[PARAM_EXPR]).toBe('-category:5')
    nameOf(categoryColumns).click!(category(5))
    await flushPromises()
    expect(query()[PARAM_EXPR]).toBe('category:5')
  })

  it('narrows to a second record beside the first — either of them', async () => {
    await open('categories', 'category:"5"')
    nameOf(categoryColumns).click!(category(7))
    await flushPromises()
    // Both through the shell's formatter, which quotes only where it must —
    // the same text either way to the parse.
    expect(query()[PARAM_EXPR]).toBe('category:5 category:7')
  })

  it('carries the region a country was found under across', async () => {
    await open('countries', 'region:"Europe"')
    nameOf(countryColumns).click!(country, {
      exclude: true 
    })
    await flushPromises()
    expect(query()[PARAM_ENTITY]).toBeUndefined()
    expect(query()[PARAM_EXPR]).toBe('region:Europe -country:AT')
  })

  it('carries the country a seller was found under across', async () => {
    await open('stores', 'country:"AT"')
    nameOf(storeColumns).click!(store)
    await flushPromises()
    expect(query()[PARAM_ENTITY]).toBeUndefined()
    expect(query()[PARAM_EXPR]).toBe('country:AT store:123')
  })
})
