/**
 * brickzuke's catalogue, as a header-content-layout schema.
 *
 * Every type its home screen counts, with the columns each table draws today
 * expressed as ColumnDefs. The mapping is field-for-field — `id`→`key`,
 * `type`→`kind`, `itemValue`→`value`/`format`, `clickValue`→`click` — so this
 * file is the whole of what moving these tables costs.
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { PARAM_ENTITY, PARAM_EXPR, PARAM_PAGE, PARAM_SORT, addTerm } from 'header-content-layout'
import type { ColumnDef, DomainSchema, EntitySchema, ShellRow } from 'header-content-layout'
import router from '@/router'
import { formatInteger } from '@/assets/js/utils'
import { itemTypes, processingCounts, selectedCounts } from '../../model'
import { browsedCounts } from './catalogCounts'
import CellCount from './CellCount.vue'
import CellImage from './CellImage.vue'

/** Verbatim from the `weight` column in model.ts. */
const weightBreakpoints = [
  {
    start: 0,
    end: 100,
    suffix: 'cg'
  },
  {
    start: 100,
    end: 10000,
    modifier: 0.01,
    decimalPlaces: 1,
    suffix: 'g'
  },
  {
    start: 10000,
    end: 100000,
    modifier: 0.01,
    decimalPlaces: 0,
    suffix: 'g'
  },
  {
    start: 100000,
    modifier: 0.00001,
    decimalPlaces: 1,
    suffix: 'kg'
  }
]

/**
 * What `clickValue` + `clickSelection` did in TableCell, in the shell's terms.
 *
 * The shell's query *is* the URL, so a host narrows by navigating: the term
 * goes into `q` alongside whatever is already there, and the page resets
 * because a different result set makes a position in the old one meaningless.
 * `addTerm` handles the quoting and refuses to add a term twice.
 */
function narrowBy(field: string, value: string) {
  if (!value) {
    return
  }
  const params = new URLSearchParams(window.location.search)
  params.set(PARAM_EXPR, addTerm(params.get(PARAM_EXPR) ?? '', `${field}:"${value}"`))
  params.delete(PARAM_PAGE)
  router.push('/?' + params.toString())
}

/**
 * The same press, when what it leads to is a different type: "show me the
 * items in this category".
 *
 * It states the term rather than adding to what is there, because an
 * expression written against one type's fields means nothing against
 * another's. The sort goes for the same reason — the type on the far side
 * declares its own, and the shell falls back to it when the URL names none.
 */
function narrowTo(entity: string, field: string, value: string) {
  if (!value) {
    return
  }
  const params = new URLSearchParams(window.location.search)
  params.set(PARAM_ENTITY, entity)
  params.set(PARAM_EXPR, `${field}:"${value}"`)
  params.delete(PARAM_SORT)
  params.delete(PARAM_PAGE)
  router.push('/?' + params.toString())
}

/**
 * The catalogue item behind one part of a set.
 *
 * An inventory row carries BrickLink's own numbering — `P` and `3001` — and
 * never brickzuke's item id, so the way back into the items table is the
 * record id an item states after its name: `Brick 2 x 4 (P-3001)`. The
 * parentheses are load-bearing, `:` being a substring match: `(P-3001)` finds
 * that part and not the `P-3001-2` printed beside it.
 */
function narrowToItem(row: ShellRow) {
  const type = String(row.fields.type ?? '')
  const number = String(row.fields.itemId ?? '')
  if (!type || !number) {
    return
  }
  narrowTo('items', 'name', `(${type}-${number})`)
}

/**
 * "Show me those 82."
 *
 * Two terms rather than one, because a colour is not a question on its own:
 * the colour guide counts the parts made in a colour separately from the sets
 * containing it, and BrickLink answers them on two different pages. `type`
 * says which.
 *
 * `colorId` and not `id`: the page being asked for is BrickLink's, so the id
 * has to be BrickLink's too. brickzuke's own key for Aqua is 2, and
 * BrickLink's colour 2 is Tan.
 */
function narrowToColor(catType: string, row: ShellRow) {
  const colorId = String(row.fields.colorid ?? '')
  if (!colorId) {
    return
  }
  const params = new URLSearchParams(window.location.search)
  params.set(PARAM_ENTITY, 'colorItems')
  params.set(PARAM_EXPR, `colorid:"${colorId}" type:"${catType}"`)
  params.delete(PARAM_SORT)
  params.delete(PARAM_PAGE)
  router.push('/?' + params.toString())
}

