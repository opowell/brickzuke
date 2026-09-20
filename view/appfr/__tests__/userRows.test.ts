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
  cartLineRows,
  cartRows,
  priceModifierProfileRows,
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
    STORES.CARTS,
    STORES.CART_LINES,
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

describe('carts', () => {
  it('sums what a cart holds off its lines, and says which one is active', async () => {
    const {
      createCart, setCartLine
    } = await import('../../../idb/cart')
    const {
      setSetting
    } = await import('../settings')
    const db = await connection()
    const cart = await createCart(db, 'Birthday')
    const other = await createCart(db, 'Later')
    await setCartLine(db, cart.id, {
      lotId: '1001',
      store: 'brickshop',
      storeName: 'Brick Shop',
      record: 'P-3001',
      name: 'Brick 2 x 4',
      price: 0.1
    }, 4)
    await setCartLine(db, cart.id, {
      lotId: '1002',
      store: 'other',
      record: 'P-3002'
      // No price: this lot's contribution to the cost is unknown, not nought.
    }, 2)
    setSetting('activeCart', String(cart.id))

    const rows = await cartRows(db)
    // Newest first, as every table of theirs opens.
    expect(rows.map((row) => row.fields.name)).toEqual(['Later', 'Birthday'])
    const [later, birthday] = rows
    expect(birthday.fields).toMatchObject({
      own: true,
      cart: cart.id,
      active: true,
      lots: 2,
      pieces: 6,
      sellers: 2,
      cost: 0.4
    })
    expect(later.fields).toMatchObject({
      active: false,
      lots: 0,
      pieces: 0,
      cost: undefined
    })
    // The cart's id is what `cart:` names it by, and the row's key is the
    // number the writing cells write back through.
    expect(birthday.id).toBe(String(cart.id))
    expect(other.id).toBeGreaterThan(cart.id)

    const lines = await cartLineRows(db, cart.id)
    expect(lines).toHaveLength(2)
    const priced = lines.find((line) => line.fields.lot === '1001')!
    // The lots table's own names for the same facts, so one vocabulary
    // reads both tables — and the line's cost, worked out rather than stored.
    expect(priced.fields).toMatchObject({
      own: true,
      cart: cart.id,
      itemName: 'Brick 2 x 4',
      record: 'P-3001',
      store: 'brickshop',
      storeName: 'Brick Shop',
      priceValue: 0.1,
      quantity: 4,
      cost: 0.4
    })
    expect(await cartLineRows(db, undefined)).toEqual([])
    setSetting('activeCart', '')
    db.close()
  })
})

describe('price modifier profiles', () => {
  it('counts what each holds off the modifiers, and says which one is active', async () => {
    const {
      createPriceModifierProfile
    } = await import('../../../idb/priceModifierProfile')
    const {
      setPriceModifier
    } = await import('../../../idb/priceModifier')
    const {
      setSetting
    } = await import('../settings')
    const db = await connection()
    const bulk = await createPriceModifierProfile(db, 'Bulk')
    const picky = await createPriceModifierProfile(db, 'Picky')
    await setPriceModifier(db, bulk.id, 'colors', '5', 1.2)
    await setPriceModifier(db, bulk.id, 'stores', 'brickmeister', 0.9)
    await setPriceModifier(db, picky.id, 'colors', '5', 0.8)
    setSetting('activeProfile', String(bulk.id))

    const rows = await priceModifierProfileRows(db)
    // Newest first, as every table of theirs opens.
    expect(rows.map((row) => row.fields.name)).toEqual(['Picky', 'Bulk'])
    const [pickyRow, bulkRow] = rows
    expect(bulkRow.fields).toMatchObject({
      own: true,
      profile: bulk.id,
      active: true,
      modifiers: 2
    })
    expect(pickyRow.fields).toMatchObject({
      active: false,
      modifiers: 1
    })
    // The profile's id is what `profile:` names it by, and the row's key is
    // the number the writing cells write back through.
    expect(bulkRow.id).toBe(String(bulk.id))
    setSetting('activeProfile', '')
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
      cartLinesEntity,
      shopListItemsEntity,
      shopPlanEntity,
      shopStoresEntity
    } = await import('../userSchema')
    for (const entity of [shopListItemsEntity, shopPlanEntity, shopStoresEntity, cartLinesEntity]) {
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
      (entity) =>
        !entity.key.startsWith('user') &&
        !entity.key.startsWith('shop') &&
        !entity.key.startsWith('cart') &&
        entity.key !== 'priceModifierProfiles'
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

/*
 * What a write leaves for the shell: the table re-read, and the ticks gone
 * with the rows they were on. The shell re-runs a query for a new source and
 * not for a new schema, so a write on a table of theirs has to say so — see
 * [userRevision] — and a write from a cell on a catalogue table must not, that
 * table being the lots stream a re-run would restart.
 */
describe('what a write leaves for the shell', () => {
  it('moves the revision for a record made, typed into and unmade', async () => {
    const {
      createRecordFor, deleteRecordsFor, userRevision, writeField
    } = await import('../userWrites')
    const entity = standingUserEntities().find((e) => e.key === 'shopLists')!
    const start = userRevision.value

    await createRecordFor(entity, '')
    expect(userRevision.value).toBe(start + 1)

    const db = await connection()
    const [list] = await shopListRows(db)
    db.close()
    await writeField('shopLists', Number(list.fields.id), 'name', 'Weekend order')
    expect(userRevision.value).toBe(start + 2)

    await deleteRecordsFor({
      ids: [String(list.fields.id)],
      rows: [],
      entity
    })
    expect(userRevision.value).toBe(start + 3)
  })

  it('leaves the revision alone for the quantity box on the lots table', async () => {
    const {
      setCartQuantity, userRevision
    } = await import('../userWrites')
    const {
      activeCart
    } = await import('../settings')
    const db = await connection()
    const cart = await (await import('../../../idb/cart')).createCart(db)
    db.close()
    activeCart.value = String(cart.id)
    const start = userRevision.value
    await setCartQuantity({
      id: '123456',
      store: 'Bricks R Us',
      quantity: 10,
      priceValue: 0.1 
    }, 3)
    // The lot's row reads its quantity off the active cart's lines, which the
    // write refreshed — a re-run of the walk over every lot would buy nothing.
    expect(userRevision.value).toBe(start)
    activeCart.value = ''
  })

  it('takes the ticks off the rows it deleted, and no others', async () => {
    const {
      deleteRecordsFor
    } = await import('../userWrites')
    const {
      cartSelection
    } = await import('../cartDraft')
    const db = await connection()
    const mine = await createUserCategory(db, 'Oddments')
    db.close()
    const entity = catalogSchema.value.entities.find((e) => e.key === 'categories')!
    // Both ticked: BrickLink's row, which stays, and theirs, which goes.
    cartSelection.value = ['5', String(userCategoryRef(mine.id))]
    await deleteRecordsFor({
      ids: cartSelection.value,
      rows: [],
      entity
    })
    expect(cartSelection.value).toEqual(['5'])
  })
})
