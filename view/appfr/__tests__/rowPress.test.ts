/**
 * What pressing a row means, now that the shell applies it.
 *
 * appfr 0.21.0 moved narrowing off the `→` beside a name and onto the row
 * itself, and 0.22.0 made it take the cards view with it. brickzuke takes both
 * defaults, which puts two presses on top of each other: the row's, and the
 * ones its own cells make. These pin the settlement — a cell that leads
 * somewhere is not also the row's way in, and a row of a type nothing can name
 * is still nobody's way in.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import {DataShell,
  ENTITY_ALL,
  PARAM_ENTITY,
  PARAM_EXPR,
  PARAM_VIEW,
  createMemoryAdapter,
  isTypeCardsQuery,
  parseQuery} from 'header-content-layout'
import type { DataSource, MemoryAdapter, ShellRow } from 'header-content-layout'
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

const ItemsShell = (await import('../../components/ItemsShell.vue')).default

// The home screen reads the catalogue through brickzuke's own stores, so a
// mount of the whole shell needs one to read from.
beforeEach(() => {
  setActivePinia(createPinia())
})

/** One colour of the guide, as `toColorRow` shapes it: counts and a swatch. */
const color: ShellRow = {
  id: '5',
  entityKey: 'colors',
  entityLabel: 'Colors',
  fields: {
    id: 5,
    colorid: 5,
    name: 'Red',
    items: 1200,
    sets: 340,
    image: 'https://img.bricklink.com/color/5.png'
  }
}

/** One country of the directory, whose flag is a picture that leads somewhere. */
const country: ShellRow = {
  id: 'DE',
  entityKey: 'countries',
  entityLabel: 'Countries',
  fields: {
    country: 'DE',
    name: 'Germany',
    stores: 120,
    region: 'Europe',
    image: 'https://img.bricklink.com/flags/DE.gif'
  }
}

/** One part of a set, off a table nothing carries the id of. */
const part: ShellRow = {
  id: 'P-3001',
  entityKey: 'inventories',
  entityLabel: 'Store inventories',
  fields: {
    id: 'P-3001',
    record: 'P-3001',
    itemName: 'Brick 2 x 4',
    description: 'Heavy playwear.',
    priceValue: 0.1,
    price: 'EUR 0.10',
    colorName: 'Red',
    storeName: 'Mompi Bear Bricks',
    countryName: 'Finland',
    conditionName: 'Used',
    quantity: 1
  }
}

/**
 * The table as the shell draws it, with the schema and the route agreeing —
 * the state the app is in, ItemsShell handing the shell the same router this
 * schema reads.
 */
async function mountTable(entity: string, row: ShellRow) {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: entity
    }
  })
  const source: DataSource = {
    query: () => ({
      rows: [row],
      total: 1,
      unfiltered: false
    })
  }
  const route = createMemoryAdapter(`?${PARAM_ENTITY}=${entity}&${PARAM_VIEW}=table`)
  const shell = mount(DataShell, {
    props: {
      schema: catalogSchema.value,
      source,
      route,
      defaults: {
        landing: 'entity',
        entity,
        view: 'table'
      },
    },
  })
  for (let i = 0; i < 10; i++) {
    await nextTick()
  }
  return {
    shell,
    route
  }
}

/** What the shell has written to its own address, as the query it parses to. */
function asked(route: MemoryAdapter) {
  const params = new URLSearchParams(route.search.value)
  return {
    entity: params.get(PARAM_ENTITY) ?? '',
    expr: params.get(PARAM_EXPR) ?? '',
    view: params.get(PARAM_VIEW) ?? ''
  }
}