export const itemColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  // No label: a column of pictures says what it is. Drawn by a component
  // rather than by the `image` kind, because the picture is a button here and
  // the kind presses the `<img>` itself.
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    width: '180px',
    height: '100px',
    // Pressing the picture opens the item, which is what the original image
    // cell does — `clickSelection: 'images'`, a switch to that item's own
    // table rather than a filter on this one. The name still narrows, as the
    // original's `clickKey: 'item'` does.
    click: (row) => narrowTo('itemRecords', 'item', row.id)
  },
  {
    key: 'type',
    label: 'Type',
    width: '60px',
    sort: 'type',
    click: (row) => narrowBy('type', String(row.fields.typeId ?? ''))
  },
  // Pressing a name narrows to that one item, which is what the `item` filter
  // did — and not `activate`, because activating is what a row press reports
  // and rows here are not pressable.
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '300px',
    sort: 'name',
    click: (row) => narrowBy('id', String(row.fields.id ?? ''))
  },
  {
    key: 'category',
    role: 'reference',
    label: 'Category',
    width: '200px',
    sort: 'categoryName',
    // `category` holds the id so a term can address it; the cell shows the name.
    value: (row) => row.fields.categoryName,
    click: (row) => narrowBy('category', String(row.fields.category ?? ''))
  },
  {
    key: 'year',
    label: 'Year',
    width: '70px',
    sort: 'year',
    click: (row) => narrowBy('year', String(row.fields.year ?? ''))
  },
  {
    key: 'weight',
    label: 'Weight',
    width: '75px',
    sort: 'weight',
    // Held in grams, read in whatever unit the number is actually in.
    value: (row) => Number(row.fields.weight) * 100,
    // `formatInteger` hands NaN straight back for an item that carries no
    // weight, so a missing weight would read `NaN`. It gets the same mark for
    // an absent value the shell puts in every other column.
    format: (value) =>
      Number.isFinite(Number(value))
        ? String(formatInteger(Number(value), weightBreakpoints) ?? '—')
        : '—'
  },
  {
    key: 'dimensions',
    label: 'Dimensions',
    width: '115px',
    sort: 'dimensions',
    // Every other part the same shape — pressing `2 x 4` is the one question a
    // dimension answers.
    click: (row) => narrowBy('dimensions', String(row.fields.dimensions ?? ''))
  }
]

/**
 * One opened item: the BrickLink records the items table collapses into a
 * line, drawn with the same seven columns so opening one changes what is
 * listed and nothing about how it looks.
 *
 * Every press here leads back out to the items table, because a record is the
 * end of the road — there is nothing below it to open.
 */
export const itemRecordColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    width: '180px',
    height: '100px',
    // Where the name leads, because a picture of a set is the most obvious
    // thing on the row to press for what is in it.
    click: (row) => narrowTo('inventory', 'record', String(row.fields.id ?? ''))
  },
  {
    key: 'type',
    label: 'Type',
    width: '60px',
    sort: 'type',
    click: (row) => narrowTo('items', 'type', String(row.fields.typeId ?? ''))
  },
  // Pressing a record's name opens what it is made of.
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '300px',
    sort: 'name',
    click: (row) => narrowTo('inventory', 'record', String(row.fields.id ?? ''))
  },
  {
    key: 'category',
    role: 'reference',
    label: 'Category',
    width: '200px',
    // By the name the cell shows, not by the id behind it.
    sort: 'categoryName',
    value: (row) => row.fields.categoryName,
    click: (row) => narrowTo('items', 'category', String(row.fields.category ?? ''))
  },
  {
    key: 'year',
    label: 'Year',
    width: '70px',
    sort: 'year',
    click: (row) => narrowTo('items', 'year', String(row.fields.year ?? ''))
  },
  {
    key: 'weight',
    label: 'Weight',
    width: '75px',
    sort: 'weight',
    value: (row) => Number.parseFloat(String(row.fields.weight)) * 100,
    format: (value) =>
      Number.isFinite(Number(value))
        ? String(formatInteger(Number(value), weightBreakpoints) ?? '—')
        : '—'
  },
  {
    key: 'dimensions',
    label: 'Dimensions',
    width: '115px',
    sort: 'dimensions',
    click: (row) => narrowTo('items', 'dimensions', String(row.fields.dimensions ?? ''))
  }
]

/**
 * What a set is made of — the original's `itemInventories` columns in its own
 * order: the variant picture, its type, the item, its category, its colour and
 * how many of them.
 *
 * Type and category both lead back to the items table. A variant's `catString`
 * is the same id an item carries in `category` — checked against a real
 * inventory: the parts of 10511-1 sit in `417`, and `category:"417"` is 92
 * items, every one of them a DUPLO brick.
 *
 * Colour leads nowhere, and cannot: an item row carries no colour at all, which
 * is the same reason the colours table narrows nothing.
 */
