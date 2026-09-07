/**
 * The small types, as rows.
 *
 * What is worth pinning here is the pair of ids each row carries. brickzuke
 * keys its own records by an auto-increment number, and BrickLink keys the
 * same thing by a different one — Aqua is brickzuke's colour 2 and BrickLink's
 * colour 41, and BrickLink's colour 2 is Tan. A press that sends the wrong one
 * of those to BrickLink gets a straight-faced answer about the wrong colour,
 * which is what happened the first time this was wired up.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import {cellTextOf,
  matchesExpression,
  parseExpression,
  recordTerm,
  roleColumn,
  scopedEntity} from 'header-content-layout'
import { rowsFor } from '../catalogRows'
import { catalogSchema } from '../catalogSchema'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'

/* The schema heads its cards with counts off the model, which is nothing this
   file is about — the entities are what is wanted here. */
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
    // The other half of the confusion above: BrickLink's colour 2 is this one,
    // so a lookup that reads the wrong id comes back with a straight face.
    {
      id: 3,
      name: 'Tan'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_COLORS, [
    {
      // BrickLink's key for Aqua, which is nothing like brickzuke's.
      colorId: '41',
      bzColorId: 2,
      'Color Name': 'Aqua',
      Parts: '82',
      'In Sets': '60',
      Wanted: '1300',
      'For Sale': '140',
      'Year From': '1998',
      'Year To': '2006'
    },
    {
      colorId: '2',
      bzColorId: 3,
      'Color Name': 'Tan',
      Parts: '900',
      'In Sets': '700'
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
      // The whole of what the item types download states: a code and a name,
      // filed on the BrickLink record because brickzuke's own is left empty.
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
    },
    {
      id: 3
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
    // The same brickzuke category as the one above, which the categories table
    // draws as one row — so the two are one category between them.
    {
      categoryId: '6',
      bzCategoryId: 1,
      catType: 'P',
      'Category Name': 'Brick, Modified',
      items: 2_000
    },
    {
      categoryId: '7',
      bzCategoryId: 2,
      catType: 'P',
      'Category Name': 'Plate',
      items: 1_500
    },
    // Another type entirely, and none of this type's business.
    {
      categoryId: '8',
      bzCategoryId: 3,
      catType: 'S',
      'Category Name': 'Town',
      items: 900
    }
  ])
  /*
   * Two sets that share a part, which is the whole of what the variants table
   * is about: a red 2x4 brick is one variant however many sets it turns up in,
   * and three inventory rows fold to two variants because of it.
   */
  await putAll(db, STORES.ITEM_INVENTORIES, [
    {
      id: 'S-10511-1|3001-5',
      record: 'S-10511-1',
      quantity: 4,
      itemVariant: {
        itemType: 'P',
        itemId: '3001',
        name: 'Brick 2 x 4',
        thumbnail: 'https://img.example/3001-5.png',
        colorId: '5',
        colorName: 'Red',
        catType: 'P',
        catString: '5',
        variantId: '3001-5',
        categoryName: 'Brick'
      }
    },
    {
      id: 'S-10511-1|3002-2',
      record: 'S-10511-1',
      quantity: 2,
      itemVariant: {
        itemType: 'P',
        itemId: '3002',
        name: 'Brick 2 x 3',
        thumbnail: 'https://img.example/3002-2.png',
        colorId: '2',
        colorName: 'Aqua',
        catType: 'P',
        catString: '5',
        variantId: '3002-2',
        categoryName: 'Brick'
      }
    },
    {
      id: 'S-4000-1|3001-5',
      record: 'S-4000-1',
      quantity: 9,
      itemVariant: {
        itemType: 'P',
        itemId: '3001',
        name: 'Brick 2 x 4',
        thumbnail: 'https://img.example/3001-5.png',
        colorId: '5',
        colorName: 'Red',
        catType: 'P',
        catString: '5',
        variantId: '3001-5',
        categoryName: 'Brick'
      }
    }
  ])
  db.close()
})

describe('item inventory rows', () => {
  it('holds every part of every set that has been opened', async () => {
    const rows = (await rowsFor('itemInventories', getDbConnection))!
    expect(rows.length).toBe(3)
    // The set each part is in, which one set's inventory never has to say and
    // this table cannot do without: the same brick appears twice below, and
    // this is the only thing telling the two rows apart.
    expect(rows.map((row) => row.fields.record).sort()).toEqual([
      'S-10511-1',
      'S-10511-1',
      'S-4000-1'
    ])
  })

  it('reads a colour as a number, so a term compares it exactly', async () => {
    const rows = (await rowsFor('itemInventories', getDbConnection))!
    const aqua = rows.find((row) => row.fields.itemId === '3002')!
    expect(aqua.fields.colorid).toBe(2)
  })

  it('is read afresh, a set being opened while the app is running', async () => {
    // The three catalogue types are held once — this one cannot be, or a set
    // opened now would be missing from a table drawn later. Two reads, two
    // arrays: not the same object handed back.
    const first = await rowsFor('itemInventories', getDbConnection)!
    const second = await rowsFor('itemInventories', getDbConnection)!
    expect(second).not.toBe(first)
  })
})