describe('pressing a row', () => {
  it('narrows to the record, and takes the cards view with it', async () => {
    const {
      shell, route
    } = await mountTable('colors', color)
    await shell.get('.dc-table__row').trigger('click')
    await nextTick()
    const query = asked(route)
    // `colorid` is what the colour type declares as its scope, and `5` is the
    // row's id — BrickLink's colour number, not brickzuke's own key.
    expect(query.expr).toContain('colorid:"5"')
    // No type, and cards: a record is not a one-row list of itself, it is what
    // every other type holds of it. `Everything` is what the shell writes, and
    // it parses back to the empty entity ItemsShell's `openedQuery` reads.
    expect(query.entity).toBe(ENTITY_ALL)
    expect(query.view).toBe('cards')
    // And that is the home screen: read back through the defaults the type was
    // under, `Everything` parses to no entity at all, which is the query
    // ItemsShell hands to HomeCards rather than to the shell's results area.
    const parsed = parseQuery(route.search.value, catalogSchema.value, {
      landing: 'entity',
      entity: 'colors',
      view: 'table'
    })
    expect(parsed.entity).toBeNull()
    expect(isTypeCardsQuery(parsed)).toBe(true)
  })

  it('leaves the query alone for a type nothing carries the id of', async () => {
    const {
      shell, route
    } = await mountTable('inventories', part)
    const before = route.search.value
    await shell.get('.dc-table__row').trigger('click')
    await nextTick()
    // A lot is a leaf: no type declares a field naming one, so the press is
    // reported and brickzuke handles no `activate`. An unresolvable field is
    // true in this language, so a term written anyway would match everything.
    expect(route.search.value).toBe(before)
  })

  it('drops no arrow on the rows it narrows, the row being it', async () => {
    const {
      shell
    } = await mountTable('countries', country)
    // The `→` was the control this press replaced. Two controls for one move,
    // and the smaller of them the harder to hit.
    expect(shell.get('.dc-table__row').text()).not.toContain('→')
  })
})

describe('pressing a cell that leads somewhere', () => {
  it('does not also narrow to the row it is on', async () => {
    const {
      shell, route
    } = await mountTable('colors', color)
    const before = route.search.value
    // The Parts count, drawn by CellCount: it opens that colour's parts on
    // BrickLink's own listing, which is a different table rather than a
    // narrowing of this one.
    const parts = shell.findAll('button').find((button) => button.text() === '1.2k')
    expect(parts).toBeDefined()
    await parts!.trigger('click')
    await nextTick()
    // One press, one navigation. Without the cell stopping the click, this
    // also put `colorid:"5"` in the shell's query on the way past.
    expect(route.search.value).toBe(before)
  })

  it('does not also narrow to the row when the cell is a picture', async () => {
    const {
      shell, route
    } = await mountTable('countries', country)
    const before = route.search.value
    // The flag, drawn by CellImage: a country's sellers, not the country.
    const flag = shell.get('img[src*="flags"]')
    await flag.trigger('click')
    await nextTick()
    expect(route.search.value).toBe(before)
  })
})

describe('the rows that offer themselves as pressable', () => {
  /** ItemsShell over a type, and the mark it puts on itself for the stylesheet. */
  async function marked(entity: string): Promise<string | undefined> {
    await router.replace({
      path: '/',
      query: {
        [PARAM_ENTITY]: entity
      }
    })
    const shell = mount(ItemsShell, {
      global: {
        plugins: [router]
      },
    })
    for (let i = 0; i < 10; i++) {
      await nextTick()
    }
    return shell.get('.items-shell').attributes('data-narrows-rows')
  }

  it('is the tables whose type declares a scope', async () => {
    // The shell gives every row the hand and the hover, not knowing which of
    // them its host has somewhere to send. These are the ones it does.
    for (const entity of ['colors', 'countries', 'categories', 'stores', 'years']) {
      expect(await marked(entity)).toBe('true')
    }
  })

  it('is not the tables of a type nothing carries the id of', async () => {
    // brickzuke's leaves: a press on one is reported and dropped, so the row
    // must not look like a control. The stylesheet reads this mark.
    for (const entity of ['items', 'inventories', 'images']) {
      expect(await marked(entity)).toBe('false')
    }
  })

  it('is not the home screen, which draws no table at all', async () => {
    await router.replace({
      path: '/'
    })
    const shell = mount(ItemsShell, {
      global: {
        plugins: [router]
      },
    })
    for (let i = 0; i < 10; i++) {
      await nextTick()
    }
    expect(shell.get('.items-shell').attributes('data-narrows-rows')).toBe('false')
  })
})
