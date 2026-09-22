import { describe, it, expect } from 'vitest'
import { parseElementCodes } from '../element-codes'

const COLORS = new Map([
  ['white', '1'],
  ['light bluish gray', '86']
])

describe('parseElementCodes', () => {
  it('reads each element as the BrickLink part and colour it is', () => {
    const text = 'Item No\tColor\tCode\r\n3001\tWhite\t300101\r\n3070b\tLight Bluish Gray\t4211415\r\n'
    expect(parseElementCodes(text, COLORS)).toEqual([
      {
        code: '300101',
        record: 'P-3001',
        itemNumber: '3001',
        colorName: 'White',
        colorId: '1'
      },
      {
        code: '4211415',
        record: 'P-3070b',
        itemNumber: '3070b',
        colorName: 'Light Bluish Gray',
        colorId: '86'
      }
    ])
  })

  it('finds the columns by their headings, whatever order they come in', () => {
    const text = 'Code\tItem Number\tColor Name\n300101\t3001\tWhite\n'
    expect(parseElementCodes(text, COLORS)[0]).toMatchObject({
      code: '300101',
      itemNumber: '3001',
      colorId: '1'
    })
  })

  it('takes a colour that is already a number as the id', () => {
    const text = 'Item No\tColor\tCode\n3001\t1\t300101\n'
    expect(parseElementCodes(text, new Map())[0].colorId).toBe('1')
  })

  it('leaves the id out for a colour the colour download does not name', () => {
    const text = 'Item No\tColor\tCode\n3001\tBrand New Colour\t9999999\n'
    expect(parseElementCodes(text, COLORS)[0].colorId).toBeUndefined()
  })

  it('reads nothing out of something that is not the download', () => {
    expect(parseElementCodes('<html><body>Sign in</body></html>', COLORS)).toEqual([])
  })
})
