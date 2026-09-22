import { describe, expect, it } from 'vitest'
import { itemPicture, largerSetPicture } from '../itemPicture'

describe('the picture a catalogue item is stored with', () => {
  it('is the normal size for a set — the 560×380 one', () => {
    expect(itemPicture('S', '10179-1')).toBe('https://img.bricklink.com/ItemImage/SN/0/10179-1.png')
  })

  it('is the large one for anything else', () => {
    expect(itemPicture('P', '3001')).toBe('https://img.bricklink.com/ItemImage/PL/3001.png')
    expect(itemPicture('M', 'sw0001')).toBe('https://img.bricklink.com/ItemImage/ML/sw0001.png')
  })
})

describe('a stored set brought up to size', () => {
  it('takes a thumbnail to the normal size', () => {
    expect(largerSetPicture('https://img.bricklink.com/ItemImage/ST/0/10179-1.t2.png')).toBe(
      'https://img.bricklink.com/ItemImage/SN/0/10179-1.png'
    )
  })

  it('leaves anything else alone', () => {
    for (const image of [
      'https://img.bricklink.com/ItemImage/SN/0/10179-1.png',
      'https://img.bricklink.com/ItemImage/PL/3001.png',
      'https://www.bricklink.com/myImg/123.jpg',
      '',
      undefined
    ]) {
      expect(largerSetPicture(image)).toBe(image)
    }
  })
})
