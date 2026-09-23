/**
 * The price ratio: a lot's price over a reference for the same item in the
 * same colour — a percentile of the lots the query matches, or one store's
 * price — worked out on both of the ways the lots table is read: whole, for
 * one seller or one item, and walked, for every lot stored.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useResults } from 'header-content-layout'
import type { ShellQuery, ShellRow } from 'header-content-layout'
import {lowestReferences,
  percentileOf,
  percentileReferences,
  ratioText,
  referenceKey,
  withRatio} from '../referencePrices'

vi.mock('../../../model', async () => {
  const {
    ref: r
  } = await import('vue')
  return {
    filters: r([]),
    search: r(undefined),
    selectedItemType: r(null),
    itemTypes: r([]),
    processingCounts: r(false),
    selectedCounts: r(undefined),
  }
})

const {
  catalogSource
} = await import('../catalogSource')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  getDbConnection
} = await import('../../../idb/idb')
const {
  putAll
} = await import('../../../idb/db')
const {
  referencePercentile, referencePrice, referenceStore
} = await import('../settings')
const STORES = (await import('../../../idb/stores')).default

const entity = (key: string) => catalogSchema.value.entities.find((e) => e.key === key)!

/** A lot as a row, with only the fields the ratio reads. */
function lot(record: string, colorid: number | undefined, priceValue: number | undefined): ShellRow {
  return {
    id: `${record}-${colorid}-${priceValue}`,
    entityKey: 'inventories',
    entityLabel: 'Store inventories',
    fields: {
      record,
      colorid,
      priceValue
    }
  }
}

describe('the arithmetic', () => {
  it('interpolates a percentile between the two lots it falls between', () => {
    expect(percentileOf([1, 2, 3, 4], 50)).toBe(2.5)
    expect(percentileOf([1, 2, 3], 50)).toBe(2)
    expect(percentileOf([1, 2, 3, 4], 0)).toBe(1)
    expect(percentileOf([1, 2, 3, 4], 100)).toBe(4)
    expect(percentileOf([5], 25)).toBe(5)
    expect(percentileOf([], 50)).toBeUndefined()
  })

  it('files a reference under the item and the colour, whichever way the colour is written', () => {
    expect(referenceKey('P-3001', '5')).toBe(referenceKey('P-3001', 5))
    expect(referenceKey('P-3001', 5)).not.toBe(referenceKey('P-3001', 1))
    expect(referenceKey('S-10511-1', undefined)).toBe('S-10511-1|')
    expect(referenceKey(undefined, 5)).toBeUndefined()
  })

  it('takes a percentile of each item and colour on its own', () => {
    const references = percentileReferences(
      [lot('P-3001', 5, 0.1), lot('P-3001', 5, 0.3), lot('P-3001', 1, 2), lot('P-3001', 5, undefined)],
      50
    )
    expect(references.get(referenceKey('P-3001', 5)!)).toBeCloseTo(0.2)
    expect(references.get(referenceKey('P-3001', 1)!)).toBe(2)
  })

  it('takes a store’s lowest price where it sells the same thing twice', () => {
    const references = lowestReferences([
      {
        record: 'P-3001',
        colorId: '5',
        price: 0.3
      },
      {
        record: 'P-3001',
        colorId: '5',
        price: 0.2
      }
    ])
    expect(references.get(referenceKey('P-3001', 5)!)).toBe(0.2)
  })

  it('puts the ratio on a copy, and none where there is no reference or a free one', () => {
    const references = new Map([
      [referenceKey('P-3001', 5)!, 0.2],
      [referenceKey('P-3002', 5)!, 0]
    ])
    const row = lot('P-3001', 5, 0.1)
    const rated = withRatio(row, references)
    expect(rated.fields.ratio).toBe(0.5)
    expect(rated.fields.reference).toBe(0.2)
    expect(row.fields.ratio).toBeUndefined()
    expect(withRatio(lot('P-3001', 1, 0.1), references).fields.ratio).toBeUndefined()
    expect(withRatio(lot('P-3002', 5, 0.1), references).fields.ratio).toBeUndefined()
  })

  it('counts a lot at nought as no price, neither in a percentile nor as a ratio', () => {
    const references = percentileReferences([lot('P-3001', 5, 0), lot('P-3001', 5, 0.2)], 50)
    expect(references.get(referenceKey('P-3001', 5)!)).toBe(0.2)
    expect(withRatio(lot('P-3001', 5, 0), references).fields.ratio).toBeUndefined()
  })

  it('draws a ratio to two places, and nothing for none', () => {
    expect(ratioText(0.8412)).toBe('0.84')
    expect(ratioText(2)).toBe('2.00')
    expect(ratioText(undefined)).toBe('')
  })

  it('keeps two figures of a ratio under a tenth, which two places would round to nought', () => {
    expect(ratioText(0.002_46)).toBe('0.0025')
    expect(ratioText(0.05)).toBe('0.05')
  })
})