export const inventoryColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    label: 'Variant',
    width: '100px',
    height: '60px',
    click: narrowToItem
  },
  {
    key: 'type',
    label: 'Type',
    width: '60px',
    sort: 'type',
    click: (row) => narrowTo('items', 'type', String(row.fields.type ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Item',
    width: '300px',
    sort: 'name',
    // Out to the catalogue entry for this part, which is the same press the
    // picture beside it makes.
    click: narrowToItem
  },
  {
    key: 'categoryName',
    role: 'reference',
    label: 'Category',
    width: '160px',
    sort: 'categoryName',
    click: (row) => narrowTo('items', 'category', String(row.fields.category ?? ''))
  },
  {
    key: 'color',
    label: 'Color',
    width: '90px',
    sort: 'color',
    // The one place in the catalogue a colour is a thing rows carry, so it is
    // the one place a colour narrows: pressing it leaves the parts of this set
    // in that colour. `record:` stays, being the address of the table rather
    // than a filter over it.
    click: (row) => narrowBy('colorid', String(row.fields.colorid ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quantity',
    width: '90px',
    sort: 'quantity',
    format: counted
  }
]

/** A count, or an empty cell when the catalogue never stored the number. */
function counted(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  return String(formatInteger(Number(value)) ?? '')
}

/**
 * What comes in one colour: the parts made in it, or the sets containing it.
 *
 * Three columns and no more, because three is what the list page states — a
 * picture, a catalogue number and a name. Category, year and weight are on the
 * item rather than on the colour's listing of it, and a column that is always
 * blank is not a wired-up column.
 *
 * Both presses lead back into the items table, this being the end of the road:
 * a colour's listing says which items, and the items table is where an item
 * is.
 */
export const colorItemColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    width: '120px',
    height: '70px',
    click: narrowToItem
  },
  {
    key: 'number',
    label: 'No.',
    width: '110px',
    mono: true,
    sort: 'number'
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '300px',
    sort: 'name',
    click: narrowToItem
  }
]

/**
 * Categories, as the original draws them: type, how many items are in it, and
 * the name with its id after it. Both the count and the name lead to those
 * items, which is what `clickCategoryItemsFn` does.
 */
export const categoryColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'type',
    label: 'Type',
    width: '60px',
    sort: 'type',
    click: (row) => narrowTo('items', 'type', String(row.fields.typeId ?? ''))
  },
  {
    key: 'items',
    label: 'Items',
    kind: 'component',
    component: CellCount,
    width: '80px',
    sort: 'items',
    format: counted,
    click: (row) => narrowTo('items', 'category', String(row.fields.category ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '300px',
    sort: 'name',
    click: (row) => narrowTo('items', 'category', String(row.fields.category ?? ''))
  }
]

/**
 * Colours.
 *
 * The name narrows this list to the one colour, as an item's name narrows the
 * items table to the one item.
 *
 * `Parts` and `Sets` lead to the items behind the number — not through the
 * items table, which carries no colour and would answer `82` with the whole
 * catalogue, but through the `catalogList.asp` page BrickLink's own colour
 * guide links each count at. The count and the rows therefore come from the
 * same page, and cannot disagree.
 *
 * `Wanted` and `For sale` do not, and should not: they count other people's
 * lots rather than catalogue items, and lead somewhere else entirely.
 */
export const colorColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    width: '100px',
    height: '40px'
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '200px',
    sort: 'name',
    click: (row) => narrowBy('id', String(row.fields.id ?? ''))
  },
  {
    // `Parts` rather than `Items`, because that is the number: the colour
    // guide's own count of the distinct part designs catalogued in this
    // colour. The key stays `items`, being the field the row carries and the
    // sort the entity declares.
    key: 'items',
    label: 'Parts',
    kind: 'component',
    component: CellCount,
    width: '90px',
    sort: 'items',
    format: counted,
    click: (row) => narrowToColor('P', row)
  },
  {
    key: 'sets',
    label: 'Sets',
    kind: 'component',
    component: CellCount,
    width: '90px',
    sort: 'sets',
    format: counted,
    click: (row) => narrowToColor('S', row)
  },
  {
    key: 'wanted',
    label: 'Wanted',
    width: '90px',
    sort: 'wanted',
    format: counted
  },
  {
    key: 'forSale',
    label: 'For sale',
    width: '90px',
    sort: 'forSale',
    format: counted
  },
  {
    key: 'yearFrom',
    label: 'Year from',
    width: '90px',
    sort: 'yearFrom'
  },
  {
    key: 'yearTo',
    label: 'Year to',
    width: '90px',
    sort: 'yearTo'
  }
]

