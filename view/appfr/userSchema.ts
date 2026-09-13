/**
 * The types somebody writes themselves, as the shell draws every other type.
 *
 * Kept out of [catalogSchema] for its length rather than for any difference in
 * kind: these are `EntitySchema`s in the same list, drawn by the same shell,
 * narrowed by the same query language. What is different is only that three of
 * the shell's affordances go unused everywhere else and are the whole of the UI
 * here — `create`, which puts `+ New…` on the bar over a type's list and reports
 * the press; `delete`, which offers the ticks; and a `component` column, which
 * is how a cell comes to be a box somebody types in. See [userWrites] for the
 * other side of all three, and [CellSetting] for the cell this borrows from.
 *
 * The detail types — an inventory's parts, a list's wanted parts, and the two
 * the planner draws — are declared only while they are open, the way `inventory`
 * and `colorItems` are: they are a detail rather than a population, and a home
 * screen card reading "Wanted parts" beside the catalogue's own would be a card
 * for nothing.
 *
 * Categories of somebody's own are not a type here at all. A category is a
 * category whoever made it, so theirs are rows of the catalogue's `categories`
 * — see [categoryRows] — and that type is the one catalogue type that names
 * `create` and `delete`, in [catalogSchema]. What is here is the one column
 * an item of theirs files itself under, which offers both kinds at once.
 */
import type { ColumnDef, EntitySchema } from 'header-content-layout'
import type { ShellRow } from 'header-content-layout'
import { narrowBy, narrowTo } from './catalogSchema'
import { userPopulation } from './userCounts'
import { shopPartsOfInventory } from './userWrites'
import CellPrice from './CellPrice.vue'
import CellPostage from './CellPostage.vue'
import CellUserNumber from './CellUserNumber.vue'
import CellUserPick from './CellUserPick.vue'
import CellUserText from './CellUserText.vue'

/** The row's own key, which every one of these types carries in `id`. */
function idOf(row: ShellRow): string {
  return String(row.fields.id ?? '')
}

/**
 * A list of everything in one of somebody's own sets, and the plan for buying
 * it — the press that makes "buy the parts in this" one gesture.
 *
 * Made and then opened, rather than opened and then made, because the list is
 * what the plan is worked out from: there is nothing to show until it exists.
 * A set with nothing in it makes no list, and the press then does nothing
 * rather than opening an empty table.
 */
function shopInventory(row: ShellRow): void {
  const id = Number(idOf(row))
  if (!Number.isFinite(id)) {
    return
  }
  void shopPartsOfInventory(id).then((listId) => {
    if (listId) {
      narrowTo('shopPlan', 'shoplist', String(listId))
    }
  })
}

/** The `#` every table here opens with. */
const ordinal: ColumnDef = {
  key: 'ordinal',
  kind: 'ordinal',
  label: '#',
  width: '48px'
}

/**
 * When a record was made.
 *
 * Last on every one of these tables, and the only field on them nobody typed.
 * It is here because these are the records that cannot be fetched again — a
 * list of a dozen things somebody wrote over a year is a list they will want
 * in the order they wrote them.
 */
const created: ColumnDef = {
  key: 'created',
  label: 'Made',
  kind: 'date',
  width: '120px',
  sort: 'created',
  muted: true
}

export const userItemColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    kind: 'component',
    component: CellUserText,
    width: '300px',
    sort: 'name'
  },
  {
    // The same field an item of the catalogue's carries its category in, so
    // `category:` narrows this table and that one alike — and the picker
    // offers BrickLink's categories and theirs together, theirs first.
    key: 'category',
    role: 'reference',
    label: 'Category',
    hint: 'One of BrickLink’s categories or one of your own, or none',
    kind: 'component',
    component: CellUserPick,
    width: '220px',
    // Sorted by the name the picker shows, not by the number behind it.
    sort: 'categoryName'
  },
  {
    key: 'note',
    label: 'Note',
    kind: 'component',
    component: CellUserText,
    width: '340px',
    sort: 'note'
  },
  created
]

