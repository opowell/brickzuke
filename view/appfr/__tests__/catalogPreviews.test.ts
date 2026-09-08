/**
 * The home screen's cards, with a look inside each type.
 *
 * The two things worth pinning are the same two the rows are: which id goes to
 * BrickLink, and where a number comes from. A colour's brick is fetched from
 * BrickLink by BrickLink's colour id, so a card that sends brickzuke's shows a
 * wall of confidently wrong colours — Aqua drawn in Tan. And a category's
 * picture is one of its own items, found through the BrickLink category id the
 * row carries rather than through brickzuke's.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { previewFor } from '../catalogPreviews'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'

/* The schema heads its cards with counts off the model, which is nothing this
   file is about — the previews under them are what is wanted here. */
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

beforeAll(async () => {
  const db = await getDbConnection()
  await putAll(db, STORES.COLORS, [
    {
      id: 2,
      name: 'Aqua'
    },
    {
      id: 3,
      name: 'Tan'
    },
    {
      id: 4,
      name: '(Not Applicable)'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_COLORS, [
    {
      // BrickLink's key for Aqua, which is nothing like brickzuke's.
      colorId: '41',
      bzColorId: 2,
      'Color Name': 'Aqua',
      Parts: '82'
    },
    {
      colorId: '2',
      bzColorId: 3,
      'Color Name': 'Tan',
      Parts: '900'
    },
    // BrickLink's colour 0, which is not a colour: it is the answer for every
    // item that has none, so it carries a parts count larger than any real
    // colour's and would otherwise lead the wall.
    {
      colorId: '0',
      bzColorId: 4,
      'Color Name': '(Not Applicable)',
      Parts: '90000'
    }
  ])
  await putAll(db, STORES.ITEM_TYPES, [
    {
      id: 7
    },
    {
      id: 8
    }
  ])
  await putAll(db, STORES.BRICK_LINK_ITEM_TYPES, [
    {
      itemTypeId: 'P',
      bzItemTypeId: 7,
      'Item Type Name': 'Part'
    },
    {
      itemTypeId: 'S',
      bzItemTypeId: 8,
      'Item Type Name': 'Set'
    }
  ])
  await putAll(db, STORES.CATEGORIES, [
    {
      id: 1
    },
    {
      id: 2
    }
  ])
  await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
    {
      categoryId: '5',
      bzCategoryId: 1,
      catType: 'P',
      'Category Name': 'Brick',
      items: 4_000
    },
    {
      categoryId: '7',
      bzCategoryId: 2,
      catType: 'P',
      'Category Name': 'Plate',
      items: 1_500
    }
  ])
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    {
      id: 'P-3001',
      bzItemId: 10,
      itemType: 'P',
      Name: 'Brick 2 x 4',
      Number: '3001',
      categoryId: '5',
      'Category ID': '5',
      image: 'https://img.example/3001.png'
    },
    // The same item again, as a second BrickLink record of it — one tile
    // between them, the way the items table draws one row between them.
    {
      id: 'P-3001-2',
      bzItemId: 10,
      itemType: 'P',
      Name: 'Brick 2 x 4',
      Number: '3001-2',
      categoryId: '5',
      'Category ID': '5'
    },
    {
      id: 'P-3020',
      bzItemId: 11,
      itemType: 'P',
      Name: 'Plate 2 x 4',
      Number: '3020',
      categoryId: '7',
      'Category ID': '7',
      image: 'https://img.example/3020.png'
    }
  ])
  db.close()
})

/** The tiles of a card that shows pictures, or nothing when it shows names. */
async function tiles(entity: string) {
  const preview = await previewFor(entity)
  return preview.kind === 'pictures' ? preview.tiles : undefined
}