describe('item variant rows', () => {
  it('folds the duplicates and counts what folded', async () => {
    const rows = (await rowsFor('itemVariants', getDbConnection))!
    // Three inventory rows, two variants: the 2x4 is one variant in two sets.
    expect(rows.length).toBe(2)
    const brick = rows.find((row) => row.fields.variant === '3001-5')!
    expect(brick.fields.sets).toBe(2)
    expect(rows.find((row) => row.fields.variant === '3002-2')!.fields.sets).toBe(1)
  })

  it('carries no quantity, a variant not being a quantity of anything', async () => {
    const rows = (await rowsFor('itemVariants', getDbConnection))!
    // The one field the fold has to drop: four in one set and nine in another
    // is not a number a variant has, and stating either would be a wrong one.
    expect(rows.every((row) => row.fields.quantity === undefined)).toBe(true)
  })
})

describe('colour rows', () => {
  it('carries both ids, and does not confuse them', async () => {
    const rows = (await rowsFor('colors', getDbConnection))!
    const aqua = rows.find((row) => row.fields.name === 'Aqua')!
    // brickzuke's own, which is what narrows this list to the one colour …
    expect(aqua.fields.id).toBe(2)
    // … and BrickLink's, which is what asking BrickLink for a colour needs,
    // under the name a term addresses it by and as the number that term
    // compares against.
    expect(aqua.fields.colorid).toBe(41)
  })

  it('holds the colour id as a number so a term matches it exactly', async () => {
    const rows = (await rowsFor('colors', getDbConnection))!
    const aqua = rows.find((row) => row.fields.name === 'Aqua')!
    // `:` substring-matches strings and compares numbers exactly, so colour 2
    // must not answer for colour 12 or 21.
    expect(typeof aqua.fields.id).toBe('number')
  })

  it('reads the guide counts the columns draw', async () => {
    const rows = (await rowsFor('colors', getDbConnection))!
    const aqua = rows.find((row) => row.fields.name === 'Aqua')!
    // `Parts` is the number the Parts column shows and the press acts on.
    expect(aqua.fields.items).toBe(82)
    expect(aqua.fields.sets).toBe(60)
    expect(aqua.fields.yearFrom).toBe(1998)
    expect(aqua.fields.yearTo).toBe(2006)
  })
})

describe('item type rows', () => {
  it('names the type, which is on the BrickLink record and not brickzuke\'s', async () => {
    const rows = (await rowsFor('itemTypes', getDbConnection))!
    const part = rows.find((row) => row.fields.type === 'P')!
    // A stored item type is an id and nothing else, so the name has to come
    // off the BrickLink record — the original read it off the stored one and
    // drew nine blank lines.
    expect(part.fields.name).toBe('Part')
  })

  it('counts the items and the categories off the categories', async () => {
    const rows = (await rowsFor('itemTypes', getDbConnection))!
    const part = rows.find((row) => row.fields.type === 'P')!
    // Every category of this type, and not the one of another.
    expect(part.fields.items).toBe(7_500)
    // Two, not three: `Brick` and `Brick, Modified` are one brickzuke category
    // between them, which is one row in the table this number leads to.
    expect(part.fields.categories).toBe(2)
  })
})

/**
 * Putting a name to an id, which is what appfr 0.13 does with the terms a
 * press writes: a query reading `category:"5"` shows as `category:Brick (1)
 * (5)`, an id being a join key rather than anything a person recognises.
 *
 * The shell does it by running that term back against the type whose `scope`
 * names the field, so the name a type declares and the name its rows carry
 * have to be the same one — and nothing complains when they are not. An
 * unresolvable field is not a constraint in this language, so a scope naming a
 * field the rows do not have matches every row, and the header states the
 * first of them as confidently as it would the right one. Hence a case per
 * type a term ever names a record of.
 */
describe.each([
  ['categories', 'category', '5', 'Brick, Brick, Modified (1)'],
  ['colors', 'colorid', '41', 'Aqua'],
  ['itemTypes', 'type', 'P', 'Part'],
  ['itemVariants', 'variant', '3001-5', 'Brick 2 x 4']
])('a %s term', (key, field, id, name) => {
  it('names the one record it points at', async () => {
    const entity = catalogSchema.value.entities.find((candidate) => candidate.key === key)!
    // The field the header starts from: it has `category:"5"` and has to work
    // out that a category is what that is about.
    expect(scopedEntity(catalogSchema.value, field)?.key).toBe(key)

    const term = recordTerm(entity, id)!
    const rows = (await rowsFor(key, getDbConnection))!
    const found = rows.filter((row) => matchesExpression(parseExpression(term), row, entity))
    // One, and not the whole table: the count is the half of this that a
    // misspelled scope would quietly fail.
    expect(found.length).toBe(1)
    expect(cellTextOf(roleColumn(entity.columns ?? [], 'identity'), found[0]!)).toBe(name)
  })
})