export const userInventoryColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    kind: 'component',
    component: CellUserText,
    width: '300px',
    sort: 'name'
  },
  {
    key: 'parts',
    role: 'metric',
    label: 'Parts',
    hint: 'How many different pieces are in it — press to see them',
    width: '90px',
    sort: 'parts',
    click: (row) => narrowTo('userInventoryLines', 'userinventory', idOf(row))
  },
  {
    key: 'pieces',
    role: 'metric',
    label: 'Pieces',
    hint: 'How many pieces in all, counting every one of each',
    width: '90px',
    sort: 'pieces'
  },
  {
    // The set this is about, where it is about one — the parts somebody means
    // to add to a set BrickLink lists. Under the name every other table holds a
    // record in, so the press leads where a record leads everywhere else.
    key: 'record',
    label: 'Set',
    hint: 'The BrickLink set this inventory is about, if it is about one',
    width: '140px',
    mono: true,
    sort: 'record',
    click: (row) => narrowTo('inventory', 'record', String(row.fields.record ?? ''))
  },
  {
    key: 'shop',
    label: 'Buy',
    hint: 'Make a shopping list of everything in this, and price it across the sellers brickzuke holds lots for',
    width: '110px',
    value: () => 'Shop parts',
    click: shopInventory
  },
  created
]

/**
 * One part of one such set.
 *
 * Four of the five columns are boxes to type in, this being the table an
 * inventory is actually written on. The part is named by BrickLink's own record
 * — `P-3001` — because that is what the planner matches a lot against: a line
 * naming a part by anything else is a line nothing can be bought for.
 */
export const userInventoryLineColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'name',
    role: 'identity',
    label: 'Part',
    kind: 'component',
    component: CellUserText,
    width: '300px',
    sort: 'name'
  },
  {
    key: 'record',
    label: 'Record',
    hint: 'BrickLink’s own id for the part — P-3001 — which is what a seller’s lots are matched against',
    kind: 'component',
    component: CellUserText,
    width: '150px',
    mono: true,
    sort: 'record'
  },
  {
    key: 'colorid',
    label: 'Color',
    hint: 'BrickLink’s own colour id, or blank to take the part in any colour',
    kind: 'component',
    component: CellUserText,
    width: '110px',
    sort: 'colorid'
  },
  {
    key: 'quantity',
    role: 'metric',
    label: 'Quantity',
    kind: 'component',
    component: CellUserNumber,
    width: '110px',
    sort: 'quantity'
  }
]

export const shopListColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    kind: 'component',
    component: CellUserText,
    width: '280px',
    sort: 'name'
  },
  {
    key: 'parts',
    role: 'metric',
    label: 'Parts',
    hint: 'How many different pieces are wanted — press to see them',
    width: '90px',
    sort: 'parts',
    click: (row) => narrowTo('shopListItems', 'shoplist', idOf(row))
  },
  {
    key: 'pieces',
    role: 'metric',
    label: 'Pieces',
    hint: 'How many pieces in all, counting every one of each',
    width: '90px',
    sort: 'pieces'
  },
  {
    key: 'shop',
    label: 'Buy',
    hint: 'The cheapest seller for each part on the list',
    width: '110px',
    value: () => 'Shop parts',
    click: (row) => narrowTo('shopPlan', 'shoplist', idOf(row))
  },
  {
    key: 'sellers',
    label: 'Sellers',
    hint: 'What the whole list would cost from each seller, one order at a time',
    width: '110px',
    value: () => 'Compare',
    click: (row) => narrowTo('shopStores', 'shoplist', idOf(row))
  },
  {
    key: 'record',
    label: 'From',
    hint: 'The BrickLink set the list was made from, if it was made from one',
    width: '140px',
    mono: true,
    sort: 'record',
    click: (row) => narrowTo('inventory', 'record', String(row.fields.record ?? ''))
  },
  created
]

