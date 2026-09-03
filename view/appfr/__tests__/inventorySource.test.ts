/**
 * The two query-addressed types: an opened item's records, and what one of
 * those records is made of.
 *
 * Neither is a table you browse — each is reached by a term naming exactly one
 * record, and answered by one indexed lookup rather than a scan. That is the
 * behaviour worth pinning: the right rows for the term, nothing at all without
 * one, and no leakage between two records.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import type { EntitySchema, QueryRequest, ShellRow } from 'header-content-layout'
import { catalogSource } from '../catalogSource'
import { putAll } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'

const inventory = {
  key: 'inventory',
  label: 'Inventory',
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: []
} as EntitySchema

const itemRecords = {
  ...inventory,
  key: 'itemRecords',
  label: 'Item records'
} as EntitySchema

function request(entity: EntitySchema, expr: string, sort = 'name'): QueryRequest {
  return {
    query: {
      entity: entity.key,
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
      entities: [entity]
    },
    entity,
    limit: 50,
    offset: 0
  }
}

function part(record: string, itemId: string, name: string, colorId: string, quantity: number) {
  return {
    id: `${record}|${itemId}-${colorId}`,
    record,
    quantity,
    itemVariant: {
      itemType: 'P',
      itemId,
      name,
      thumbnail: `https://img.example/${itemId}.png`,
      colorId,
      colorName: colorId === '11' ? 'Red' : 'Blue',
      catType: 'P',
      catString: '5',
      variantId: `${itemId}-${colorId}`,
      categoryName: 'Bricks'
    }
  }
}

beforeAll(async () => {
  const db = await getDbConnection()
  await putAll(db, STORES.ITEM_INVENTORIES, [
    part('S-10511-1', '3001', 'Brick 2 x 4', '11', 12),
    part('S-10511-1', '3020', 'Plate 2 x 4', '1', 4),
    part('S-60012-1', '3005', 'Brick 1 x 1', '11', 7)
  ])
  const itemsTx = db.transaction(STORES.ITEMS.name, 'readwrite')
  const blTx = db.transaction(STORES.BRICK_LINK_ITEMS.name, 'readwrite')
  void itemsTx.store.put({
    id: 42 
  })
  for (const type of ['I', 'O', 'S']) {
    void blTx.store.put({
      id: `${type}-10511-1`,
      bzItemId: 42,
      itemId: 42,
      Name: "\"Skipper's\" Flight School",
      itemType: type,
      image: `https://img.example/${type}.png`,
      'Category ID': '7',
      'Category Name': 'DUPLO / Planes',
      weight: '8.41',
      'Year Released': '2013',
      Dimensions: '38.2 x 26 x 9'
    })
  }
  await Promise.all([itemsTx.done, blTx.done])
  db.close()
})

async function rowsOf(entity: EntitySchema, expr: string): Promise<ShellRow[]> {
  const result = await catalogSource.query(request(entity, expr))
  return result.rows
}

describe('inventory, addressed by record', () => {
  it('returns what that record is made of', async () => {
    const rows = await rowsOf(inventory, 'record:"S-10511-1"')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.fields.name).sort()).toEqual(['Brick 2 x 4', 'Plate 2 x 4'])
    expect(rows.every((r) => r.entityKey === 'inventory')).toBe(true)
  })

  it('carries the quantity and the colour name the column reads', async () => {
    const rows = await rowsOf(inventory, 'record:"S-10511-1"')
    const brick = rows.find((r) => r.fields.itemId === '3001')!
    expect(brick.fields.quantity).toBe(12)
    expect(brick.fields.color).toBe('Red')
    expect(brick.fields.image).toBe('https://img.example/3001.png')
  })

  it('does not leak one set into another', async () => {
    const rows = await rowsOf(inventory, 'record:"S-60012-1"')
    expect(rows).toHaveLength(1)
    expect(rows[0].fields.name).toBe('Brick 1 x 1')
  })

  // A term naming nothing is the address of nothing. Returning the whole store
  // would be the dangerous reading, since an absent field matches every row in
  // this language.
  it('returns nothing when no record is named', async () => {
    expect(await rowsOf(inventory, '')).toHaveLength(0)
    expect(await rowsOf(inventory, 'brick')).toHaveLength(0)
  })
})

describe('item records, addressed by item', () => {
  it('returns one row per BrickLink record behind the item', async () => {
    const rows = await rowsOf(itemRecords, 'item:"42"')
    expect(rows).toHaveLength(3)
    // The items table collapses these three into one line; this is that line
    // opened up.
    expect(rows.map((r) => r.fields.type).sort()).toEqual(['I', 'O', 'S'])
  })

  it('keys each row by the BrickLink id an inventory is filed under', async () => {
    const rows = await rowsOf(itemRecords, 'item:"42"')
    // `fields.id` is what the name press sends to `record:"…"`, so it has to be
    // the same string `handlePageResponse` files an inventory under.
    expect(rows.map((r) => r.fields.id).sort()).toEqual([
      'I-10511-1',
      'O-10511-1',
      'S-10511-1'
    ])
  })

  it('returns nothing when no item is named', async () => {
    expect(await rowsOf(itemRecords, '')).toHaveLength(0)
  })
})
