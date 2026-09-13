/**
 * The types nobody scraped, as the shell sees them.
 *
 * Two things are worth pinning here, and neither is that a row carries the
 * fields it was given. The first is that the three affordances this UI is made
 * of are actually declared — `create` and `delete` are what draw the only
 * buttons for making and unmaking a record, and a type that forgets one is a
 * type nobody can add to. The second is the pair of ids every row carries: the
 * key the writing cells write back through, and the scope field the header
 * reads a term back through, which are not always the same number and never
 * the same name.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'
import { createUserCategory } from '../../../idb/userCategory'
import { createUserItem, updateUserItem, userItemRecord } from '../../../idb/userItem'
import { addInventoryLine } from '../../../idb/userInventory'
import { addShopListItem, createShopList } from '../../../idb/shopList'

/* As [catalogSchema]'s own test does: the cards are headed by counts off the
   model, which is nothing this file is about. */
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

const {
  shopListItemRows,
  shopListRows,
  userInventoryLineRows,
  userItemRows
} = await import('../userRows')
const {
  forgetCatalogRows, rowsFor
} = await import('../catalogRows')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  standingUserEntities
} = await import('../userSchema')
const {
  userCategoryRef
} = await import('../../../idb/userCategory')

/** The categories table, read fresh — it is held between reads otherwise. */
async function categoryRows() {
  forgetCatalogRows()
  return (await rowsFor('categories', getDbConnection))!
}

beforeEach(async () => {
  const db = await getDbConnection()
  for (const store of [
    STORES.USER_CATEGORIES,
    STORES.USER_ITEMS,
    STORES.USER_INVENTORY_LINES,
    STORES.SHOP_LISTS,
    STORES.SHOP_LIST_ITEMS,
    STORES.CATEGORIES,
    STORES.BRICK_LINK_CATEGORIES,
    STORES.BRICK_LINK_COLORS
  ]) {
    await db.clear(store.name)
  }
  db.close()
})

async function connection() {
  return getDbConnection()
}

describe('somebody own categories, in the one categories table', () => {
  it('lists theirs beside BrickLink own, told apart by the row', async () => {
    const db = await connection()
    await putAll(db, STORES.CATEGORIES, [{
      id: 1 
    }])
    await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
      {
        categoryId: '5',
        bzCategoryId: 1,
        'Category Name': 'Brick',
        catType: 'P',
        items: 92 
      }
    ])
    const mine = await createUserCategory(db, 'Oddments')
    db.close()

    const rows = await categoryRows()
    const brick = rows.find((row) => row.fields.name === 'Brick (1)')!
    const oddments = rows.find((row) => row.fields.name === 'Oddments')!
    // One type, so one card and one table — and one `category:` term.
    expect(brick.entityKey).toBe('categories')
    expect(oddments.entityKey).toBe('categories')
    // Theirs is keyed by the very value a `category:` term holds, because
    // that is how the header finds the row to name — the rule BrickLink's
    // rows follow with their own id. It carries the key the writing cells
    // write back through as well, and the flag that says they may.
    expect(oddments.id).toBe(String(userCategoryRef(mine.id)))
    expect(brick.id).toBe('5')
    expect(oddments.fields.id).toBe(mine.id)
    expect(oddments.fields.own).toBe(true)
    expect(brick.fields.own).toBeUndefined()
    // The scope: BrickLink's id on theirs, the negative of the key on hers.
    expect(brick.fields.category).toBe(5)
    expect(oddments.fields.category).toBe(userCategoryRef(mine.id))
  })

  it('counts the items in one of theirs, off the items', async () => {
    const db = await connection()
    const category = await createUserCategory(db, 'Oddments')
    const item = await createUserItem(db, 'Sprue offcut')
    await updateUserItem(db, item.id, {
      categoryId: userCategoryRef(category.id) 
    })
    await createUserItem(db, 'Uncategorised thing')
    db.close()

    const row = (await categoryRows()).find((r) => r.fields.name === 'Oddments')!
    // Read off the items rather than kept on the category: a number held in
    // two places is a number that can disagree with itself.
    expect(row.fields.items).toBe(1)
  })

  it('names an item category whichever kind it is, and none where it has gone', async () => {
    const db = await connection()
    await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
      {
        categoryId: '5',
        bzCategoryId: 1,
        'Category Name': 'Brick',
        catType: 'P' 
      }
    ])
    const mine = await createUserCategory(db, 'Oddments')
    const filedUnderMine = await createUserItem(db, 'Sprue offcut')
    await updateUserItem(db, filedUnderMine.id, {
      categoryId: userCategoryRef(mine.id) 
    })
    const filedUnderBrickLink = await createUserItem(db, 'A brick of my own')
    await updateUserItem(db, filedUnderBrickLink.id, {
      categoryId: 5 
    })

    const named = (name: string) =>
      userItemRows(db).then((rows) => rows.find((r) => r.fields.ownName === name)!)
    // One field, one column, both kinds — the whole point of the merge.
    expect((await named('Sprue offcut')).fields.categoryName).toBe('Oddments')
    expect((await named('Sprue offcut')).fields.ownCategory).toBe(true)
    expect((await named('A brick of my own')).fields.categoryName).toBe('Brick')
    expect((await named('A brick of my own')).fields.ownCategory).toBe(false)

    await db.delete(STORES.USER_CATEGORIES.name, mine.id)
    // Deleting a grouping does not delete what was grouped — see
    // [deleteUserCategory] — so the row is drawn without one.
    expect((await named('Sprue offcut')).fields.categoryName).toBeUndefined()
    expect((await named('Sprue offcut')).fields.ownName).toBe('Sprue offcut')
    db.close()
  })
})