/** One wanted part — the table a shopping list is written on. */
export const shopListItemColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'name',
    role: 'identity',
    label: 'Part',
    kind: 'component',
    component: CellUserText,
    width: '280px',
    sort: 'name'
  },
  {
    key: 'record',
    label: 'Record',
    hint: 'BrickLink’s own id for the part — P-3001 — which is what a seller’s lots are matched against',
    kind: 'component',
    component: CellUserText,
    width: '150px',
    mono: true,
    sort: 'record'
  },
  {
    key: 'colorid',
    label: 'Color',
    hint: 'BrickLink’s own colour id, or blank to take the part in any colour',
    kind: 'component',
    component: CellUserText,
    width: '110px',
    sort: 'colorid'
  },
  {
    key: 'quantity',
    role: 'metric',
    label: 'Quantity',
    hint: 'How many are wanted — the figure a seller has to be able to fill',
    kind: 'component',
    component: CellUserNumber,
    width: '110px',
    sort: 'quantity'
  },
  {
    key: 'maxPrice',
    label: 'Max price',
    hint: 'The most to pay for one of them. Lots dearer than this are left out of the plan; blank takes any price',
    kind: 'component',
    component: CellUserNumber,
    width: '120px',
    sort: 'maxPrice'
  },
  {
    key: 'condition',
    label: 'Condition',
    hint: 'New, Used, or either',
    kind: 'component',
    component: CellUserPick,
    width: '120px',
    sort: 'condition'
  }
]

/**
 * The plan: the cheapest seller for each wanted part, on its own.
 *
 * On its own is the caveat the table has to carry, and `Short` is where it
 * carries it — see the note at the top of shopParts.ts. Buying every line
 * wherever it is cheapest is as many orders as there are sellers, so the
 * `shopStores` table beside this one answers the other question, and the two
 * are drawn from the same walk.
 */
export const shopPlanColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'name',
    role: 'identity',
    label: 'Part',
    width: '260px',
    sort: 'name'
  },
  {
    key: 'record',
    label: 'Record',
    width: '130px',
    mono: true,
    sort: 'record',
    // Where a part's own lots are listed, which is the table this row is a
    // summary of one line of.
    click: (row) => narrowTo('inventories', 'record', String(row.fields.record ?? ''))
  },
  {
    key: 'wanted',
    role: 'metric',
    label: 'Want',
    width: '80px',
    sort: 'wanted'
  },
  {
    key: 'storeName',
    role: 'reference',
    label: 'Seller',
    hint: 'The cheapest seller who has enough of this one part',
    width: '200px',
    sort: 'storeName',
    click: (row) => narrowBy('store', String(row.fields.store ?? ''))
  },
  {
    key: 'countryName',
    label: 'Country',
    width: '140px',
    sort: 'countryName',
    click: (row) => narrowBy('country', String(row.fields.country ?? ''))
  },
  /*
   * Both money columns are [CellPrice] rather than the shell's `number` kind,
   * which rounds to whole units: a brick at 0.12 and a brick at 0.40 both drew
   * as `0`, and a five-pound order as `1`. That cell states as many places as
   * the figure needs — most of a bulk seller's inventory is worth a fraction of
   * a cent — and it is the cell the lots table already prices in, so a price
   * reads the same wherever it is shown.
   */
  {
    key: 'priceValue',
    role: 'metric',
    label: 'Each',
    hint: 'What one piece costs at that seller, converted',
    kind: 'component',
    component: CellPrice,
    width: '100px',
    sort: 'priceValue'
  },
  {
    key: 'cost',
    role: 'metric',
    label: 'Cost',
    hint: 'What this line comes to — the price times however many can be had',
    kind: 'component',
    component: CellPrice,
    width: '100px',
    sort: 'cost'
  },
  {
    key: 'shortfall',
    label: 'Short',
    hint: 'Why this line is not answered in full, where it is not — and blank where it is',
    width: '170px',
    sort: 'short'
  },
  {
    key: 'offers',
    label: 'Lots',
    hint: 'How many lots brickzuke holds for this part at all, before your price limit is applied',
    width: '80px',
    sort: 'offers',
    muted: true
  }
]

