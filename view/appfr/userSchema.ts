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
 * Categories, items and sets of somebody's own are not types here at all. A
 * category is a category, an item an item and a set a set whoever made it, so
 * theirs are rows of the catalogue's own `categories`, `items` and `inventory`
 * — see [categoryRows], [userItemRows] and [userInventoryLineRows] — and
 * those three are the catalogue types that name `create` and `delete`, in
 * [catalogSchema]. What is left here are the two types that are theirs alone: a
 * shopping list, and a cart, which the catalogue has no counterpart to.
 */
import type { ColumnDef, EntitySchema } from 'header-content-layout'
import type { ShellRow } from 'header-content-layout'
import { narrowBy, narrowTo } from './catalogSchema'
import { userPopulation } from './userCounts'
import { setSetting } from './settings'
import CellPrice from './CellPrice.vue'
import CellPostage from './CellPostage.vue'
import CellUserNumber from './CellUserNumber.vue'
import CellUserPick from './CellUserPick.vue'
import CellUserText from './CellUserText.vue'

/** The row's own key, which every one of these types carries in `id`. */
function idOf(row: ShellRow): string {
  return String(row.fields.id ?? '')
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
    hint: 'The part’s record — BrickLink’s, P-3001, which is what a seller’s lots are matched against, or one of your own, U-5, which no seller has',
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
 * The carts: what each holds, what it comes to, and which one the boxes on the
 * lots table write into.
 *
 * `Use` is the same fact the settings table states, offered where the carts
 * are: a press makes that cart the active one, and the row that already is
 * says so. Both read `active`, which [cartRows] writes off the setting.
 */
export const cartColumns: ColumnDef[] = [
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
    key: 'use',
    label: 'Use',
    hint: 'Which cart the quantity box on every lot writes into — press to make it this one',
    // Room for `Make active` whole, which the shorter width cut.
    width: '130px',
    value: (row) => (row.fields.active ? 'Active' : 'Make active'),
    click: (row) => setSetting('activeCart', idOf(row))
  },
  {
    key: 'lots',
    role: 'metric',
    label: 'Lots',
    hint: 'How many different lots are in it — press to see them',
    width: '90px',
    sort: 'lots',
    click: (row) => narrowTo('cartLines', 'cart', idOf(row))
  },
  {
    key: 'pieces',
    role: 'metric',
    label: 'Pieces',
    hint: 'How many pieces in all, counting every one of each lot',
    width: '90px',
    sort: 'pieces'
  },
  {
    key: 'sellers',
    role: 'metric',
    label: 'Sellers',
    hint: 'How many sellers the lots come from, which is how many orders the cart is',
    width: '90px',
    sort: 'sellers'
  },
  {
    key: 'cost',
    role: 'metric',
    label: 'Cost',
    hint: 'What the lots come to at the prices they were put in at, converted, postage aside',
    kind: 'component',
    component: CellPrice,
    width: '110px',
    sort: 'cost'
  },
  created
]

/**
 * The lots in one cart — the table a cart is read from.
 *
 * The lots table's own names for the same facts, so a reader moving between
 * the two meets one vocabulary; and one box, the quantity, which is the one
 * thing about a lot that is theirs to change. The rest is what the lot said
 * of itself when it went in, and leads back to the lot's own tables.
 */
export const cartLineColumns: ColumnDef[] = [
  ordinal,
  {
    key: 'item',
    role: 'identity',
    label: 'Item',
    width: '280px',
    sort: 'itemName',
    value: (row) => row.fields.itemName,
    // The lots on offer for this item, which is where the line came from.
    click: (row) => narrowTo('inventories', 'record', String(row.fields.record ?? ''))
  },
  {
    key: 'record',
    label: 'Record',
    width: '120px',
    mono: true,
    sort: 'record'
  },
  {
    key: 'color',
    label: 'Color',
    width: '110px',
    sort: 'colorName',
    value: (row) => row.fields.colorName
  },
  {
    key: 'storeName',
    role: 'reference',
    label: 'Store',
    hint: 'Who is selling it — press for the seller',
    width: '200px',
    sort: 'storeName',
    click: (row) => narrowTo('stores', 'store', String(row.fields.store ?? ''))
  },
  {
    key: 'conditionName',
    label: 'Condition',
    width: '110px',
    sort: 'conditionName'
  },
  {
    key: 'priceValue',
    role: 'metric',
    label: 'Each',
    hint: 'What one cost, converted, when it was put in the cart',
    kind: 'component',
    component: CellPrice,
    width: '100px',
    sort: 'priceValue'
  },
  {
    key: 'quantity',
    role: 'metric',
    label: 'Quantity',
    hint: 'How many of the lot to order — the same figure as the box on the lot',
    kind: 'component',
    component: CellUserNumber,
    width: '110px',
    sort: 'quantity'
  },
  {
    key: 'available',
    label: 'Of',
    hint: 'How many the seller had when it was put in',
    width: '80px',
    sort: 'available',
    muted: true
  },
  {
    key: 'cost',
    role: 'metric',
    label: 'Cost',
    hint: 'What this line comes to — the price times the quantity',
    kind: 'component',
    component: CellPrice,
    width: '100px',
    sort: 'cost'
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
 * The two types that stand whether or not anything is open, and are theirs
 * alone: the catalogue has no shopping list and no cart to file one under.
 *
 * Each names `create` and `delete`, which is the whole of how one is made and
 * unmade: the shell draws `+ New…` and the ticks, and reports both.
 */
export const userEntities: EntitySchema[] = [
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
  },
  {
    key: 'carts',
    label: 'Carts',
    scope: 'cart',
    count: '',
    create: 'New cart',
    delete: 'Delete',
    facets: [],
    tabs: [],
    samples: [],
    columns: cartColumns,
    sorts: [
      {
        key: 'name',
        label: 'Name'
      },
      {
        key: 'lots',
        label: 'Lots'
      },
      {
        key: 'pieces',
        label: 'Pieces'
      },
      {
        key: 'sellers',
        label: 'Sellers'
      },
      {
        key: 'cost',
        label: 'Cost'
      },
      {
        key: 'created',
        label: 'Made'
      }
    ]
  }
]

/** The same, with the population the card is headed by. */
export function standingUserEntities(): EntitySchema[] {
  return userEntities.map((entity) => ({
    ...entity,
    count: userPopulation(entity.key)
  }))
}

/** A list's wanted parts, declared only while one is open. */
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

/**
 * The lots in one cart, declared only while one is open.
 *
 * No `create`: a line is a lot, and a lot is put in from the lots table, where
 * the box beside it knows which lot it is. `delete` takes one out, which the
 * box does too at nought — two ways to the one write, the ticks being how a
 * dozen go at once.
 */
export const cartLinesEntity: EntitySchema = {
  key: 'cartLines',
  label: 'Cart lines',
  count: '',
  delete: 'Remove',
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
  columns: cartLineColumns,
  sorts: [
    {
      key: 'itemName',
      label: 'Item'
    },
    {
      key: 'record',
      label: 'Record'
    },
    {
      key: 'colorName',
      label: 'Color'
    },
    {
      key: 'storeName',
      label: 'Store'
    },
    {
      key: 'conditionName',
      label: 'Condition'
    },
    {
      key: 'priceValue',
      label: 'Each'
    },
    {
      key: 'quantity',
      label: 'Quantity'
    },
    {
      key: 'available',
      label: 'Of'
    },
    {
      key: 'cost',
      label: 'Cost'
    }
  ]
}
