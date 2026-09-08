/**
 * The home screen's order, which is use rather than schema.
 *
 * What matters is that remembering is a rearrangement and never a filter: every
 * type the schema declares still has a card, and a type nobody has opened keeps
 * its declared place behind the ones somebody has.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { byRecency, forgetTypes, recentTypes, rememberType } from '../recentTypes'

const entities = [
  {
    key: 'categories'
  },
  {
    key: 'colors'
  },
  {
    key: 'items'
  },
  {
    key: 'stores'
  }
]

const keys = (list: readonly { key: string }[]) => list.map((entity) => entity.key)

beforeEach(() => {
  window.localStorage.clear()
  forgetTypes()
})

describe('recentTypes', () => {
  it('leaves the schema order alone until something has been opened', () => {
    expect(keys(byRecency(entities))).toEqual(['categories', 'colors', 'items', 'stores'])
  })

  it('leads with the type most recently opened', () => {
    rememberType('items')
    expect(keys(byRecency(entities))).toEqual(['items', 'categories', 'colors', 'stores'])
  })

  it('orders the opened types by when they were opened, newest first', () => {
    rememberType('stores')
    rememberType('colors')
    rememberType('items')
    expect(keys(byRecency(entities))).toEqual(['items', 'colors', 'stores', 'categories'])
  })

  it('moves a type back to the front rather than listing it twice', () => {
    rememberType('items')
    rememberType('stores')
    rememberType('items')
    expect(recentTypes.value).toEqual(['items', 'stores'])
    expect(keys(byRecency(entities))).toEqual(['items', 'stores', 'categories', 'colors'])
  })

  it('drops no card, whatever has been opened', () => {
    rememberType('colors')
    expect(keys(byRecency(entities)).slice().sort()).toEqual(keys(entities).slice().sort())
  })

  /*
   * The detail types the URL can name — an item's records, a seller's lots —
   * are not cards on the home screen. Remembering one must not conjure a card
   * for it, nor disturb the ones that are there.
   */
  it('ignores a remembered type the home screen has no card for', () => {
    rememberType('itemRecords')
    expect(keys(byRecency(entities))).toEqual(['categories', 'colors', 'items', 'stores'])
  })

  it('keeps the order across a reload', () => {
    rememberType('stores')
    rememberType('items')
    expect(JSON.parse(window.localStorage.getItem('brickzuke.recentTypes')!)).toEqual([
      'items',
      'stores'
    ])
  })
})