/**
 * Item types. `code` is the one-letter type an item carries, so the name and
 * the item count both lead to those items, and the category count to the
 * categories of that type.
 */
export const itemTypeColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '160px',
    sort: 'name',
    click: (row) => narrowTo('items', 'type', String(row.fields.type ?? ''))
  },
  {
    key: 'items',
    label: 'Items',
    kind: 'component',
    component: CellCount,
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => narrowTo('items', 'type', String(row.fields.type ?? ''))
  },
  {
    key: 'categories',
    label: 'Categories',
    kind: 'component',
    component: CellCount,
    width: '110px',
    sort: 'categories',
    format: counted,
    click: (row) => narrowTo('categories', 'type', String(row.fields.type ?? ''))
  }
]

/**
 * Every part of every set anyone has opened.
 *
 * The `inventory` columns with one more: the set the part is in. That column
 * is not in the original and has to be here — one set's inventory is headed by
 * the set, and this table is all of them at once, so without it two identical
 * bricks from two different sets are two rows with nothing to tell them apart.
 */
export const itemInventoryColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    label: 'Variant',
    width: '100px',
    height: '60px',
    click: narrowToItem
  },
  {
    key: 'type',
    label: 'Type',
    width: '60px',
    sort: 'type',
    click: (row) => narrowTo('items', 'type', String(row.fields.type ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Item',
    width: '280px',
    sort: 'name',
    click: narrowToItem
  },
  {
    key: 'record',
    role: 'reference',
    label: 'Set',
    width: '110px',
    mono: true,
    sort: 'record',
    // Into the one set, which is the same table narrowed to a single record.
    click: (row) => narrowTo('inventory', 'record', String(row.fields.record ?? ''))
  },
  {
    key: 'categoryName',
    role: 'reference',
    label: 'Category',
    width: '160px',
    sort: 'categoryName',
    click: (row) => narrowTo('items', 'category', String(row.fields.category ?? ''))
  },
  {
    key: 'color',
    label: 'Color',
    width: '90px',
    sort: 'color',
    click: (row) => narrowBy('colorid', String(row.fields.colorid ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quantity',
    width: '90px',
    sort: 'quantity',
    format: counted
  }
]

/**
 * An item in one colour — the same records as above with the quantities
 * dropped and the duplicates folded together.
 *
 * `sets` is the fold: how many of the sets read so far this variant turns up
 * in. It is what the table is for, a variant otherwise being an inventory row
 * with a column taken away, and pressing it leads to those rows.
 */
export const itemVariantColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    label: 'Variant',
    width: '100px',
    height: '60px',
    click: narrowToItem
  },
  {
    key: 'type',
    label: 'Type',
    width: '60px',
    sort: 'type',
    click: (row) => narrowTo('items', 'type', String(row.fields.type ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Item',
    width: '300px',
    sort: 'name',
    click: narrowToItem
  },
  {
    key: 'categoryName',
    role: 'reference',
    label: 'Category',
    width: '160px',
    sort: 'categoryName',
    click: (row) => narrowTo('items', 'category', String(row.fields.category ?? ''))
  },
  {
    key: 'color',
    label: 'Color',
    width: '90px',
    sort: 'color',
    click: (row) => narrowBy('colorid', String(row.fields.colorid ?? ''))
  },
  {
    key: 'sets',
    label: 'Sets',
    width: '70px',
    sort: 'sets',
    format: counted,
    click: (row) => narrowTo('itemInventories', 'variant', String(row.fields.variant ?? ''))
  }
]

/**
 * What sellers have on offer — the original's `inventories` columns in its own
 * order: the lot's picture, its price, the seller's description of it, where
 * the seller is, who they are, the condition, how many and their feedback.
 *
 * Country and store both lead to their own tables, which is what the original
 * does with country and what it never got round to doing with the store.
 */
export const storeInventoryColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    width: '70px',
    height: '50px',
    click: narrowToItem
  },
  {
    key: 'price',
    label: 'Price',
    width: '100px',
    // Sorted by the number behind the string — see `toPrice`. The cell still
    // shows what BrickLink printed, currency and all.
    sort: 'priceValue'
  },
  {
    key: 'description',
    role: 'identity',
    label: 'Description',
    width: '300px',
    sort: 'description'
  },
  {
    key: 'countryName',
    role: 'reference',
    label: 'Country',
    width: '110px',
    sort: 'countryName',
    click: (row) => narrowBy('country', String(row.fields.country ?? ''))
  },
  {
    key: 'storeName',
    role: 'reference',
    label: 'Store',
    width: '200px',
    sort: 'storeName',
    click: (row) => narrowTo('stores', 'store', String(row.fields.store ?? ''))
  },
  {
    key: 'conditionName',
    label: 'Condition',
    width: '100px',
    sort: 'conditionName',
    click: (row) => narrowBy('condition', String(row.fields.condition ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quant.',
    width: '80px',
    sort: 'quantity',
    format: counted
  },
  {
    key: 'feedback',
    label: 'Feedback',
    width: '100px',
    sort: 'feedback',
    format: counted
  }
]

/**
 * New and Used, and how much of each is on offer.
 *
 * The counts are over the lots loaded rather than over BrickLink, so they are
 * blank until an item has been opened — which is the honest state of a number
 * nobody has fetched, and the reason `counted` draws nothing for it.
 */
export const conditionColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Condition',
    width: '120px',
    sort: 'name',
    click: (row) => narrowTo('inventories', 'condition', String(row.fields.condition ?? ''))
  },
  {
    key: 'lots',
    label: 'Lots',
    width: '90px',
    sort: 'lots',
    format: counted,
    click: (row) => narrowTo('inventories', 'condition', String(row.fields.condition ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quantity',
    width: '100px',
    sort: 'quantity',
    format: counted
  }
]

/**
 * The years the catalogue covers, and how many items came out in each.
 *
 * Both cells lead to those items, which is what every count in this schema
 * does — see the categories table, where the same press is the whole point of
 * the column.
 */
export const yearColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Year',
    width: '90px',
    sort: 'year',
    click: (row) => narrowTo('items', 'year', String(row.fields.name ?? ''))
  },
  {
    key: 'items',
    label: 'Items',
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => narrowTo('items', 'year', String(row.fields.name ?? ''))
  }
]

/** The parts of the world BrickLink groups its sellers by. */
export const regionColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '200px',
    sort: 'name',
    click: (row) => narrowTo('countries', 'region', String(row.fields.region ?? ''))
  },
  {
    key: 'countries',
    label: 'Countries',
    width: '100px',
    sort: 'countries',
    format: counted,
    click: (row) => narrowTo('countries', 'region', String(row.fields.region ?? ''))
  }
]