/**
 * Four sellers of a red 2 x 4 brick, LEGO.com among them at 0.15, whose
 * median is 0.175 — and a blue one and a red 1 x 2 that only one seller has,
 * LEGO not among them.
 */
beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  const stored = (id: string, store: string, record: string, colorId: string, price: number) => ({
    id,
    store,
    record,
    itemType: 'P',
    itemNumber: record.slice(2),
    itemName: record,
    description: '',
    condition: 'N',
    colorId,
    colorName: colorId,
    quantity: 10,
    price,
    displayPrice: `EUR ${price.toFixed(2)}`,
    nativePrice: `EUR ${price.toFixed(2)}`
  })
  await putAll(db, STORES.STORE_LOTS, [
    stored('a-red', 'alpha', 'P-3001', '5', 0.1),
    stored('b-red', 'bravo', 'P-3001', '5', 0.2),
    stored('c-red', 'charlie', 'P-3001', '5', 0.3),
    stored('lego-red', 'LEGO.com', 'P-3001', '5', 0.15),
    stored('a-blue', 'alpha', 'P-3001', '1', 0.5),
    stored('b-small', 'bravo', 'P-3004', '5', 0.4)
  ])
  db.close()
})

afterEach(() => {
  referencePrice.value = 'percentile'
  referencePercentile.value = 50
  referenceStore.value = 'LEGO.com'
})