describe('colour previews', () => {
  it('draws a 2 x 2 brick in BrickLink’s colour, not brickzuke’s', async () => {
    const shown = await tiles('colors')
    expect(shown?.map((tile) => tile.label)).toEqual(['Tan', 'Aqua'])
    // Aqua is brickzuke's colour 2 and BrickLink's 41; asking BrickLink for
    // its colour 2 gets a picture of Tan back, with a straight face.
    expect(shown?.[1].image).toBe('https://img.bricklink.com/ItemImage/PT/41/3003.t1.png')
  })

  it('is pictures alone, the name and the count being the hover', async () => {
    const preview = await previewFor('colors')
    expect(preview.kind).toBe('pictures')
    expect(preview.tiles[0].detail).toBe('900')
  })

  it('leaves out the colour that is not one', async () => {
    const shown = await tiles('colors')
    expect(shown?.map((tile) => tile.label)).not.toContain('(Not Applicable)')
  })
})

describe('category previews', () => {
  it('shows an item from the category, and how many are in it', async () => {
    const brick = (await tiles('categories'))?.[0]
    expect(brick?.label).toBe('Brick (1)')
    expect(brick?.image).toBe('https://img.example/3001.png')
    expect(brick?.detail).toBe('4.0k')
  })
})

describe('item previews', () => {
  it('is one tile per item, however many records it has', async () => {
    const shown = await tiles('items')
    expect(shown?.map((tile) => tile.key)).toEqual(['10', '11'])
    // The picture is whichever record carries one, as the items table's own
    // image cell reads it.
    expect(shown?.[0].image).toBe('https://img.example/3001.png')
  })
})

describe('the types whose records have no pictures', () => {
  it('are their records’ names, with what the type counts them by', async () => {
    const preview = await previewFor('itemTypes')
    expect(preview.kind).toBe('pills')
    expect(preview.tiles.map((tile) => tile.label)).toEqual(['Part', 'Set'])
    // The first number the type states about a record, wherever its table
    // draws that column — parts being the items of every category of that
    // type. Sets have no categories here and so no count, and a pill states
    // none rather than nought, which is the rule the whole catalogue keeps.
    expect(preview.tiles.map((tile) => tile.detail)).toEqual(['5.5k', ''])
    // And it leads where the table's own name cell leads.
    expect(typeof preview.tiles[0].press).toBe('function')
  })
})

describe('the types nothing has been stored for', () => {
  it('come back empty, so the card keeps the count it had', async () => {
    const preview = await previewFor('stores')
    expect(preview.tiles).toEqual([])
  })
})

/**
 * A card under a query says what its own table would say under that query —
 * the same rows and the same number — because a summary of a narrowed
 * catalogue that reports the whole one is not a summary of anything.
 */
describe('a card under a query', () => {
  it('shows only what matches, and counts only what matches', async () => {
    const preview = await previewFor('categories', 'name:"Brick"')
    expect(preview.tiles.map((tile) => tile.label)).toEqual(['Brick (1)'])
    expect(preview.count).toBe(1)
  })

  it('counts nought where the type has records and none of them match', async () => {
    // A true statement, and a different one from the blank a type nobody has
    // fetched anything for keeps: brickzuke read the colours and none is
    // called this.
    const preview = await previewFor('colors', 'name:"Chartreuse"')
    expect(preview.tiles).toEqual([])
    expect(preview.count).toBe(0)
  })

  it('leaves the count to the schema when the query narrows nothing', async () => {
    // The population is already on the card and the catalogue has already been
    // counted; reading it again to restate it buys nothing.
    expect((await previewFor('colors')).count).toBeUndefined()
  })

  it('says nothing about a type the query cannot ask about', async () => {
    // `region:` resolves against nothing a colour carries, and an unresolvable
    // field matches every row rather than none — so the count is the whole
    // population, which is what the card was already showing.
    const preview = await previewFor('colors', 'region:"Europe"')
    expect(preview.tiles.map((tile) => tile.label)).toEqual(['Tan', 'Aqua'])
    expect(preview.count).toBe(3)
  })

  it('reads the items table through the query rather than off the head of the index', async () => {
    // The one card that costs a pass over the catalogue, and the only way to
    // answer this: no index states which items are plates.
    const preview = await previewFor('items', 'category:"7"')
    expect(preview.tiles.map((tile) => tile.key)).toEqual(['11'])
    expect(preview.count).toBe(1)
  })
})
