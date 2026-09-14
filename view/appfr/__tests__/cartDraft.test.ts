/**
 * What the buttons over the Cart column propose, and for which lots.
 *
 * Two things worth pinning. Which lots a press is for — the ticked ones where
 * any are, every matching one otherwise — because a "Max" that filled the page
 * on screen and not the other twenty-nine would be a cart missing most of the
 * seller. And that the draft is a draft: nothing here writes, and typing into
 * a box drops the proposal for that one lot and no other.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ShellRow } from 'header-content-layout'

vi.mock('../../../model', async () => {
  const {
    ref
  } = await import('vue')
  return {
    itemTypes: ref([]),
    processingCounts: ref(false),
    selectedCounts: ref({})
  }
})

/** The lots the query matches, as the source would answer — stubbed whole. */
const matching: ShellRow[] = []
vi.mock('../catalogSource', () => ({
  matchingRows: vi.fn(async () => matching)
}))

const {
  cartDraft,
  cartSelection,
  draftCount,
  draftQuantityOf,
  dropDraft,
  proposeAll,
  resetDraft,
  targetLots
} = await import('../cartDraft')

function lot(id: string, quantity: number): ShellRow {
  return {
    id,
    entityKey: 'inventories',
    entityLabel: 'Store inventories',
    fields: {
      id,
      quantity,
      store: 'brickshop',
      record: `P-${id}`
    }
  }
}

beforeEach(() => {
  matching.splice(0, matching.length, lot('1', 50), lot('2', 8), lot('3', 120))
  cartSelection.value = []
  resetDraft()
})

describe('which lots the buttons are for', () => {
  it('is every lot the query matches, when nothing is ticked', async () => {
    expect((await targetLots()).map((row) => row.id)).toEqual(['1', '2', '3'])
  })

  it('is the ticked lots, when any are — wherever their page is', async () => {
    cartSelection.value = ['3', '1', 'not-on-this-table']
    expect((await targetLots()).map((row) => row.id)).toEqual(['1', '3'])
  })
})

describe('the draft', () => {
  it('proposes what the seller has at Max, and none at 0, per lot', async () => {
    await proposeAll('max')
    expect(draftCount.value).toBe(3)
    expect([draftQuantityOf('1'), draftQuantityOf('2'), draftQuantityOf('3')]).toEqual([50, 8, 120])
    // The row goes in with the figure: a line is written from what the lot
    // said of itself, and by Apply the row may be off screen.
    expect(cartDraft.value.get('2')?.fields.record).toBe('P-2')

    cartSelection.value = ['2']
    await proposeAll('none')
    // The later press stands for the lot it was for, and the rest keep theirs.
    expect([draftQuantityOf('1'), draftQuantityOf('2'), draftQuantityOf('3')]).toEqual([50, 0, 120])
  })

  it('drops one lot’s proposal when that box is typed into, and all of them on Reset', async () => {
    await proposeAll('max')
    dropDraft('2')
    expect(draftQuantityOf('2')).toBeUndefined()
    expect(draftCount.value).toBe(2)
    // Dropping what was never proposed changes nothing — and makes no new map.
    const before = cartDraft.value
    dropDraft('nope')
    expect(cartDraft.value).toBe(before)

    resetDraft()
    expect(draftCount.value).toBe(0)
    expect(draftQuantityOf('1')).toBeUndefined()
  })
})