/**
 * The countries with sellers in them.
 *
 * `stores` is BrickLink's own count off the directory page, so it is stated
 * before anyone has fetched a single seller — and pressing it is what fetches
 * them, one country's page at a time.
 */
export const countryColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  // The flag, which is the whole of what the original's image column is here.
  // A column's width is the cell's, not the picture's: the shell's 12px of
  // padding either side and the press button's own chrome come out of it
  // first, so 40px of them leaves a flag no wider than a line.
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    width: '80px',
    height: '20px',
    click: (row) => narrowTo('stores', 'country', String(row.fields.country ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '200px',
    sort: 'name',
    click: (row) => narrowTo('stores', 'country', String(row.fields.country ?? ''))
  },
  {
    key: 'stores',
    label: 'Stores',
    width: '90px',
    sort: 'stores',
    format: counted,
    click: (row) => narrowTo('stores', 'country', String(row.fields.country ?? ''))
  },
  {
    key: 'region',
    role: 'reference',
    label: 'Region',
    width: '140px',
    sort: 'region',
    click: (row) => narrowTo('regions', 'region', String(row.fields.region ?? ''))
  }
]

/**
 * The sellers themselves, as the original's `stores` columns state them:
 * country, province, the name with its id after it, the lot count and whether
 * the seller takes instant checkout.
 */
export const storeColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'country',
    role: 'reference',
    label: 'Country',
    width: '90px',
    sort: 'country',
    click: (row) => narrowTo('countries', 'country', String(row.fields.country ?? ''))
  },
  {
    key: 'province',
    label: 'Province',
    width: '120px',
    sort: 'province',
    click: (row) => narrowBy('province', String(row.fields.province ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '220px',
    sort: 'name',
    // This one seller, out of whatever is on screen. It narrows rather than
    // states the term, so the country already asked about survives the press;
    // the count beside it is the cell that leads out to the seller's lots.
    click: (row) => narrowBy('store', String(row.fields.store ?? ''))
  },
  // What the seller has for sale, and the way through to it. `Items` and not
  // `Lots`: the directory prints a quantity — every brick counted one by one —
  // where a lot is one listing that may hold hundreds of them.
  {
    key: 'items',
    label: 'Items',
    width: '90px',
    sort: 'items',
    format: counted,
    click: (row) => narrowTo('inventories', 'store', String(row.fields.store ?? ''))
  },
  {
    key: 'instantCheckout',
    label: 'Instant Checkout',
    width: '120px',
    sort: 'instantCheckout'
  }
]

/**
 * The pictures of an item, which is the one table here that is only pictures.
 *
 * The original draws the image and nothing else. The record is here as well
 * because this is every picture loaded rather than one item's, and a wall of
 * photographs with nothing saying what they are of is not a table.
 */
export const imageColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'image',
    kind: 'component',
    component: CellImage,
    width: '200px',
    height: '150px',
    click: narrowToItem
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Item',
    width: '160px',
    mono: true,
    sort: 'name',
    click: narrowToItem
  }
]

