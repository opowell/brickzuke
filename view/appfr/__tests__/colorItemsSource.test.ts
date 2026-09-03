/**
 * The items of one colour, as a table.
 *
 * Reached by pressing a count in the colours table, and addressed by the two
 * terms that press writes. The behaviour worth pinning is that the address is
 * exact — colour 2 is not colour 12, and the parts made in a colour are not
 * the sets containing it — because both mistakes would answer a number with
 * the wrong rows while looking perfectly correct.
 *
 * `query` reads what is stored and never fetches, which is what lets these run
 * with no extension and no network.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import type { EntitySchema, QueryRequest, ShellRow } from 'header-content-layout'
import { catalogSource } from '../catalogSource'
import { putAll } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'
import type { StoredColorItem } from '../../stores/bricklink/catalog-list-color-page'

const colorItems = {
  key: 'colorItems',
  label: 'Color items',
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: [
    {
      key: 'name',
      role: 'identity',
      label: 'Name'
    }
  ]
} as EntitySchema

function request(expr: string, sort = 'name'): QueryRequest {
  return {
    query: {
      entity: colorItems.key,
      view: 'table',
      sort,
      dir: 'asc',
      expr,
      facets: {},
      page: 1
    },
    schema: {
      key: 'brickzuke',
      label: 'Brickzuke',
      kicker: '',
      placeholder: '',
      entities: [colorItems]
    },
    entity: colorItems,
    limit: 50,
    offset: 0
  }
}

function item(catType: string, colorId: string, blItemId: string, number: string, name: string) {
  return {
    id: `${catType}-${colorId}|${blItemId}`,
    scope: `${catType}-${colorId}`,
    colorId,
    catType,
    blItemId,
    itemNumber: number,
    itemName: name,
    image: `https://img.example/${number}.png`
  }
}

beforeAll(async () => {
  const db = await getDbConnection()
  await putAll<StoredColorItem>(db, STORES.COLOR_ITEMS, [
    // Colour 2's parts …
    item('P', '2', '11', '3001', 'Brick 2 x 4'),
    item('P', '2', '12', '3020', 'Plate 2 x 4'),
    // … the sets containing it, which is a different question …
    item('S', '2', '13', '10511-1', "Skipper's Flight School"),
    // … and a colour whose id merely starts the same way.
    item('P', '12', '14', '3005', 'Brick 1 x 1')
  ])
  db.close()
})

async function rowsOf(expr: string): Promise<ShellRow[]> {
  return (await catalogSource.query(request(expr))).rows
}

describe('colour items, addressed by colour and type', () => {
  it('returns the parts made in that colour', async () => {
    const rows = await rowsOf('colorid:"2" type:"P"')
    expect(rows.map((r) => r.fields.name)).toEqual(['Brick 2 x 4', 'Plate 2 x 4'])
    expect(rows.every((r) => r.entityKey === 'colorItems')).toBe(true)
  })

  it('does not answer colour 2 with colour 12', async () => {
    const rows = await rowsOf('colorid:"2" type:"P"')
    expect(rows.map((r) => r.fields.number)).not.toContain('3005')
  })

  it('keeps the sets containing a colour apart from the parts made in it', async () => {
    const rows = await rowsOf('colorid:"2" type:"S"')
    expect(rows.map((r) => r.fields.number)).toEqual(['10511-1'])
  })

  it('reads parts when the query names no type, as the Parts press writes', async () => {
    const rows = await rowsOf('colorid:"2"')
    expect(rows.map((r) => r.fields.number)).toEqual(['3001', '3020'])
  })

  // A colour is the address of this table; without one there is no table, and
  // returning the store would be the dangerous reading.
  it('returns nothing when no colour is named', async () => {
    expect(await rowsOf('')).toHaveLength(0)
    expect(await rowsOf('brick')).toHaveLength(0)
  })

  it('carries the pair that leads back to the item', async () => {
    const rows = await rowsOf('colorid:"2" type:"P"')
    // `type` and `itemId` are what the name press turns into `(P-3001)`, so
    // both have to be on the row.
    expect(rows[0].fields.type).toBe('P')
    expect(rows[0].fields.itemId).toBe('3001')
  })

  it('narrows by whatever the query says besides the address', async () => {
    const rows = await rowsOf('colorid:"2" type:"P" name:"Plate"')
    expect(rows.map((r) => r.fields.name)).toEqual(['Plate 2 x 4'])
  })
})
