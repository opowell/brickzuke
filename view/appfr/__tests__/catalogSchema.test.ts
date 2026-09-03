import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { DataShell, createMemoryAdapter } from 'header-content-layout'
import type { DataSource, ShellRow } from 'header-content-layout'
import { catalogSchema } from '../catalogSchema'

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

/** By key, not by position: the schema declares every type brickzuke counts. */
const itemsEntity = () => catalogSchema.value.entities.find((entity) => entity.key === 'items')!

describe('items schema', () => {
  it('states the population the way brickzuke states it', () => {
    // formatInteger's default breakpoints, not a raw integer — and never the
    // bare 0 a hardcoded count showed.
    expect(itemsEntity().count).toBe('10.0k')
    expect(mountShell().text()).toContain('10.0k')
  })

  it('draws the seven columns the table has today', () => {
    const headers = mountShell().findAll('th').map((th) => th.text().replace(/[↑↓]\s*$/, '').trim())
    expect(headers).toEqual(['#', '', 'Type', 'Name', 'Category', 'Year', 'Weight', 'Dimensions'])
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