/** The rows the shell would draw for this query, once the stream has settled. */
async function rowsOf(overrides: Partial<ShellQuery>) {
  const query = ref<ShellQuery>({
    view: 'table',
    sort: 'priceValue',
    dir: 'asc',
    expr: '',
    facets: {},
    page: 1,
    ...overrides,
  })
  const scope = effectScope()
  let state!: ReturnType<typeof useResults>
  scope.run(() => {
    state = useResults({
      source: computed(() => catalogSource),
      query: computed(() => query.value),
      schema: computed(() => catalogSchema.value),
      entity: computed(() => entity('inventories')),
      limit: computed(() => 50),
    })
  })
  for (let i = 0; i < 50 && state.pending.value; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const rows = state.rows.value.slice()
  scope.stop()
  return rows
}

function ratios(rows: ShellRow[]): Record<string, unknown> {
  return Object.fromEntries(
    rows.map((row) => [row.id, typeof row.fields.ratio === 'number' ? Number(row.fields.ratio.toFixed(3)) : row.fields.ratio])
  )
}

describe('over every lot stored', () => {
  it('holds each lot against the median of the same item in the same colour', async () => {
    // Sorted by price, so the page does not wait on the ratio: it is put on
    // once the walk has seen every lot.
    expect(ratios(await rowsOf({}))).toEqual({
      'a-red': 0.571,
      'lego-red': 0.857,
      'b-red': 1.143,
      'c-red': 1.714,
      'b-small': 1,
      'a-blue': 1
    })
  })

  it('takes the percentile the setting names', async () => {
    referencePercentile.value = 0
    expect(ratios(await rowsOf({}))['c-red']).toBe(3)
  })

  it('takes the percentile over the lots the query matches, not every lot', async () => {
    const rows = await rowsOf({
      expr: '-store:"charlie"'
    })
    // 0.10, 0.15 and 0.20 left, whose median is 0.15.
    expect(ratios(rows)['a-red']).toBe(0.667)
    expect(rows.some((row) => row.id === 'c-red')).toBe(false)
  })

  it('sorts by the ratio, with the lots that have none last whichever way round', async () => {
    referencePrice.value = 'store'
    const up = await rowsOf({
      sort: 'ratio'
    })
    expect(up.map((row) => row.id).slice(0, 4)).toEqual(['a-red', 'lego-red', 'b-red', 'c-red'])
    expect(up.slice(4).every((row) => row.fields.ratio === undefined)).toBe(true)
    const down = await rowsOf({
      sort: 'ratio',
      dir: 'desc'
    })
    expect(down.map((row) => row.id).slice(0, 4)).toEqual(['c-red', 'b-red', 'lego-red', 'a-red'])
  })

  it('narrows by a term on the ratio, the percentile being over the rest of the query', async () => {
    const rows = await rowsOf({
      expr: 'ratio<1'
    })
    expect(rows.map((row) => row.id).sort()).toEqual(['a-red', 'lego-red'])
  })
})

describe('a term on the ratio, over lots some of which have none', () => {
  it('is one a lot with no ratio cannot meet', async () => {
    referencePrice.value = 'store'
    // LEGO sells the red 2 x 4 and nothing else here: the blue one and the
    // 1 x 2 have no ratio, and are not under two for want of one.
    const rows = await rowsOf({
      expr: 'ratio<2'
    })
    expect(rows.map((row) => row.id).sort()).toEqual(['a-red', 'b-red', 'lego-red'])
  })

  it('is one a lot with no ratio cannot fail, negated', async () => {
    referencePrice.value = 'store'
    const rows = await rowsOf({
      expr: '-ratio>1.5'
    })
    expect(rows.map((row) => row.id).sort()).toEqual(['a-blue', 'a-red', 'b-red', 'b-small', 'lego-red'])
  })

  it('leaves the rest of an either-or to answer for them', async () => {
    referencePrice.value = 'store'
    // A colour rather than a seller: a `store:` term alone is which seller's
    // lots to read, not a filter over every lot.
    const rows = await rowsOf({
      expr: 'ratio>1.5 OR colorid:1'
    })
    expect(rows.map((row) => row.id).sort()).toEqual(['a-blue', 'c-red'])
  })

  it('is the same over one seller’s lots, read whole', async () => {
    referencePrice.value = 'store'
    const rows = await rowsOf({
      expr: 'store:"bravo" ratio<2'
    })
    expect(rows.map((row) => row.id)).toEqual(['b-red'])
  })
})

describe('one seller’s lots', () => {
  it('holds them against the median of the matching lots', async () => {
    expect(ratios(await rowsOf({
      expr: 'store:"bravo"'
    }))).toEqual({
      'b-red': 1,
      'b-small': 1
    })
  })

  it('holds them against the reference store’s price, and leaves blank what it does not sell', async () => {
    referencePrice.value = 'store'
    expect(ratios(await rowsOf({
      expr: 'store:"bravo"'
    }))).toEqual({
      'b-red': 1.333,
      'b-small': undefined
    })
  })

  it('narrows by a term on the ratio', async () => {
    referencePrice.value = 'store'
    const rows = await rowsOf({
      expr: 'store:"charlie" ratio>1.5'
    })
    expect(rows.map((row) => row.id)).toEqual(['c-red'])
  })
})

describe('switched off', () => {
  it('puts no ratio on a lot, and draws no column or sort for it', async () => {
    referencePrice.value = 'off'
    expect((await rowsOf({})).every((row) => row.fields.ratio === undefined)).toBe(true)
    expect(entity('inventories').columns.some((column) => column.key === 'ratio')).toBe(false)
    expect(entity('inventories').sorts.some((sort) => sort.key === 'ratio')).toBe(false)
    referencePrice.value = 'store'
    expect(entity('inventories').columns.find((column) => column.key === 'ratio')?.hint).toContain('LEGO.com')
  })
})
