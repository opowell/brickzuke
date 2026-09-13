/**
 * Making, changing and deleting a record of somebody's own, from the shell.
 *
 * The three gestures the shell offers a host and applies none of itself: it
 * draws `+ New…` on the bar over a type that names `create` and reports the
 * press; it offers ticks and a `Delete` for a type that names `delete` and
 * reports the selection; and it hands a cell to a component of the host's own,
 * which is where an edit comes from. This is the other side of all three, and
 * the one place brickzuke writes anything somebody typed.
 *
 * Every write ends in [refreshUserCounts], which is what makes the new row
 * appear — see the note there.
 */
import type { EntitySchema, Selection } from 'header-content-layout'
import type { IDBPDatabase } from 'idb'
import { getDbConnection } from '../../idb/idb'
import { refreshUserCounts } from './userCounts'
import { createUserCategory, deleteUserCategory, updateUserCategory } from '../../idb/userCategory'
import { createUserItem, deleteUserItem, updateUserItem } from '../../idb/userItem'
import {addInventoryLine,
  createUserInventory,
  deleteUserInventory,
  removeInventoryLine,
  updateInventoryLine,
  updateUserInventory} from '../../idb/userInventory'
import {addShopListItem,
  createShopList,
  deleteShopList,
  removeShopListItem,
  shopListFromInventory,
  shopListFromRecord,
  updateShopList,
  updateShopListItem} from '../../idb/shopList'
import { forgetPlan } from './shopPlan'

/** One connection per write, opened and closed — as every reader here does. */
async function writing<T>(write: (db: IDBPDatabase) => Promise<T>): Promise<T> {
  const db = await getDbConnection()
  try {
    return await write(db)
  } finally {
    db.close()
    // The plan is worked out from the lots against a list, so any change to a
    // list is a plan that no longer describes it.
    forgetPlan()
    await refreshUserCounts()
  }
}

/**
 * Which record a row is, for the two writes that are given one.
 *
 * The numeric key rather than the row's `id`, which the shell requires to be a
 * string — and for `shopStores` is not a key at all.
 */
export function recordId(fields: Record<string, unknown>): number | undefined {
  const id = Number(fields.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

/**
 * The id in the URL that a detail type belongs to — which inventory's lines
 * are up, which list's parts.
 *
 * Read off the expression rather than passed in, because that is where the
 * shell keeps it: opening a detail type states the term, and a new line has to
 * go under the record the table is already showing.
 */
export function openedId(expr: string, field: string): number | undefined {
  const found = new RegExp(`${field}:"?(\\d+)"?`).exec(expr)
  const id = found ? Number(found[1]) : NaN
  return Number.isFinite(id) && id > 0 ? id : undefined
}

/**
 * A blank record of whatever type the press came from.
 *
 * Blank, and not a dialog asking what to call it first: the name is a cell in
 * the table the press was made from, so the row arrives ready to be typed over
 * — which is one gesture rather than two, and is how [CellSetting] already
 * treats a value somebody owns.
 *
 * A detail type makes its record under the one in the URL, and makes nothing at
 * all when the URL names none: a line with no inventory is a line nothing can
 * ever show.
 */
export async function createRecordFor(entity: EntitySchema, expr: string): Promise<void> {
  await writing(async (db) => {
    switch (entity.key) {
      case 'userCategories':
        return void (await createUserCategory(db))
      case 'userItems':
        return void (await createUserItem(db))
      case 'userInventories':
        return void (await createUserInventory(db))
      case 'shopLists':
        return void (await createShopList(db))
      case 'userInventoryLines': {
        const inventoryId = openedId(expr, 'userinventory')
        return inventoryId ? void (await addInventoryLine(db, inventoryId)) : undefined
      }
      case 'shopListItems': {
        const listId = openedId(expr, 'shoplist')
        return listId ? void (await addShopListItem(db, listId)) : undefined
      }
      default:
        return undefined
    }
  })
}

/**
 * The ticked records, gone.
 *
 * A selection outlives the page it was made on, so the ids are all of it — see
 * the shell's own note on `Selection`. They are this type's keys, which is what
 * every one of these stores is keyed by.
 */
export async function deleteRecordsFor(selection: Selection): Promise<void> {
  const key = selection.entity?.key
  const ids = selection.ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
  if (!key || !ids.length) {
    return
  }
  await writing(async (db) => {
    for (const id of ids) {
      switch (key) {
        case 'userCategories':
          await deleteUserCategory(db, id)
          break
        case 'userItems':
          await deleteUserItem(db, id)
          break
        case 'userInventories':
          await deleteUserInventory(db, id)
          break
        case 'userInventoryLines':
          await removeInventoryLine(db, id)
          break
        case 'shopLists':
          await deleteShopList(db, id)
          break
        case 'shopListItems':
          await removeShopListItem(db, id)
          break
      }
    }
  })
}

/**
 * Where a column's key is not the field on the record.
 *
 * Two of them, and both for a reason the tables cannot give up. A column a term
 * can be written against has to be lowercase, the expression parser lowercasing
 * a term's field — so the colour is `colorid` in a row and `colorId` on the
 * record. And a wanted part's `minQuantity` is drawn as `quantity`, because a
 * column headed Quantity beside one headed Quantity on the next table should
 * mean the same thing to a reader whichever table they are on.
 *
 * Per type rather than one map, `quantity` being the record's own field on an
 * inventory line and a different one on a wanted part.
 */
const FIELD_OF: Record<string, Record<string, string>> = {
  userItems: {
    usercategory: 'userCategoryId'
  },
  userInventoryLines: {
    colorid: 'colorId'
  },
  shopListItems: {
    colorid: 'colorId',
    quantity: 'minQuantity'
  }
}

/**
 * One field of one record, as the cell that drew it hands it over.
 *
 * The field is the column's own key, so a column and the thing it writes cannot
 * drift apart: a cell that draws `name` writes `name`. The two columns whose
 * key is not the record's own field are named above.
 */
export async function writeField(
  entityKey: string,
  id: number,
  field: string,
  value: unknown
): Promise<void> {
  await writing(async (db) => {
    const changes = {
      [FIELD_OF[entityKey]?.[field] ?? field]: value
    }
    switch (entityKey) {
      case 'userCategories':
        return void (await updateUserCategory(db, id, changes))
      case 'userItems':
        return void (await updateUserItem(db, id, changes))
      case 'userInventories':
        return void (await updateUserInventory(db, id, changes))
      case 'userInventoryLines':
        return void (await updateInventoryLine(db, id, changes))
      case 'shopLists':
        return void (await updateShopList(db, id, changes))
      case 'shopListItems':
        return void (await updateShopListItem(db, id, changes))
      default:
        return undefined
    }
  })
}

/**
 * "Shop parts" on a set BrickLink lists: a list of everything in it, and the
 * plan for buying it.
 *
 * Gives back the list's id so the caller can open it, and nothing where the
 * set's inventory has not been fetched — a list with nothing on it would read
 * as a set with nothing in it. See [shopListFromRecord].
 */
export async function shopPartsOf(record: string, setName?: string): Promise<number | undefined> {
  return writing(async (db) => (await shopListFromRecord(db, record, setName))?.id)
}

/** The same, for a set of somebody's own. */
export async function shopPartsOfInventory(inventoryId: number): Promise<number | undefined> {
  return writing(async (db) => (await shopListFromInventory(db, inventoryId))?.id)
}
