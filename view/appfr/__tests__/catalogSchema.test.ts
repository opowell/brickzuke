import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { DataShell, createMemoryAdapter } from 'header-content-layout'
import type { DataSource, ShellRow } from 'header-content-layout'
import type { ColumnDef } from 'header-content-layout'
import {catalogSchema,
  categoryColumns,
  colorColumns,
  colorItemColumns,
  conditionColumns,
  countryColumns,
  imageColumns,
  inventoryColumns,
  itemColumns,
  itemInventoryColumns,
  itemRecordColumns,
  itemTypeColumns,
  itemVariantColumns,
  regionColumns,
  storeColumns,
  storeInventoryColumns,
  yearColumns} from '../catalogSchema'

vi.mock('../../../model', async () => {
  const {
    ref 
  } = await import('vue')
  return {
    filters: ref([]),
    search: ref(undefined),
    selectedItemType: ref(null),
    itemTypes: ref([
      {
        id: 'items',
        label: 'Items' 
      }
    ]),
    processingCounts: ref(false),
    selectedCounts: ref({
      items: 9988 
    }),
  }
})

const row: ShellRow = {
  id: '42',
  entityKey: 'items',
  entityLabel: 'Items',
  fields: {
    name: 'Brick 2 x 4 (3001)',
    itemType: 'P',
    itemTypeId: 'P',
    itemTypeName: 'Part',
    category: 'Brick (5)',
    categoryId: '5',
    image: 'https://img.example/3001.png',
    year: '1958',
    weight: '2.52',
    dimensions: '2 x 4',
  },
}

const source: DataSource = {
  query: () => ({
    rows: [row],
    total: 1,
    unfiltered: true 
  }),
}

function mountShell() {
  return mount(DataShell, {
    props: {
      schema: catalogSchema.value,
      source,
      route: createMemoryAdapter('?e=items&v=table'),
      defaults: {
        landing: 'entity',
        entity: 'items',
        view: 'table' 
      },
    },
  })
}

/**
 * The category a narrowed query names, as its own table would return it.
 *
 * `category` is the field the entity gives as its `scope`, and the field an
 * item row carries the same id in — one name for one thing, which is what lets
 * the term be read in both directions.
 */
const category: ShellRow = {
  // The BrickLink id the term names, which is what the row is keyed by —
  // appfr 0.15 picks the record out of what matched by finding the row that
  // *has* the id, rather than taking the first row back. `fields.id` stays
  // brickzuke's own key, that being what the categories table narrows itself
  // by; the two numbers are different and both are in use.
  id: '5',
  entityKey: 'categories',
  entityLabel: 'Categories',
  fields: {
    id: '1',
    category: 5,
    name: 'Brick (1)',
  },
}

/**
 * The items table narrowed to one category, which is what pressing a category
 * leaves behind: `category:"5"`, and a source that answers for both types —
 * the rows on screen, and the one record the term names.
 */
function mountNarrowed() {
  return mount(DataShell, {
    props: {
      schema: catalogSchema.value,
      source: {
        query: (request) =>
          request.entity?.key === 'categories'
            ? {
              rows: [category],
              total: 1,
              unfiltered: false 
            }
            : {
              rows: [row],
              total: 1,
              unfiltered: false 
            },
      } satisfies DataSource,
      route: createMemoryAdapter('?e=items&v=table&q=category%3A%225%22'),
      defaults: {
        landing: 'entity',
        entity: 'items',
        view: 'table' 
      },
    },
  })
}

describe('a query that names a record', () => {
  it('says which record, and not only its id', async () => {
    const shell = mountNarrowed()
    await nextTick()
    // What appfr 0.13 added: the header runs the term back against the type
    // the field points at and states what came back. The id stays — it is what
    // the expression field holds and what a pasted URL carries — but it is no
    // longer the whole of what the header says.
    expect(shell.text()).toContain('Brick (1)')
    expect(shell.text()).toContain('5')
  })
})

/** By key, not by position: the schema declares every type brickzuke counts. */
const itemsEntity = () => catalogSchema.value.entities.find((entity) => entity.key === 'items')!

describe('items schema', () => {
  it('abbreviates the population the way brickzuke writes every count', () => {
    // Through brickzuke's own `formatInteger`, not grouped through appfr's
    // `formatCount` — and never the bare 0 a hardcoded count showed. A
    // population is read for its size, and `10.0k` is the same abbreviation
    // the counts in the cells beside it are written in.
    expect(itemsEntity().count).toBe('10.0k')
    expect(mountShell().text()).toContain('10.0k')
  })

  it('has the shell write its own live count the same way', async () => {
    // The list of types states the population of every type and, on the one in
    // force under a narrowed query, how many rows matched — and that number is
    // the shell's own. `formatCount` on the schema is what hands it brickzuke's
    // hand to write it in; without it the control read `Items · 198,689` beside
    // the abbreviated populations of everything else on the list.
    const shell = mount(DataShell, {
      props: {
        schema: catalogSchema.value,
        source: {
          query: () => ({
            rows: [row],
            total: 198689,
            unfiltered: false
          })
        } satisfies DataSource,
        route: createMemoryAdapter('?e=items&v=table&q=brick'),
        defaults: {
          landing: 'entity',
          entity: 'items',
          view: 'table'
        }
      }
    })
    await nextTick()
    expect(shell.find('option[value="items"]').text()).toBe('Items · 199k')
  })

  it('draws the seven columns the table has today, and the parts count beside them', () => {
    const headers = mountShell().findAll('th').map((th) => th.text().replace(/[↑↓]\s*$/, '').trim())
    expect(headers).toEqual([
      '#',
      '',
      'Type',
      'Name',
      'Category',
      'Year',
      'Parts',
      'Weight',
      'Dimensions'
    ])
  })

  it('renders the image column as a picture, not text', () => {
    expect(mountShell().find('td img').attributes('src')).toBe('https://img.example/3001.png')
  })

  it('formats the weight through brickzuke formatInteger', () => {
    // 2.52 grams is 252 centigrams, which the breakpoints read back as 2.5g —
    // the same string TableComponent puts in that cell today.
    expect(mountShell().text()).toContain('2.5g')
  })

  it('shows a year as a year rather than a quantity', () => {
    expect(mountShell().text()).toContain('1958')
    expect(mountShell().text()).not.toContain('2.0k')
  })
})