/**
 * What the whole list would cost from one seller — the comparison across
 * sellers that `TODO.md` asks for, and the table a reader actually orders from.
 *
 * `Parts` first and cost second is the order this is read in: the seller worth
 * looking at is the one who can fill the most of the list, not the one with the
 * cheapest single brick. Postage is a seller's own flat figure and is not added
 * in — brickzuke holds what a shop charges, not what this order would be quoted.
 */
export const shopStoreColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'storeName',
    role: 'identity',
    label: 'Seller',
    width: '240px',
    sort: 'storeName',
    click: (row) => narrowBy('store', String(row.fields.store ?? ''))
  },
  {
    key: 'countryName',
    role: 'reference',
    label: 'Country',
    width: '150px',
    sort: 'countryName',
    click: (row) => narrowBy('country', String(row.fields.country ?? ''))
  },
  {
    key: 'lines',
    role: 'metric',
    label: 'Parts',
    hint: 'How many of the list’s parts this seller has anything of',
    width: '90px',
    sort: 'lines'
  },
  {
    key: 'quantity',
    role: 'metric',
    label: 'Pieces',
    hint: 'How many pieces they could supply, across those parts',
    width: '90px',
    sort: 'quantity'
  },
  {
    key: 'cost',
    role: 'metric',
    label: 'Cost',
    hint: 'What those pieces cost here, postage aside',
    kind: 'component',
    component: CellPrice,
    width: '110px',
    sort: 'cost'
  },
  /*
   * Beside the total rather than added into it: the figure is the lightest
   * band of what the seller wrote, in the seller's own currency, and the
   * total is converted — see [shopPostage] for what it is and is not.
   */
  {
    key: 'postage',
    label: 'Postage',
    hint:
      'What the seller says they charge to post to the “Ship to” country, from their lightest band, in their own currency — read off their terms, so blank until their shipping has been looked at',
    kind: 'component',
    component: CellPostage,
    width: '120px',
    sort: 'postage'
  },
  {
    key: 'short',
    label: 'Short',
    hint: 'How many of the list’s parts they cannot fill in full',
    width: '90px',
    sort: 'short',
    muted: true
  }
]

/**
 * The three types that stand whether or not anything is open.
 *
 * Each names `create` and `delete`, which is the whole of how one is made and
 * unmade: the shell draws `+ New…` and the ticks, and reports both.
 */
export const userEntities: EntitySchema[] = [
  {
    key: 'userItems',
    label: 'My items',
    scope: 'useritem',
    count: '',
    create: 'New item',
    delete: 'Delete',
    facets: [],
    tabs: [],
    samples: [],
    columns: userItemColumns,
    sorts: [
      {
        key: 'name',
        label: 'Name'
      },
      {
        key: 'categoryName',
        label: 'Category'
      },
      {
        key: 'note',
        label: 'Note'
      },
      {
        key: 'created',
        label: 'Made'
      }
    ]
  },
  {
    key: 'userInventories',
    label: 'My inventories',
    // The field a line carries the inventory it belongs to in.
    scope: 'userinventory',
    count: '',
    create: 'New inventory',
    delete: 'Delete',
    facets: [],
    tabs: [],
    samples: [],
    columns: userInventoryColumns,
    sorts: [
      {
        key: 'name',
        label: 'Name'
      },
      {
        key: 'parts',
        label: 'Parts'
      },
      {
        key: 'pieces',
        label: 'Pieces'
      },
      {
        key: 'record',
        label: 'Set'
      },
      {
        key: 'created',
        label: 'Made'
      }
    ]
  },
  {
    key: 'shopLists',
    label: 'Shopping lists',
    scope: 'shoplist',
    count: '',
    create: 'New shopping list',
    delete: 'Delete',
    facets: [],
    tabs: [],
    samples: [],
    columns: shopListColumns,
    sorts: [
      {
        key: 'name',
        label: 'Name'
      },
      {
        key: 'parts',
        label: 'Parts'
      },
      {
        key: 'pieces',
        label: 'Pieces'
      },
      {
        key: 'record',
        label: 'From'
      },
      {
        key: 'created',
        label: 'Made'
      }
    ]
  }
]