/**
 * A population, stated the way `getTableLabel` states it: abbreviated through
 * `formatInteger`, and absent rather than zero while the worker is still
 * counting — so a card reads `Colors` until the number is real, never
 * `Colors 0`.
 */
function population(value?: number): string {
  if (processingCounts.value || !value) {
    return ''
  }
  return String(formatInteger(value) ?? '')
}

/**
 * The two counts `setCounts` writes straight onto the table it belongs to,
 * rather than into the per-query `counts` map: neither item types nor part and
 * colour codes narrows with the query.
 */
function tableCount(id: string): number | undefined {
  return itemTypes.value.find((table) => table.id === id)?.count
}

/**
 * A population of one of the browse-filled types, as [catalogCounts] counts
 * them.
 *
 * Stated on the same terms `population` states the bulk five — abbreviated, and
 * absent rather than zero — but not gated on `processingCounts`, that being the
 * bulk downloads' own counting run and nothing to do with these.
 */
function browsed(key: string): string {
  const value = browsedCounts.value[key]
  return value ? String(formatInteger(value) ?? '') : ''
}

/**
 * Every type brickzuke has a table for, in the order its own home screens list
 * them.
 *
 * Only `items` has columns and a source behind it — this prototype moves one
 * table. The rest are here because the home screen is a summary of the whole
 * catalogue, and a summary missing most of its lines is not one.
 */
/**
 * The opened item's records, declared only while an item is open.
 *
 * The shell takes its home-screen cards and its entity chips straight from
 * this list, and item records are not a population anyone browses — a sixth
 * card reading "Item records" beside the five brickzuke counts would be a card
 * for nothing. So the type exists exactly while the URL is on it, which is the
 * same thing as saying it is a detail rather than a table.
 */
const openEntity = computed(() => router.currentRoute.value.query[PARAM_ENTITY])
const openItemRecords = computed(() => openEntity.value === 'itemRecords')
const openInventory = computed(() => openEntity.value === 'inventory')
const openColorItems = computed(() => openEntity.value === 'colorItems')

const itemRecordsEntity: EntitySchema = {
  key: 'itemRecords',
  label: 'Item records',
  // Counted by what comes back, not by the catalogue: this is one item.
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: itemRecordColumns,
  sorts: [
    {
      key: 'type',
      label: 'Type'
    },
    {
      key: 'name',
      label: 'Name'
    },
    {
      key: 'categoryName',
      label: 'Category'
    },
    {
      key: 'year',
      label: 'Year'
    },
    {
      key: 'weight',
      label: 'Weight'
    },
    {
      key: 'dimensions',
      label: 'Dimensions'
    }
  ]
}

const inventoryEntity: EntitySchema = {
  key: 'inventory',
  label: 'Inventory',
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: inventoryColumns,
  sorts: [
    {
      key: 'type',
      label: 'Type'
    },
    {
      key: 'name',
      label: 'Item'
    },
    {
      key: 'categoryName',
      label: 'Category'
    },
    {
      key: 'color',
      label: 'Color'
    },
    {
      key: 'quantity',
      label: 'Quantity'
    }
  ]
}

/**
 * The items of the colour that is open — declared only while one is, for the
 * same reason the two above are: this is a detail rather than a table, and a
 * sixth home-screen card reading "Color items" would be a card for nothing.
 */
const colorItemsEntity: EntitySchema = {
  key: 'colorItems',
  label: 'Color items',
  // Counted by what comes back: this is one colour's listing, not a population
  // the catalogue holds a number for.
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: colorItemColumns,
  sorts: [
    {
      key: 'number',
      label: 'No.'
    },
    {
      key: 'name',
      label: 'Name'
    }
  ]
}