describe('somebody own sets, as items with parts', () => {
  it('draws an item of theirs as a row of the items table, a set once it has parts', async () => {
    const db = await connection()
    const set = await createUserItem(db, 'My MOC')
    const record = userItemRecord(set.id)
    const [before] = await userItemRows(db)
    // A row of `items`, keyed and addressed by its record like BrickLink's,
    // the record after the name as a catalogue row carries it, and the name
    // on its own for the box to hold.
    expect(before.entityKey).toBe('items')
    expect(before.id).toBe(record)
    expect(before.fields.record).toBe(record)
    expect(before.fields.name).toBe(`My MOC (${record})`)
    expect(before.fields.ownName).toBe('My MOC')
    expect(before.fields.type).toBe('U')
    // Not a set yet: nothing is under it, and nought would say it is one.
    expect(before.fields.parts).toBeUndefined()

    await addInventoryLine(db, record, {
      part: 'P-3001',
      quantity: 4 
    })
    await addInventoryLine(db, record, {
      part: 'P-3002',
      quantity: 2 
    })
    const [after] = await userItemRows(db)
    // Six pieces, counted the way a BrickLink set's are.
    expect(after.fields.parts).toBe(6)
    db.close()
  })

  it('draws the parts of the set asked about, in the inventory shape', async () => {
    const db = await connection()
    await putAll(db, STORES.BRICK_LINK_COLORS, [
      {
        colorId: '5',
        bzColorId: '1',
        'Color Name': 'Red' 
      }
    ])
    const mine = userItemRecord((await createUserItem(db, 'Mine')).id)
    const theirs = userItemRecord((await createUserItem(db, 'Theirs')).id)
    await addInventoryLine(db, mine, {
      part: 'P-3001',
      colorId: '5',
      name: 'Brick 2 x 4',
      quantity: 4 
    })
    await addInventoryLine(db, theirs, {
      part: 'P-3002' 
    })

    const rows = await userInventoryLineRows(db, mine)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.entityKey).toBe('inventory')
    // The fields a part of a BrickLink set has, under the same names — the
    // set in `record`, the part split into its type and number, the colour's
    // name looked up from its id and the id held as a number.
    expect(row.fields.record).toBe(mine)
    expect(row.fields.part).toBe('P-3001')
    expect(row.fields.type).toBe('P')
    expect(row.fields.itemId).toBe('3001')
    expect(row.fields.color).toBe('Red')
    expect(row.fields.colorid).toBe(5)
    expect(row.fields.quantity).toBe(4)
    expect(row.fields.own).toBe(true)
    db.close()
  })

  it('draws nothing for a record that is not one of theirs', async () => {
    const db = await connection()
    // A BrickLink set's parts come from the other store, and nothing of theirs
    // must answer for it.
    expect(await userInventoryLineRows(db, 'S-10511-1')).toEqual([])
    expect(await userInventoryLineRows(db, undefined)).toEqual([])
    db.close()
  })
})