/** The same three, with the populations the cards are headed by. */
export function standingUserEntities(): EntitySchema[] {
  return userEntities.map((entity) => ({
    ...entity,
    count: userPopulation(entity.key)
  }))
}

/** An inventory's parts, declared only while one is open. */
export const userInventoryLinesEntity: EntitySchema = {
  key: 'userInventoryLines',
  label: 'Inventory parts',
  // Counted by what comes back: this is one inventory's parts, not a population.
  count: '',
  create: 'Add part',
  delete: 'Delete',
  facets: [
    {
      kind: 'range',
      key: 'quantity',
      label: 'Quantity',
      min: 0,
      max: 1_000
    }
  ],
  tabs: [],
  samples: [],
  columns: userInventoryLineColumns,
  sorts: [
    {
      key: 'name',
      label: 'Part'
    },
    {
      key: 'record',
      label: 'Record'
    },
    {
      key: 'colorid',
      label: 'Color'
    },
    {
      key: 'quantity',
      label: 'Quantity'
    }
  ]
}

/** A list's wanted parts, likewise. */
export const shopListItemsEntity: EntitySchema = {
  key: 'shopListItems',
  label: 'Wanted parts',
  count: '',
  create: 'Add part',
  delete: 'Delete',
  facets: [
    {
      kind: 'range',
      key: 'quantity',
      label: 'Quantity',
      min: 0,
      max: 1_000
    }
  ],
  tabs: [],
  samples: [],
  columns: shopListItemColumns,
  sorts: [
    {
      key: 'name',
      label: 'Part'
    },
    {
      key: 'record',
      label: 'Record'
    },
    {
      key: 'colorid',
      label: 'Color'
    },
    {
      key: 'quantity',
      label: 'Quantity'
    },
    {
      key: 'maxPrice',
      label: 'Max price'
    },
    {
      key: 'condition',
      label: 'Condition'
    }
  ]
}

/**
 * The plan, and the sellers — neither of them a stored type at all.
 *
 * Both are worked out when they are asked for, from the list and the lots
 * brickzuke holds, and neither is written anywhere: a price is true only while
 * the lot is there. Declared while a list is being shopped and not otherwise,
 * for the reason every detail type here is.
 */
export const shopPlanEntity: EntitySchema = {
  key: 'shopPlan',
  label: 'Shop parts',
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: shopPlanColumns,
  sorts: [
    {
      key: 'name',
      label: 'Part'
    },
    {
      key: 'record',
      label: 'Record'
    },
    {
      key: 'wanted',
      label: 'Want'
    },
    {
      key: 'cost',
      label: 'Cost'
    },
    {
      key: 'priceValue',
      label: 'Each'
    },
    {
      key: 'storeName',
      label: 'Seller'
    },
    {
      key: 'countryName',
      label: 'Country'
    },
    {
      key: 'short',
      label: 'Short'
    },
    {
      key: 'offers',
      label: 'Lots'
    }
  ]
}

export const shopStoresEntity: EntitySchema = {
  key: 'shopStores',
  label: 'Shop sellers',
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: shopStoreColumns,
  sorts: [
    {
      key: 'lines',
      label: 'Parts'
    },
    {
      key: 'cost',
      label: 'Cost'
    },
    {
      key: 'postage',
      label: 'Postage'
    },
    {
      key: 'quantity',
      label: 'Pieces'
    },
    {
      key: 'short',
      label: 'Short'
    },
    {
      key: 'storeName',
      label: 'Seller'
    },
    {
      key: 'countryName',
      label: 'Country'
    }
  ]
}
