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