describe('shopping lists', () => {
  it('says what a wanted part asks for', async () => {
    const db = await connection()
    const list = await createShopList(db, {
      name: 'Weekend order' 
    })
    await addShopListItem(db, list.id, {
      record: 'P-3001',
      colorId: '5',
      name: 'Brick 2 x 4',
      minQuantity: 4,
      maxPrice: 0.2,
      condition: 'N'
    })

    const [row] = await shopListItemRows(db, list.id)
    // Drawn as `quantity`, so a column headed Quantity means the same thing on
    // this table as on the one beside it — see FIELD_OF in [userWrites].
    expect(row.fields.quantity).toBe(4)
    expect(row.fields.maxPrice).toBe(0.2)
    // The code a lot carries, and the word a reader reads.
    expect(row.fields.condition).toBe('N')
    expect(row.fields.conditionName).toBe('New')

    const [parent] = await shopListRows(db)
    expect(parent.fields.parts).toBe(1)
    expect(parent.fields.pieces).toBe(4)
    db.close()
  })
})

describe('what the shell is told it may do', () => {
  it('offers making and unmaking on every standing type', () => {
    // These two are the whole of the UI for it: the shell draws `+ New…` and
    // the ticks for a type that names them, and draws neither for one that
    // does not. A type that forgets one cannot be added to at all.
    for (const entity of standingUserEntities()) {
      expect([entity.key, Boolean(entity.create), Boolean(entity.delete)]).toEqual([
        entity.key,
        true,
        true
      ])
    }
  })

  it('names a scope on each, so a press on a row can narrow to it', () => {
    for (const entity of standingUserEntities()) {
      expect([entity.key, Boolean(entity.scope)]).toEqual([entity.key, true])
    }
  })

  it('offers every sort its columns ask for, on the detail types too', async () => {
    // The same invariant [catalogSchema]'s own test holds over the declared
    // types, applied to the four that are declared only while they are open —
    // a column naming a sort its type does not offer is a heading that quietly
    // is not a button.
    const {
      shopListItemsEntity,
      shopPlanEntity,
      shopStoresEntity
    } = await import('../userSchema')
    for (const entity of [shopListItemsEntity, shopPlanEntity, shopStoresEntity]) {
      const offered = new Set((entity.sorts ?? []).map((sort) => sort.key))
      const missing = (entity.columns ?? [])
        .filter((column) => column.sort && !offered.has(column.sort))
        .map((column) => column.key)
      expect([entity.key, missing]).toEqual([entity.key, []])
    }
  })

  it('offers making and unmaking on the catalogue types that list theirs, and no other', () => {
    // The shell draws a create button for any type that names one, so this is
    // what keeps them off the tables brickzuke does not own. Categories and
    // items are the exceptions because theirs are rows of them — what the
    // button makes is one of theirs, and nothing here can make one of
    // BrickLink's. A set's parts are the third, but only while the set on
    // screen is theirs, which no URL here names.
    const scraped = catalogSchema.value.entities.filter(
      (entity) => !entity.key.startsWith('user') && !entity.key.startsWith('shop')
    )
    expect(
      scraped.filter((entity) => entity.create || entity.delete).map((e) => e.key)
    ).toEqual(['categories', 'items'])
  })

  it('deletes only their own rows of the items table, whatever is ticked', async () => {
    const db = await connection()
    const mine = await createUserItem(db, 'Sprue offcut')
    db.close()

    const {
      deleteRecordsFor
    } = await import('../userWrites')
    const entity = catalogSchema.value.entities.find((e) => e.key === 'items')!
    // A catalogue item's id is brickzuke's number; theirs is the record.
    await deleteRecordsFor({
      ids: ['12345', userItemRecord(mine.id)],
      rows: [],
      entity
    })
    const db2 = await connection()
    expect(await userItemRows(db2)).toHaveLength(0)
    db2.close()
  })

  it('deletes only their own rows of the categories table, whatever is ticked', async () => {
    const db = await connection()
    await putAll(db, STORES.CATEGORIES, [{
      id: 1 
    }])
    await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
      {
        categoryId: '5',
        bzCategoryId: 1,
        'Category Name': 'Brick',
        catType: 'P' 
      }
    ])
    const mine = await createUserCategory(db, 'Oddments')
    db.close()

    const {
      deleteRecordsFor
    } = await import('../userWrites')
    const entity = catalogSchema.value.entities.find((e) => e.key === 'categories')!
    // Both ticked: BrickLink's row by its id, theirs by its negative one.
    await deleteRecordsFor({
      ids: ['5', String(userCategoryRef(mine.id))],
      rows: [],
      entity
    })

    const after = await categoryRows()
    expect(after.some((row) => row.fields.name === 'Oddments')).toBe(false)
    // BrickLink's row is exactly where it was.
    expect(after.some((row) => row.fields.name === 'Brick (1)')).toBe(true)
  })
})
