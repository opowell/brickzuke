/**
 * What a set is made of, on the tables that list sets.
 *
 * The number is unlike every other count in the catalogue: no bulk download
 * carries it, so it exists for the sets somebody has already opened and for no
 * others. That gives the column two states, and both of them are behaviour
 * worth pinning — the count where there is one, and a cell that still opens
 * the listing where there is not, that press being how the count gets known.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PARAM_ENTITY, PARAM_EXPR } from 'header-content-layout'
import type { ColumnDef, ShellRow } from 'header-content-layout'
import router from '@/router'

/**
 * The fill is a timer and a queue of BrickLink requests, and neither belongs
 * in a test of what a cell says. What is asserted here is only that the cell
 * asks — [partsFill] itself is pinned in partsFill.test.ts.
 */
const requestPartCount = vi.fn()
const stillExpected = vi.fn<(record: string) => boolean>()
vi.mock('../partsFill', () => ({
  requestPartCount: (record: string) => requestPartCount(record),
  stillExpected: (record: string) => stillExpected(record)
}))

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
  itemColumns, itemRecordColumns
} = await import('../catalogSchema')
const CellParts = (await import('../CellParts.vue')).default
const {
  ensurePartCounts,
  forgetPartCounts,
  notePartCount,
  partsOf
} = await import('../partCounts')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  putAll
} = await import('../../../idb/db')
const STORES = (await import('../../../idb/stores')).default

/** One part of one set, as `catalog-item-inv-page` stores it. */
function part(record: string, itemId: string, colorId: string, quantity: number) {
  return {
    id: `${record}|${itemId}-${colorId}`,
    record,
    quantity,
    itemVariant: {
      itemType: 'P',
      itemId,
      name: 'Brick 2 x 4',
      thumbnail: `https://img.example/${itemId}.png`,
      colorId,
      colorName: 'Red',
      catType: 'P',
      catString: '5',
      variantId: `${itemId}-${colorId}`,
      categoryName: 'Bricks'
    }
  }
}

beforeAll(async () => {
  const db = await getDbConnection()
  // Two lots and eight pieces in one set, one lot in another: enough for the
  // two numbers to disagree, which is the whole reason both are held.
  await putAll(db, STORES.ITEM_INVENTORIES, [
    part('S-10511-1', '3001', '11', 5),
    part('S-10511-1', '3002', '11', 3),
    part('S-43217-1', '3003', '85', 2)
  ])
  db.close()
})

beforeEach(() => {
  forgetPartCounts()
  requestPartCount.mockClear()
  // A number is still on its way unless a test says otherwise.
  stillExpected.mockReset().mockReturnValue(true)
})

describe('counting what a set is made of', () => {
  it('folds the stored parts into pieces and lots, per set', async () => {
    await ensurePartCounts()
    expect(partsOf('S-10511-1')).toEqual({
      parts: 8,
      lots: 2
    })
    expect(partsOf('S-43217-1')).toEqual({
      parts: 2,
      lots: 1
    })
  })

  it('says nothing at all about a set nobody has opened', async () => {
    await ensurePartCounts()
    // Not zero: a set of 300 pieces nobody has fetched is not a set of none,
    // and `0` in that cell is a number brickzuke never gave.
    expect(partsOf('S-76911-1')).toBeUndefined()
  })

  it('does not write an empty read down as a set made of nothing', async () => {
    await ensurePartCounts()
    notePartCount('S-76911-1', [])
    expect(partsOf('S-76911-1')).toBeUndefined()
  })
})

/** The Parts cell of whichever table, over a row carrying that record. */
function cell(columns: ColumnDef[], record: string) {
  const column = columns.find((each) => each.key === 'parts')!
  const row: ShellRow = {
    id: record,
    entityKey: 'items',
    entityLabel: 'Items',
    fields: {
      id: record,
      record
    }
  }
  return {
    column,
    row,
    wrapper: mount(CellParts, {
      props: {
        row,
        column,
        value: undefined
      }
    })
  }
}

/**
 * The cell mounted and left to fetch its counts.
 *
 * The pass it asks for on mount is a cursor over IndexedDB, so it settles a
 * couple of turns of the loop later — which is the behaviour, not a quirk of
 * the test: the dash is what the cell says until the store answers.
 */
async function settled(columns: ColumnDef[], record: string) {
  const drawn = cell(columns, record)
  // The very promise the cell asked for on mount — `ensurePartCounts` hands
  // back the one pass rather than starting a second — so this waits for the
  // cell's own load rather than for a guess at how long it takes.
  await ensurePartCounts()
  await flushPromises()
  return drawn
}

describe('the Parts cell', () => {
  it('states the count of a set already opened, and what it is a count of', async () => {
    const {
      wrapper
    } = await settled(itemColumns, 'S-10511-1')
    expect(wrapper.find('.counting').exists()).toBe(false)
    expect(wrapper.find('button').text()).toBe('8')
    // The listing draws a row per part and colour, which is two rows for eight
    // pieces — so the cell says which number it is showing.
    expect(wrapper.find('button').attributes('title')).toBe('8 parts in 2 lots')
  })

  it('counts its dots while the number is still on its way', async () => {
    const {
      wrapper
    } = await settled(itemColumns, 'S-76911-1')
    // Three dots laid out, two of them animated, so the column does not
    // shuffle as they come and go — see the styles on CellParts.
    expect(wrapper.findAll('.counting span')).toHaveLength(3)
    expect(wrapper.find('button').text()).not.toContain('—')
    // Still a button: pressing it is how the number gets known.
    expect(wrapper.find('button').attributes('title')).toContain('Counting')
  })

  it('goes back to a dash for a set BrickLink lists nothing for', async () => {
    // Asked and answered with nothing. It is finished, not loading, and an
    // animation here would say it was still working.
    stillExpected.mockReturnValue(false)
    const {
      wrapper
    } = await settled(itemColumns, 'S-76911-1')
    expect(wrapper.find('.counting').exists()).toBe(false)
    expect(wrapper.find('button').text()).toBe('—')
    expect(wrapper.find('button').attributes('title')).toContain('No parts listed')
  })

  it('draws nothing for a row that is not made of anything', async () => {
    const {
      wrapper
    } = await settled(itemColumns, 'P-3001')
    // A part lists no inventory, so a button here would lead to an empty table.
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('puts an uncounted set on the fill queue, so the dash does not stay one', async () => {
    await settled(itemColumns, 'S-76911-1')
    expect(requestPartCount).toHaveBeenCalledWith('S-76911-1')
  })

  it('asks for nothing when it already has the number', async () => {
    await settled(itemColumns, 'S-10511-1')
    // A set already stored is a page the app has read before, and reading it
    // again is a request spent on an answer it is holding.
    expect(requestPartCount).not.toHaveBeenCalled()
  })
})

/** Presses the Parts cell and reads back where the app ended up. */
async function press(columns: ColumnDef[], record: string) {
  const {
    wrapper
  } = await settled(columns, record)
  await wrapper.find('button').trigger('click')
  await flushPromises()
  const query = router.currentRoute.value.query
  return {
    entity: query[PARAM_ENTITY],
    expr: query[PARAM_EXPR]
  }
}

describe('pressing the parts count', () => {
  it('opens what the set is made of, from the items table', async () => {
    expect(await press(itemColumns, 'S-10511-1')).toEqual({
      entity: 'inventory',
      expr: 'record:"S-10511-1"'
    })
  })

  it('opens the same listing from an opened item\'s records', async () => {
    expect(await press(itemRecordColumns, 'S-43217-1')).toEqual({
      entity: 'inventory',
      expr: 'record:"S-43217-1"'
    })
  })
})
