/**
 * What pressing a row means, now that brickzuke turns it off.
 *
 * appfr 0.21.0 moved narrowing off the `→` beside a name and onto the row
 * itself, and 0.22.0 made it take the cards view with it. brickzuke took both
 * defaults for a while, which put two presses on top of each other: the row's,
 * and the ones its own cells make — a row of a type nothing can name being
 * nobody's way in. `ItemsShell` now sets `row-press="open"`, so a row never
 * narrows on its own; these pin what is left — a cell that leads somewhere
 * still does, on its own press, and the one record-scoped narrow no cell
 * covered (a bare press on a country) moved onto the cell naming the record.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import {DataShell,
  PARAM_ENTITY,
  PARAM_EXPR,
  PARAM_VIEW,
  createMemoryAdapter,
  formatExpression,
  parseExpression} from 'header-content-layout'
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

/** One country of the directory, its flag drawn in the name's cell. */
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

/** One part in one colour, whose picture is a press of its own. */
const variant: ShellRow = {
  id: '3001-5',
  entityKey: 'itemVariants',
  entityLabel: 'Item variants',
  fields: {
    id: '3001-5',
    variant: '3001-5',
    type: 'P',
    itemId: '3001',
    colorid: 5,
    name: 'Brick 2 x 4',
    sets: 12,
    image: 'https://img.bricklink.com/P/5/3001.jpg'
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
async function mountTable(entity: string, row: ShellRow, expr = '') {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: entity,
      ...(expr ? {
        [PARAM_EXPR]: expr
      } : {})
    }
  })
  const source: DataSource = {
    query: () => ({
      rows: [row],
      total: 1,
      unfiltered: false
    })
  }
  const params = new URLSearchParams({
    [PARAM_ENTITY]: entity,
    [PARAM_VIEW]: 'table'
  })
  if (expr) {
    params.set(PARAM_EXPR, expr)
  }
  const route = createMemoryAdapter(`?${params.toString()}`)
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
      // What `ItemsShell` itself passes — see the comment on its `DataShell`.
      rowPress: 'open',
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

/**
 * The expression the real app router has landed on, read back through the
 * parser rather than compared as text — see `homePress.test.ts`'s `landed`.
 *
 * `narrowingTo`/`narrowBy` write through catalogSchema's own `router` import,
 * which is this same singleton — not the `MemoryAdapter` `mountTable` hands
 * the mounted `DataShell`, that being how a row's own press writes instead.
 */
function askedOfRouter() {
  const expr = router.currentRoute.value.query[PARAM_EXPR]
  return typeof expr === 'string' ? formatExpression(parseExpression(expr)) : ''
}

describe('pressing a row', () => {
  it('does nothing, for a type a cell can narrow to', async () => {
    const {
      shell, route
    } = await mountTable('colors', color)
    const before = route.search.value
    await shell.get('.dc-table__row').trigger('click')
    await nextTick()
    // `row-press="open"` reports the press rather than applying it, and
    // ItemsShell wires no `@activate` to do anything with the report — the
    // row is exactly as inert as a lot's, below.
    expect(route.search.value).toBe(before)
  })

  it('leaves the query alone for a type nothing carries the id of', async () => {
    const {
      shell, route
    } = await mountTable('inventories', part)
    const before = route.search.value
    await shell.get('.dc-table__row').trigger('click')
    await nextTick()
    expect(route.search.value).toBe(before)
  })

  it('narrows a country on top of what is asked, pressed by its name', async () => {
    const {
      shell
    } = await mountTable('countries', country, 'region:"Europe"')
    // The name is a button of its own now — see CellFlag and `countryColumns`
    // — narrowing to the record rather than the row: `narrowingTo` writes the
    // same `country:"DE"` term a row press used to, merged with whatever else
    // was already asked, so a reader who came in through Europe stays there.
    const name = shell.findAll('.flagged__name').find((one) => one.text() === 'Germany')
    expect(name).toBeDefined()
    expect(shell.get('.dc-table__row').find('img[src*="flags"]').exists()).toBe(true)
    await name!.trigger('click')
    await flushPromises()
    const expr = askedOfRouter()
    expect(expr).toContain('region:Europe')
    expect(expr).toContain('country:DE')
  })

  it('does not also narrow the row the name button sits on', async () => {
    const {
      shell
    } = await mountTable('countries', country, 'region:"Europe"')
    const name = shell.findAll('.flagged__name').find((one) => one.text() === 'Germany')
    await name!.trigger('click')
    await flushPromises()
    // One press, one navigation — the button's own `stopPropagation`, same as
    // every other cell that leads somewhere. Without it, this write happened
    // twice, and `country:"DE"` would appear in the expression twice over.
    const expr = askedOfRouter()
    expect((expr.match(/country:/g) ?? []).length).toBe(1)
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
    } = await mountTable('itemVariants', variant)
    const before = route.search.value
    // The thumbnail, drawn by CellImage: the part in that colour on offer,
    // not the variant row.
    const picture = shell.get('img[src*="3001"]')
    await picture.trigger('click')
    await nextTick()
    expect(route.search.value).toBe(before)
  })
})

describe('what ItemsShell hands the shell', () => {
  /** ItemsShell over a type, or over none of them — the home screen's URL. */
  async function mounted(entity: string | null) {
    await router.replace({
      path: '/',
      query: entity ? {
        [PARAM_ENTITY]: entity
      } : {}
    })
    const shell = mount(ItemsShell, {
      global: {
        plugins: [router]
      },
    })
    for (let i = 0; i < 10; i++) {
      await nextTick()
    }
    return shell
  }

  it('turns row press off for every type, scoped or not, and for none at all', async () => {
    // Once this varied by type — a mark the stylesheet read, on for the types
    // a press could narrow. There is no longer a press for it to read: every
    // cell that leads somewhere says so on its own, or it is not asked at all.
    for (const entity of ['colors', 'countries', 'categories', 'stores', 'years', 'items', 'inventories', 'images', null]) {
      const shell = await mounted(entity)
      expect(shell.findComponent(DataShell).props('rowPress')).toBe('open')
    }
  })
})
