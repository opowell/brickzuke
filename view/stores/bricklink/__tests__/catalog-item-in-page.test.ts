/**
 * What a part is in, off the part's own page.
 *
 * The fixtures are real pages as BrickLink serves them — upper-case HTML —
 * trimmed to the rows: a part in 51 sets across a dozen colours and a
 * counterpart section, and a part in 45 minifigures.
 */
import { describe, it, expect } from 'vitest'
import { appearanceLines, appearsInUrl, parseAppearances } from '../catalog-item-in-page'
import type { BrickLinkItem } from '../catalog-download-page'
import IN_SETS from './fixtures/itemIn-P-87615-S.html?raw'
import IN_MINIFIGS from './fixtures/itemIn-P-30133-M.html?raw'

describe('the page', () => {
  it('is asked for by the part and the kind of item it is in', () => {
    expect(appearsInUrl('P-87615', 'S')).toBe('https://www.bricklink.com/catalogItemIn.asp?P=87615&in=S')
    expect(appearsInUrl('P-3626cpb1', 'M')).toBe('https://www.bricklink.com/catalogItemIn.asp?P=3626cpb1&in=M')
  })

  it('reads every row, with its quantity, colour and section', () => {
    const rows = parseAppearances(IN_SETS)
    expect(rows).toHaveLength(53)
    expect(new Set(rows.map((row) => row.record)).size).toBe(51)
    expect(rows[0]).toEqual({
      record: 'S-60465-1',
      quantity: 1,
      colorName: 'White',
      section: 'Regular'
    })
    // Quantities above one, which is where a lazy match would slip a row.
    expect(rows.find((row) => row.record === 'S-41317-1')?.quantity).toBe(2)
    // The counterpart section is kept, as a set's own inventory keeps it.
    expect(rows.some((row) => row.section === 'Counterpart')).toBe(true)
  })

  it('reads minifigures the same way', () => {
    const rows = parseAppearances(IN_MINIFIGS)
    expect(rows).toHaveLength(45)
    expect(rows[0]).toMatchObject({
      record: 'M-stu013a',
      quantity: 1,
      colorName: 'White'
    })
    expect(rows.every((row) => row.record.startsWith('M-'))).toBe(true)
  })

  it('reads the page as a browser renders it, too', () => {
    // Lower-case, as the DOM hands it back: nothing here assumes a case.
    expect(parseAppearances(IN_SETS.toLowerCase())).toHaveLength(53)
  })
})

describe('the lines', () => {
  const item = {
    id: 'P-87615',
    itemType: 'P',
    Name: 'Tile, Modified 2 x 2 with Studs on Edge',
    Number: '87615',
    image: 'https://img.bricklink.com/ItemImage/PL/87615.png',
    'Category ID': '37',
    'Category Name': 'Tile, Modified'
  } as unknown as BrickLinkItem
  const colors = new Map([
    ['white', '1'],
    ['(not applicable)', '0']
  ])

  it('are filed as a set\'s own inventory files them', () => {
    const [line] = appearanceLines('P-87615', [{
      record: 'S-60465-1',
      quantity: 1,
      colorName: 'White',
      section: 'Regular'
    }], item, colors)
    // The id the set's own page would give the line, so the two are one.
    expect(line.id).toBe('S-60465-1|87615-1')
    expect(line.record).toBe('S-60465-1')
    expect(line.part).toBe('P-87615')
    expect(line.itemVariant).toMatchObject({
      itemType: 'P',
      itemId: '87615',
      colorId: '1',
      colorName: 'White',
      catString: '37',
      categoryName: 'Tile, Modified',
      variantId: '87615-1'
    })
  })

  it('give a part with no colour no colour, as a set\'s page does', () => {
    const [line] = appearanceLines('P-87615', [{
      record: 'S-1-1',
      quantity: 3,
      colorName: '(Not Applicable)',
      section: 'Regular'
    }], item, colors)
    expect(line.id).toBe('S-1-1|87615-undefined')
    expect(line.itemVariant.colorId).toBeUndefined()
  })

  it('fold a part stated twice for one set into one line', () => {
    const lines = appearanceLines('P-87615', [
      {
        record: 'S-1-1',
        quantity: 1,
        colorName: 'White',
        section: 'Regular'
      },
      {
        record: 'S-1-1',
        quantity: 2,
        colorName: 'White',
        section: 'Counterpart'
      }
    ], item, colors)
    expect(lines).toHaveLength(1)
  })
})
