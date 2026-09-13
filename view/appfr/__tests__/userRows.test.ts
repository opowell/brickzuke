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
import STORES from '../../../idb/stores'
import { createUserCategory } from '../../../idb/userCategory'
import { createUserItem, updateUserItem } from '../../../idb/userItem'
import { addInventoryLine, createUserInventory } from '../../../idb/userInventory'
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
  userCategoryRows,
  userInventoryLineRows,
  userInventoryRows,
  userItemRows
} = await import('../userRows')
const {
  catalogSchema 
} = await import('../catalogSchema')
const {
  standingUserEntities 
} = await import('../userSchema')

beforeEach(async () => {
  const db = await getDbConnection()
  for (const store of [
    STORES.USER_CATEGORIES,
    STORES.USER_ITEMS,
    STORES.USER_INVENTORIES,
    STORES.USER_INVENTORY_LINES,
    STORES.SHOP_LISTS,
    STORES.SHOP_LIST_ITEMS
  ]) {
    await db.clear(store.name)
  }
  db.close()
})

async function connection() {
  return getDbConnection()
}

describe('somebody own categories and items', () => {
  it('counts the items in a category, off the items', async () => {
    const db = await connection()
    const category = await createUserCategory(db, 'Oddments')
    const item = await createUserItem(db, 'Sprue offcut')
    await updateUserItem(db, item.id, {
      userCategoryId: category.id 
    })
    await createUserItem(db, 'Uncategorised thing')

    const [row] = await userCategoryRows(db)
    expect(row.fields.name).toBe('Oddments')
    // Read off the items rather than kept on the category: a number held in
    // two places is a number that can disagree with itself.
    expect(row.fields.items).toBe(1)
    // The key a cell writes back through, and the field every item carries
    // this category's id in — the type's scope. Both, and both as numbers.
    expect(row.fields.id).toBe(category.id)
    expect(row.fields.usercategory).toBe(category.id)
    db.close()
  })

  it('names the category an item is in, and draws none where it has gone', async () => {
    const db = await connection()
    const category = await createUserCategory(db, 'Oddments')
    const item = await createUserItem(db, 'Sprue offcut')
    await updateUserItem(db, item.id, {
      userCategoryId: category.id 
    })
    expect((await userItemRows(db))[0].fields.usercategoryName).toBe('Oddments')

    await db.delete(STORES.USER_CATEGORIES.name, category.id)
    const [orphan] = await userItemRows(db)
    // Deleting a grouping does not delete what was grouped — see
    // [deleteUserCategory] — so the row is drawn without one.
    expect(orphan.fields.usercategoryName).toBeUndefined()
    expect(orphan.fields.name).toBe('Sprue offcut')
    db.close()
  })
})

describe('somebody own sets', () => {
  it('says how many parts and how many pieces', async () => {
    const db = await connection()
    const inventory = await createUserInventory(db, {
      name: 'My MOC' 
    })
    await addInventoryLine(db, inventory.id, {
      record: 'P-3001',
      quantity: 4 
    })
    await addInventoryLine(db, inventory.id, {
      record: 'P-3002',
      quantity: 2 
    })

    const [row] = await userInventoryRows(db)
    // Two different pieces, six of them in all — the pair a set is described
    // by, and the pair a shopping list draws as well.
    expect(row.fields.parts).toBe(2)
    expect(row.fields.pieces).toBe(6)
    db.close()
  })

  it('draws the lines of the inventory asked about and no other', async () => {
    const db = await connection()
    const mine = await createUserInventory(db, {
      name: 'Mine' 
    })
    const theirs = await createUserInventory(db, {
      name: 'Theirs' 
    })
    await addInventoryLine(db, mine.id, {
      record: 'P-3001',
      colorId: '5',
      quantity: 4 
    })
    await addInventoryLine(db, theirs.id, {
      record: 'P-3002' 
    })

    const rows = await userInventoryLineRows(db, mine.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].fields.record).toBe('P-3001')
    // A number, because `:` compares numbers exactly where it substring-matches
    // strings — `colorid:"85"` must not also answer for colour 185.
    expect(rows[0].fields.colorid).toBe(5)
    // The field that says which inventory this belongs to, which is what a
    // press on the parent narrowed by.
    expect(rows[0].fields.userinventory).toBe(mine.id)
    db.close()
  })

  it('draws nothing at all when the URL names no inventory', async () => {
    const db = await connection()
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
      shopStoresEntity,
      userInventoryLinesEntity
    } = await import('../userSchema')
    for (const entity of [
      userInventoryLinesEntity,
      shopListItemsEntity,
      shopPlanEntity,
      shopStoresEntity
    ]) {
      const offered = new Set((entity.sorts ?? []).map((sort) => sort.key))
      const missing = (entity.columns ?? [])
        .filter((column) => column.sort && !offered.has(column.sort))
        .map((column) => column.key)
      expect([entity.key, missing]).toEqual([entity.key, []])
    }
  })

  it('leaves the catalogue own types unable to be written to', () => {
    // The shell draws a create button for any type that names one, so this is
    // what keeps them off the tables brickzuke does not own: nothing here can
    // make a BrickLink category.
    const scraped = catalogSchema.value.entities.filter(
      (entity) => !entity.key.startsWith('user') && !entity.key.startsWith('shop')
    )
    expect(scraped.filter((entity) => entity.create || entity.delete)).toEqual([])
  })
})
