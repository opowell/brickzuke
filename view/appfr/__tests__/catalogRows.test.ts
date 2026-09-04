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
import { describe, it, expect, beforeAll } from 'vitest'
import { rowsFor } from '../catalogRows'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'

beforeAll(async () => {
  const db = await getDbConnection()
  await putAll(db, STORES.COLORS, [
    {
      id: 2,
      name: 'Aqua'
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
    }
  ])
  await putAll(db, STORES.ITEM_TYPES, [
    {
      id: 7
    }
  ])
  await putAll(db, STORES.BRICK_LINK_ITEM_TYPES, [
    {
      // The whole of what the item types download states: a code and a name,
      // filed on the BrickLink record because brickzuke's own is left empty.
      itemTypeId: 'P',
      bzItemTypeId: 7,
      'Item Type Name': 'Part'
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
  db.close()
})

describe('colour rows', () => {
  it('carries both ids, and does not confuse them', async () => {
    const rows = (await rowsFor('colors', getDbConnection))!
    const aqua = rows.find((row) => row.fields.name === 'Aqua')!
    // brickzuke's own, which is what narrows this list to the one colour …
    expect(aqua.fields.id).toBe(2)
    // … and BrickLink's, which is what asking BrickLink for a colour needs.
    expect(aqua.fields.colorId).toBe('41')
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
    const part = rows.find((row) => row.fields.code === 'P')!
    // A stored item type is an id and nothing else, so the name has to come
    // off the BrickLink record — the original read it off the stored one and
    // drew nine blank lines.
    expect(part.fields.name).toBe('Part')
  })

  it('counts the items and the categories off the categories', async () => {
    const rows = (await rowsFor('itemTypes', getDbConnection))!
    const part = rows.find((row) => row.fields.code === 'P')!
    // Every category of this type, and not the one of another.
    expect(part.fields.items).toBe(7_500)
    // Two, not three: `Brick` and `Brick, Modified` are one brickzuke category
    // between them, which is one row in the table this number leads to.
    expect(part.fields.categories).toBe(2)
  })
})