export const catalogSchema: ComputedRef<DomainSchema> = computed(() => ({
  key: 'brickzuke',
  label: 'Brickzuke',
  kicker: 'BrickLink catalogue',
  placeholder: 'brick OR plate year>=1988',
  entities: [
    {
      key: 'categories',
      label: 'Categories',
      // The field every other record carries a category's id in — what an
      // item row holds in `category`, and what pressing a category writes.
      // Declaring it is what lets the header say `category:Brick (5)` where
      // the query says `category:"5"`: the shell reads the term back through
      // this field, against this type, and shows what the record is called.
      // Nothing else in the shell acts on it — a drill needs a column asking
      // for one, and brickzuke's columns press for themselves.
      scope: 'category',
      count: population(selectedCounts.value?.categories),
      facets: [],
      tabs: [],
      samples: [],
      columns: categoryColumns,
      // Every labelled column, in the order the table shows them — see the
      // note on `items` below. Which of them a table *opens* on is not this
      // list's business: `openingOrder` says that.
      sorts: [
        {
          key: 'type',
          label: 'Type'
        },
        {
          key: 'items',
          label: 'Items'
        },
        {
          key: 'name',
          label: 'Name'
        }
      ]
    },
    {
      key: 'colors',
      label: 'Colors',
      // As above. BrickLink's colour id and not brickzuke's, that being the
      // one an inventory row and a colour's listing are addressed by — so
      // `colorid:"41"` reads as Aqua in both.
      scope: 'colorid',
      count: population(selectedCounts.value?.colors),
      facets: [],
      tabs: [],
      samples: [],
      columns: colorColumns,
      sorts: [
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'items',
          label: 'Parts'
        },
        {
          key: 'sets',
          label: 'Sets'
        },
        {
          key: 'wanted',
          label: 'Wanted'
        },
        {
          key: 'forSale',
          label: 'For sale'
        },
        {
          key: 'yearFrom',
          label: 'Year from'
        },
        {
          key: 'yearTo',
          label: 'Year to'
        }
      ]
    },
    {
      key: 'itemTypes',
      label: 'Item types',
      // As above, for the one-letter code items, categories and colour items
      // are all narrowed by: `type:"P"` says Part, which is a good deal more
      // than P says.
      scope: 'type',
      count: population(tableCount('itemTypes')),
      facets: [],
      tabs: [],
      samples: [],
      columns: itemTypeColumns,
      sorts: [
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'items',
          label: 'Items'
        },
        {
          key: 'categories',
          label: 'Categories'
        }
      ]
    },
    {
      key: 'items',
      label: 'Items',
      count: population(selectedCounts.value?.items),
      facets: [],
      tabs: ['Information', 'Inventory', 'Images'],
      samples: [],
      columns: itemColumns,
      // Every labelled column, because every header in the original is a
      // button that sorts by it — which is how every type here declares its
      // sorts. A column with nothing to compare is the exception: an ordinal
      // is the position under the current sort, and a picture is a picture.
      sorts: [
        {
          key: 'type',
          label: 'Type'
        },
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'categoryName',
          label: 'Category'
        },
        {
          key: 'year',
          label: 'Year'
        },
        {
          key: 'weight',
          label: 'Weight'
        },
        {
          key: 'dimensions',
          label: 'Dimensions'
        }
      ]
    },
    {
      key: 'partAndColorCodes',
      label: 'Part and color codes',
      count: population(tableCount('partAndColorCodes')),
      facets: [],
      tabs: [],
      samples: []
    },
    /**
     * The rest of what brickzuke has tables for: the parts a set is made of
     * and the lots a seller has for sale, BrickLink's stores and where in the
     * world they are, and the cross-sections the original slices all of it by.
     *
     * These are `view/stores/models.ts`'s. That is the older of brickzuke's
     * two models and it lists nine tables beside the five `model.ts` counts —
     * a schema built from the second file alone drops the stores, the
     * countries and the inventories, and states the catalogue as the bulk
     * downloads rather than as the catalogue.
     *
     * In that file's order, and counted by [catalogCounts] rather than by
     * `setCounts` — the latter counts the five stores the bulk downloads fill,
     * and every one of these is filled by browsing instead: a set opened, a
     * country asked about. So the number on the card is how much of each has
     * been fetched so far, which is exactly what its table shows.
     *
     * Until something has been fetched that number is zero, and zero is drawn
     * as no count at all: a card reading `0` for a type nobody has asked about
     * states a number brickzuke never gave. That is the same rule `population`
     * follows for the bulk five while their counts are still running.
     */
    {
      key: 'itemInventories',
      label: 'Item inventories',
      count: browsed('itemInventories'),
      facets: [],
      tabs: [],
      samples: [],
      columns: itemInventoryColumns,
      sorts: [
        {
          key: 'type',
          label: 'Type'
        },
        {
          key: 'name',
          label: 'Item'
        },
        {
          key: 'record',
          label: 'Set'
        },
        {
          key: 'categoryName',
          label: 'Category'
        },
        {
          key: 'color',
          label: 'Color'
        },
        {
          key: 'quantity',
          label: 'Quantity'
        }
      ]
    },
    {
      key: 'itemVariants',
      label: 'Item variants',
      // The field an inventory row carries its variant in, which is what
      // pressing `Sets` writes — so `variant:"3001-5"` reads as the brick
      // rather than as the pair of numbers it is.
      scope: 'variant',
      count: browsed('itemVariants'),
      facets: [],
      tabs: [],
      samples: [],
      columns: itemVariantColumns,
      sorts: [
        {
          key: 'type',
          label: 'Type'
        },
        {
          key: 'name',
          label: 'Item'
        },
        {
          key: 'categoryName',
          label: 'Category'
        },
        {
          key: 'color',
          label: 'Color'
        },
        {
          key: 'sets',
          label: 'Sets'
        }
      ]
    },
    {
      // A seller's lots, which is not the `inventory` type this schema also
      // declares: that one is the parts BrickLink says one set is made of, and
      // exists only while an item is open. This is what stores have for sale,
      // and it is a table in its own right — hence both, under the two names
      // the original gives them.
      key: 'inventories',
      label: 'Store inventories',
      count: browsed('inventories'),
      facets: [],
      tabs: [],
      samples: [],
      columns: storeInventoryColumns,
      sorts: [
        {
          key: 'priceValue',
          label: 'Price'
        },
        {
          key: 'description',
          label: 'Description'
        },
        {
          key: 'countryName',
          label: 'Country'
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
          key: 'quantity',
          label: 'Quant.'
        },
        {
          key: 'feedback',
          label: 'Feedback'
        }
      ]
    },
    {
      // BrickLink's own one-letter code, `N` or `U`, which is what a lot
      // carries — so `condition:"N"` reads as New on the lots table too.
      key: 'conditions',
      label: 'Conditions',
      scope: 'condition',
      // Two, always: BrickLink sells in New and Used and nothing
      // else, so this is a fixed pair rather than a population
      // anything counts — see `conditionRows`.
      count: '2',
      facets: [],
      tabs: [],
      samples: [],
      columns: conditionColumns,
      sorts: [
        {
          key: 'name',
          label: 'Condition'
        },
        {
          key: 'lots',
          label: 'Lots'
        },
        {
          key: 'quantity',
          label: 'Quantity'
        }
      ]
    },
    {
      // The field an item row carries its year in, so `year:"1958"` states the
      // year on both tables and the number of items behind it on this one.
      key: 'years',
      label: 'Years',
      scope: 'year',
      count: browsed('years'),
      facets: [],
      tabs: [],
      samples: [],
      columns: yearColumns,
      sorts: [
        {
          key: 'year',
          label: 'Year'
        },
        {
          key: 'items',
          label: 'Items'
        }
      ]
    },
    {
      // The field a country carries its region in.
      key: 'regions',
      label: 'Regions',
      scope: 'region',
      count: browsed('regions'),
      facets: [],
      tabs: [],
      samples: [],
      columns: regionColumns,
      sorts: [
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'countries',
          label: 'Countries'
        }
      ]
    },
    {
      // The code a seller and a lot both carry, so `country:"DE"` reads as
      // Germany on the stores table and on the lots.
      key: 'countries',
      label: 'Countries',
      scope: 'country',
      count: browsed('countries'),
      facets: [],
      tabs: [],
      samples: [],
      columns: countryColumns,
      sorts: [
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'stores',
          label: 'Stores'
        },
        {
          key: 'region',
          label: 'Region'
        }
      ]
    },
    {
      // The seller's username, which is what a lot carries and what pressing a
      // store on the lots table writes.
      key: 'stores',
      label: 'Stores',
      scope: 'store',
      count: browsed('stores'),
      facets: [],
      tabs: [],
      samples: [],
      columns: storeColumns,
      sorts: [
        {
          key: 'country',
          label: 'Country'
        },
        {
          key: 'province',
          label: 'Province'
        },
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'items',
          label: 'Items'
        },
        {
          key: 'instantCheckout',
          label: 'Instant Checkout'
        }
      ]
    },
    {
      key: 'images',
      label: 'Images',
      count: browsed('images'),
      facets: [],
      tabs: [],
      samples: [],
      columns: imageColumns,
      sorts: [
        {
          key: 'name',
          label: 'Item'
        }
      ]
    },
    ...(openItemRecords.value ? [itemRecordsEntity] : []),
    ...(openInventory.value ? [inventoryEntity] : []),
    ...(openColorItems.value ? [colorItemsEntity] : [])
  ]
}))