/**
 * A column whose heading is a sort button in the original, which is every
 * heading it has. The two that are not: an ordinal is the position under
 * whatever sort is up rather than a value to sort by, and a picture is a
 * picture.
 */
function labelled(columns: ColumnDef[]) {
  return columns.filter(
    (column) => column.label && column.kind !== 'ordinal' && column.key !== 'image'
  )
}

describe('sortable columns', () => {
  it('names a sort on every labelled column of every table', () => {
    for (const columns of [
      itemColumns,
      categoryColumns,
      colorColumns,
      itemTypeColumns,
      itemRecordColumns,
      inventoryColumns,
      colorItemColumns,
      itemInventoryColumns,
      itemVariantColumns,
      storeInventoryColumns,
      conditionColumns,
      yearColumns,
      regionColumns,
      countryColumns,
      storeColumns,
      imageColumns,
    ]) {
      expect(labelled(columns).filter((column) => !column.sort).map((column) => column.key))
        .toEqual([])
    }
  })

  it('offers each of those sorts on the type that draws the column', () => {
    // A column can name a sort its type does not declare, and the shell then
    // draws the heading as plain text — so the two lists have to agree or the
    // button quietly is not one.
    for (const entity of catalogSchema.value.entities) {
      const offered = new Set((entity.sorts ?? []).map((sort) => sort.key))
      const missing = (entity.columns ?? [])
        .filter((column) => column.sort && !offered.has(column.sort))
        .map((column) => column.key)
      expect([entity.key, missing]).toEqual([entity.key, []])
    }
  })
})

/**
 * The home screen is a summary of the catalogue, so a table brickzuke has and
 * this schema does not name is a line missing from that summary.
 *
 * brickzuke keeps two models. `model.ts` counts five types, which is what the
 * bulk downloads fill and what this schema was first built from;
 * `view/stores/models.ts` lists nine more — the stores scraped off BrickLink,
 * the countries and regions they sit in, what a seller has for sale, and the
 * cross-sections the original slices all of it by. Named rather than counted,
 * because the assertion is that none of them is missing.
 */
describe('the catalogue this summarises', () => {
  it('names every table brickzuke has', () => {
    expect(catalogSchema.value.entities.map((entity) => entity.key)).toEqual([
      'categories',
      'colors',
      'itemTypes',
      'items',
      'partAndColorCodes',
      'itemInventories',
      'itemVariants',
      'inventories',
      'conditions',
      'years',
      'regions',
      'countries',
      'stores',
      'images',
    ])
  })

  it('claims no count for a type nothing counts', () => {
    // Blank rather than `0`: brickzuke has never counted a country, and a card
    // reading zero says it counted and found none.
    const stores = catalogSchema.value.entities.find((entity) => entity.key === 'stores')!
    expect(stores.count).toBe('')
  })
})

/**
 * A type on the home screen with nothing behind it is a card that leads to an
 * empty table, which is what all nine of the tables below were until they were
 * wired up.
 *
 * `partAndColorCodes` is the one exception and stays one: brickzuke counts the
 * codes and stores them, but the original draws no table for them either, so
 * there are no columns to move.
 */
describe('every type on the home screen', () => {
  it('has columns behind it, bar the one the original never drew', () => {
    const bare = catalogSchema.value.entities
      .filter((entity) => !(entity.columns ?? []).length)
      .map((entity) => entity.key)
    expect(bare).toEqual(['partAndColorCodes'])
  })

  it('offers a sort for every table it draws', () => {
    const unsorted = catalogSchema.value.entities
      .filter((entity) => (entity.columns ?? []).length && !(entity.sorts ?? []).length)
      .map((entity) => entity.key)
    expect(unsorted).toEqual([])
  })
})

/**
 * A `scope` names the field other records carry this type's id in, and nothing
 * complains when it names one nobody carries — an unresolvable field is not a
 * constraint in this language, so the term matches every row and the header
 * states the first of them as confidently as it would the right one.
 *
 * So: every scope declared here is a field some type's rows actually hold, and
 * no two types claim the same one.
 */
describe('the scopes this schema declares', () => {
  it('names one type each', () => {
    const scopes = catalogSchema.value.entities
      .map((entity) => entity.scope)
      .filter((scope): scope is string => !!scope)
    expect(scopes.length).toBe(new Set(scopes).size)
  })

  it('names a field the type it points at can be found by', () => {
    for (const entity of catalogSchema.value.entities) {
      if (!entity.scope) {
        continue
      }
      // The type has to be able to say which record a term names, which means
      // a column asked to be the one that says it.
      const identity = (entity.columns ?? []).find((column) => column.role === 'identity')
      expect([entity.key, !!identity]).toEqual([entity.key, true])
    }
  })
})
