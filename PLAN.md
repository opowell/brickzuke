# Custom items/categories/inventories + "Shop parts" (multi-seller buying)

## Context

`brickzuke` today is a pure read-only catalog cache: every IndexedDB store is
filled by scraping BrickLink through the companion Chrome extension, and
`idb/idb.ts`'s migration history routinely `.clear()`s stores on version bumps
because scraped data can always be re-fetched. There is no user-authored data
anywhere, and no form/CRUD UI pattern in the app.

`TODO.md` asks for the ability to create items, inventories, and categories,
plus an item action ("buy parts"/"shop parts") that checks a variety of
sellers for buying all the parts in a set — for both existing catalog sets
and the user's own custom sets/shopping lists.

Two scope decisions were confirmed with the user up front:
- "Variety of sellers" = multiple independent **BrickLink storefronts**
  (`Store`/`InvItem`, already scraped) — not other marketplaces like BrickOwl.
  No new scraping/data source is needed, only cross-seller aggregation logic.
- The new create/shop UI is **entities in the existing appfr schema**, not
  standalone views. Revised after reading the shell's own type declarations:
  `EntitySchema.create` puts a "+ New…" button on the bar over that type's
  list and reports the press as `create(entity)`; `delete` offers row ticks
  and reports `delete(selection)`; `ColumnDef.component` hands a cell to a
  component of the host's own. `RecordActions` — which draws those buttons —
  is rendered by `DataShell` itself, *outside* the `#results` slot brickzuke
  overrides, so brickzuke gets them for free.

This plan adds the user-authored data as new IndexedDB stores kept explicitly
outside the existing clear-and-rescrape migration pattern, new CRUD helpers
following the existing `idb/category.ts` file-per-entity convention, new
entities in `catalogSchema.ts` drawn by the shell that already draws every
other type, and a first-cut "cheapest single seller per line" purchase-planning
algorithm, explicitly deferring full shipping-cost optimization across stores
as a documented non-goal.

Corrections to earlier research, all three found by reading the code:

- `idb/types.ts` *does* declare `ShopList`, `ShopListItem`, `UiShopList` and
  `UiListItem`, and `ShopListItem` already carries `minQuantity`,
  `maxQuantity`, `maxPrice` and `colors`. But **nothing imports that file** —
  it is a dead type dump from the older model, `Cart`, `CartItem`, `InvItem`
  and `Store` included. So it is neither a conflict to avoid nor a shape to
  build on: the live types for a lot on offer are `StoredStoreLot` and
  `StoreInventory`, which reach the app as `ShellRow`s. New types are declared
  in `idb/userTypes.ts`, and the dead file is left alone.
- The purchase planner does not need to gather candidate lots itself.
  `eachLot(visit)` in `catalogSource.ts` already walks every lot brickzuke
  holds — this session's item-page lots, then the stored `STORE_LOTS` off a
  cursor — each one joined to its seller and country and carrying `record`,
  `colorid`, `condition`, `quantity`, `priceValue` and `store`. That is the
  cross-seller candidate pool, and the cursor is what keeps a seller's
  thousands of lots off the heap.
- A write needs no refresh mechanism of its own. `useResults` watches the
  *schema* alongside the query, so a revision the schema reads — here the
  user populations, which a create or a delete genuinely changes — re-runs
  the query on its own.

## Data model

