/**
 * The Cart box on a lot, and where its figure comes from.
 *
 * A write from this column does not rebuild the row under it — the table is
 * the very stream a re-run would restart — so the row's own `cartQuantity`
 * is the figure the cart held when the row was built, and nothing after. The
 * box drew that: after Max and Apply on a lot it went blank over a line it
 * had just written, the draft dropped and the fallback stale. What is pinned
 * is that the box reads the held lines instead, which every write refreshes,
 * so it says what the cart holds now — after a write, and after a proposal
 * is dropped.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { ShellRow } from 'header-content-layout'
import type { CartLine } from '../../../idb/userTypes'

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
  activeCartLines
} = await import('../activeCart')
const {
  cartDraft, resetDraft
} = await import('../cartDraft')
const {
  activeCart
} = await import('../settings')
const CellCartQuantity = (await import('../CellCartQuantity.vue')).default

/** A lot's row as the lots table builds it, with what the cart held then. */
function lotRow(cartQuantity?: number): ShellRow {
  return {
    id: '421934511',
    entityKey: 'inventories',
    entityLabel: 'Store inventories',
    fields: {
      id: '421934511',
      quantity: 12,
      cartQuantity
    }
  }
}

function line(quantity: number): CartLine {
  return {
    id: 1,
    cartId: 1,
    lotId: '421934511',
    store: 'steinehaus',
    quantity
  }
}

function mounted(row: ShellRow) {
  return mount(CellCartQuantity, {
    props: {
      row,
      value: row.fields.cartQuantity
    }
  })
}

beforeEach(() => {
  activeCart.value = '1'
  activeCartLines.value = new Map()
  resetDraft()
})

describe('the box', () => {
  it('reads what the cart holds now, not what the row was built with', async () => {
    const wrapper = mounted(lotRow(undefined))
    const box = wrapper.get('input')
    expect(box.element.value).toBe('')
    // A write from the column: the lines refreshed, the row untouched.
    activeCartLines.value = new Map([['421934511', line(3)]])
    await nextTick()
    expect(box.element.value).toBe('3')
    // And out again.
    activeCartLines.value = new Map()
    await nextTick()
    expect(box.element.value).toBe('')
  })

  it('falls back to the held figure, not the row’s, when a proposal is dropped', async () => {
    const wrapper = mounted(lotRow(undefined))
    const box = wrapper.get('input')
    activeCartLines.value = new Map([['421934511', line(3)]])
    cartDraft.value = new Map([
      [
        '421934511',
        {
          fields: lotRow().fields,
          quantity: 12
        }
      ]
    ])
    await nextTick()
    expect(box.element.value).toBe('12')
    expect(box.classes()).toContain('cart-quantity__value--proposed')
    resetDraft()
    await nextTick()
    expect(box.element.value).toBe('3')
    expect(box.classes()).not.toContain('cart-quantity__value--proposed')
  })
})