**New stores** (`idb/stores.ts`, following the existing `StoreDefinition`
pattern, each with a short "why this exists / why it's exempt from clearing"
JSDoc comment matching the file's convention):

```
USER_ITEMS:          { name: 'userItems', keyPath: 'id', autoIncrement: true }
USER_CATEGORIES:     { name: 'userCategories', keyPath: 'id', autoIncrement: true }
USER_INVENTORIES:    { name: 'userInventories', keyPath: 'id', autoIncrement: true }
USER_INVENTORY_LINES:{ name: 'userInventoryLines', keyPath: 'id', autoIncrement: true }
SHOP_LISTS:          { name: 'shopLists', keyPath: 'id', autoIncrement: true }
SHOP_LIST_ITEMS:     { name: 'shopListItems', keyPath: 'id', autoIncrement: true }
```

`USER_INVENTORIES`/`USER_INVENTORY_LINES` are **parallel** to `ITEM_INVENTORIES`
rather than writing into it: that store is keyed by BrickLink's own record id
(`S-10511-1`) and its rows are treated as freely re-fetchable; mixing
user-authored lines in risks id collisions and future data loss.

**New indices** (`idb/indices.ts`):
```
USER_INVENTORY_LINES_BY_INVENTORY: store USER_INVENTORY_LINES, keyPath 'inventoryId'
SHOP_LIST_ITEMS_BY_LIST:           store SHOP_LIST_ITEMS, keyPath 'listId'
```

**New types** (`idb/userTypes.ts` — see the correction above: `idb/types.ts` is dead):
```ts
export interface UserItem {
  id: number
  name: string
  categoryId?: number       // Category.id, if it fits an existing catalog category
  userCategoryId?: number   // UserCategory.id
  note?: string
  createdAt: Date
}

export interface UserCategory {
  id: number
  name: string
  createdAt: Date
}

export interface UserInventory {
  id: number
  name: string        // e.g. "My custom MOC"
  itemId?: number      // catalog Item.itemId, if this is "extra/alt parts for set X"
  createdAt: Date
}

export interface UserInventoryLine {
  id: number
  inventoryId: number
  itemId?: number      // catalog Item, when the part is real
  userItemId?: number  // UserItem, when the part is custom
  colorId?: string
  quantity: number
}

export interface ShopList {
  id: number
  name: string
  sourceInventoryId?: number  // "generated from this UserInventory / catalog set"
  createdAt: Date
}

export interface ShopListItem {
  id: number
  listId: number
  itemId?: number
  userItemId?: number
  colorId?: string
  minQuantity: number
  maxPrice?: number
  condition?: 'New' | 'Used'
}
```

**Migration** (`idb/idb.ts`): bump `DB_VERSION` 23 → 24, add a version comment
in the file's existing prose style explaining the new stores are
user-authored and must never be added to a version-gated `.clear()` block
(nothing here is re-derivable from a scrape). No other migration code is
needed — the existing `Object.values(STORES)`/`Object.values(INDICES)` loops
auto-create anything new.

## CRUD helper modules (new files, mirroring `idb/category.ts`'s shape)

- `idb/userItem.ts` — `createUserItem`, `updateUserItem`, `deleteUserItem`, `loadUserItem`, `loadUserItems`.
- `idb/userCategory.ts` — same shape for categories.
- `idb/userInventory.ts` — `createUserInventory`, `addInventoryLine`, `updateInventoryLine`, `removeInventoryLine`, `loadUserInventory` (joins lines via the new index like `loadCategory` joins `BRICK_LINK_CATEGORIES_BY_CATEGORY_ID`), `loadUserInventories`.
- `idb/shopList.ts` — `createShopList`, `addShopListItem`, `updateShopListItem`, `removeShopListItem`, `loadShopList`, `loadShopLists`, and `createShopListFromInventory(db, {userInventoryId?, catalogRecord?})` — copies lines from either a `UserInventory` or an existing set's `ITEM_INVENTORIES` rows into fresh `ShopListItem`s (`minQuantity` defaults to the source quantity).

All writes go through the existing generic `put`/`putAll`/`dbDelete` in `idb/db.ts` — no new write primitives needed.

## "Shop parts" purchase planning (`idb/shopParts.ts`)

```ts
export async function planPurchase(
  db: IDBPDatabase,
  lines: { itemId?: number; userItemId?: number; colorId?: string; neededQuantity: number; maxPrice?: number }[],
  options?: { storeIds?: string[] }
): Promise<CartWithItems>  // reuse existing Cart/CartItem shape for the result
```

Algorithm (first cut, deliberately simple):
1. For each line with an `itemId`, gather candidate `InvItem`s across
   known stores (reuse whatever in-memory filter the existing part/variant
   page code already uses to list an item's lots — check before adding a new
   index). Lines with only a `userItemId` have no BrickLink candidates and
   are reported as unfulfilled (nothing to match against a custom part).
2. Restrict to `options.storeIds` if given, and to each line's `maxPrice`.
3. Sort by adjusted price ascending (reuse existing price-adjustment/currency
   logic already used for display, e.g. `priceCurrency.ts`).
4. Pick the single cheapest lot that covers the full needed quantity; if none
   does, take the largest available lot and record the shortfall.
5. Group the chosen lots into `CartItem`s by store, producing a `CartWithItems`-shaped result with a subtotal per store.

**Explicit non-goal**, documented at the top of the file: minimizing total
cost including shipping across a chosen subset of stores is a set-cover /
bin-packing problem; v1 only answers "cheapest single seller per line" and
shows each store's flat `shippingCosts` alongside its subtotal for the user
to weigh manually. A follow-up optimization pass is left as a future TODO.

## UI: new types in the schema the shell already draws

No new router, no `<router-view/>`, no views directory. Every user-authored
type is an `EntitySchema` in `catalogSchema.ts` like `categories` or `stores`,
which buys the whole shell for each of them: a home-screen card, a table, the
query language, sorting, paging and the URL state.

**New entities** — `userCategories`, `userItems`, `userInventories`,
`shopLists` unconditionally, and `userInventoryLines`, `shopListItems`,
`shopPlan`, `shopStores` declared only while the record they belong to is open,
the way `inventory` and `colorItems` already are.

**Making one** — each of the four standing types names `create`, which the
shell draws as `+ New…` on the bar over that type's list and reports as
`create(entity)`; `ItemsShell.vue` handles it by writing a blank record and
letting the re-query show it. Not on the home screen: brickzuke replaces
`TypeCardsView` with `HomeCards`, which draws no create button — so making one
is two presses, the type's card and then the bar. Worth noting rather than
worth fixing.

**Editing one** — `ColumnDef.component`, exactly as `CellSetting.vue` already
does for a setting's value: `CellUserText.vue`, `CellUserNumber.vue` and
`CellUserPick.vue` read which field they are from `column.key` and which
record from the row, and write through the CRUD helpers. The control is the
browser's own `<input>`/`<select>`, as `CellSetting`'s is, and the write is on
`change` for the same reason.

**Deleting** — each standing type names `delete`, which offers the shell's row
ticks and reports `delete(selection)`.

**Re-reading after a write** — the user populations live in a ref the schema
reads (`userCounts.ts`, the sibling of `catalogCounts.ts`), so a create or a
delete rebuilds the schema, and `useResults` — which watches the schema
alongside the query — re-runs the query. An edited *field* needs none of this:
the cell holds what was typed, the way `CellSetting`'s does.

**The "Shop parts" action on an existing set** — a column on the set-inventory
view, which is where someone looking at what a set is made of already is. It
calls `shopListFromRecord` for the open set and navigates to the new list, so
"buy the parts in this set" and "buy the parts on my list" are one path after
the first press.

## Phases (independently shippable)

1. **Schema + CRUD, no UI**: `idb/stores.ts`, `idb/indices.ts`, `idb/idb.ts`
   (version bump + comment), `idb/userTypes.ts`, and `idb/userItem.ts` /
   `userCategory.ts` / `userInventory.ts` / `shopList.ts`. Fully testable in
   isolation.
2. **The types on screen**: `userCounts.ts`, `userRows.ts`, `userWrites.ts`,
   the three cell components, the entities in `catalogSchema.ts`, and the
   `@create`/`@delete` handlers in `ItemsShell.vue`.
3. **Shopping lists**: the `shopLists`/`shopListItems` entities, and
   `shopListFromInventory` / `shopListFromRecord` wired to the button on the
   set-inventory view.
4. **Buy-parts comparison**: `idb/shopParts.ts`, and the `shopPlan` and
   `shopStores` entities it feeds.

## Testing

- `idb/__tests__/userData.test.ts` — create → load → update → delete
  round-trips for each CRUD module, against `fake-indexeddb/auto` and the real
  `getDbConnection`, which is how every test that touches IndexedDB here
  already works.
- A migration-safety assertion in the same file: none of the new stores' names
  appears in a `.clear()` call anywhere in `idb/idb.ts`, guarding the "never
  wipe user data" invariant that IndexedDB itself will not guard.
- `idb/__tests__/shopParts.test.ts` — seeded lots across several sellers with
  varying price, quantity and condition: cheapest-eligible selection,
  `maxPrice` exclusion, condition filtering, quantity shortfall, and the
  per-seller fold.
- `view/appfr/__tests__/userRows.test.ts` — the rows each new type draws, and
  that the schema declares the four standing types with `create` and `delete`.

### Critical files
- `idb/idb.ts`, `idb/stores.ts`, `idb/indices.ts`
- `idb/category.ts` (the CRUD pattern to mirror)
- `view/appfr/catalogSchema.ts` (the new entities, and the hook-in column)
- `view/appfr/catalogRows.ts`, `view/appfr/catalogSource.ts` (where rows come from)
- `view/appfr/CellSetting.vue` (the writing-cell pattern to mirror)
- `view/components/ItemsShell.vue` (`@create`, `@delete`)
