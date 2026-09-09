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
import {PARAM_ENTITY,
  PARAM_EXPR,
  PARAM_PAGE,
  PARAM_SORT,
  addTerm,
  formatExpression,
  parseExpression,
  scopeTermFor,
  scopedEntity} from 'header-content-layout'
import type { ColumnDef, DomainSchema, EntitySchema, ShellRow } from 'header-content-layout'
import router from '@/router'
import { formatInteger } from '@/assets/js/utils'
import { itemTypes, processingCounts, selectedCounts } from '../../model'
import { browsedCounts } from './catalogCounts'
import { LOADING, fills } from './homeFill'
import { priceCurrency } from './priceCurrency'
import CellCount from './CellCount.vue'
import CellPrice from './CellPrice.vue'
import CellImage from './CellImage.vue'
import CellParts from './CellParts.vue'
import CellSetting from './CellSetting.vue'
import { SETTINGS } from './settings'

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
  narrowByTerm(`${field}:"${value}"`)
}

/**
 * The same narrowing, given the term already written.
 *
 * What is *not* touched is as much of this as what is: the type stays, the view
 * stays, and so the screen someone is on is the screen they stay on with one
 * more constraint over it. That is what makes it usable from the home screen,
 * where the type is nothing and the view is the cards.
 */
function narrowByTerm(term: string) {
  const params = new URLSearchParams(window.location.search)
  params.set(PARAM_EXPR, addTerm(params.get(PARAM_EXPR) ?? '', term))
  params.delete(PARAM_PAGE)
  router.push('/?' + params.toString())
}

/**
 * Narrowing the screen to one record — the press a row makes, for a host
 * drawing records somewhere the shell is not.
 *
 * appfr 0.21.0 made a press on a row mean this, and the home screen's tiles are
 * the records of a type drawn brickzuke's own way: a tile is a row, so a press
 * on one is the press on a row. Undefined where the record's type declares no
 * `scope` — nothing carries its id, and an unresolvable field is *true* in this
 * language, so a term written anyway would narrow to everything.
 *
 * `scopeTermFor` rather than a term built here, so the text is the one the
 * shell would have written: the same field, the same quoting, and so the same
 * term `addTerm` recognises when it is already in the query.
 */
export function narrowingTo(row: ShellRow): (() => void) | undefined {
  const term = scopeTermFor(catalogSchema.value, row)
  return term ? () => narrowByTerm(term) : undefined
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
export function narrowTo(entity: string, field: string, value: string) {
  if (!value) {
    return
  }
  openWith(entity, `${field}:"${value}"`)
}

/**
 * One type opened on a stated expression, which is what the two presses that
 * take more than one term do — a colour is a colour and a catalogue type, and
 * a picture is a part and the colour it is moulded in.
 */
function openWith(entity: string, expr: string) {
  const params = new URLSearchParams(window.location.search)
  params.set(PARAM_ENTITY, entity)
  params.set(PARAM_EXPR, expr)
  params.delete(PARAM_SORT)
  params.delete(PARAM_PAGE)
  router.push('/?' + params.toString())
}

/**
 * The terms of an expression that name a record, which are the ones that go on
 * meaning something against another type.
 *
 * `region:"Europe"` is a reference: brickzuke puts the field on a country, a
 * seller and a lot so that the one term reaches all three — see `toStoreRow`.
 * `name:"brick"` is not; it is a question about a value, and asked of the
 * countries it finds nothing. `scopedEntity` is the difference, a field being a
 * reference exactly where some type declares it as its `scope`.
 *
 * A group left with nothing in it is dropped rather than kept, which
 * `formatExpression` does: an alternative with no terms matches every row, so
 * keeping it would widen the query rather than carry part of it over.
 */
function recordTerms(expr: string): string {
  if (!expr.trim()) {
    return ''
  }
  return formatExpression(
    parseExpression(expr).map((group) =>
      group.filter(
        (term) => term.kind === 'field' && Boolean(scopedEntity(catalogSchema.value, term.field))
      )
    )
  )
}

/**
 * One type, opened on whatever of the query still applies to it — the press a
 * home-screen card's heading makes.
 *
 * The same navigation as `openWith`, and the sort goes for the same reason: the
 * type on the far side declares its own, and the shell falls back to it when
 * the URL names none.
 *
 * What it keeps is the record the screen is narrowed to. This used to clear the
 * expression outright, on the argument that an expression belongs to the type
 * it was written against — true of the questions someone types, and false of a
 * record: since the home screen's tiles narrow rather than pivot, `Europe` is
 * how a reader gets *to* this wall, and a card reading `Countries 29` that
 * opened all forty of them contradicted the number it was pressed by.
 */
export function openType(entity: string) {
  const params = new URLSearchParams(window.location.search)
  params.set(PARAM_ENTITY, entity)
  const kept = recordTerms(params.get(PARAM_EXPR) ?? '')
  if (kept) {
    params.set(PARAM_EXPR, kept)
  } else {
    params.delete(PARAM_EXPR)
  }
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
 * The part in the colour the picture is a picture of.
 *
 * A thumbnail on any of these tables is never of the catalogue part on its
 * own — it is that part moulded in one colour, and pressing it to be shown the
 * colourless catalogue entry throws away half of what was pressed. So it
 * states both terms: `record` addresses the item, which is what fetches the
 * lots, and `colorid` narrows them to the colour on the row. What comes back
 * is BrickLink's part-and-colour page — every seller with that part in that
 * colour — with the item and the colour columns dropped, both being settled by
 * the query.
 *
 * A row with no colour is an item and nothing more, and falls back to the
 * catalogue entry rather than to a table it cannot address.
 */
function narrowToVariant(row: ShellRow) {
  const type = String(row.fields.type ?? '')
  const number = String(row.fields.itemId ?? '')
  const colorId = String(row.fields.colorid ?? '')
  if (!type || !number || !colorId) {
    narrowToItem(row)
    return
  }
  openWith('inventories', `record:"${type}-${number}" colorid:"${colorId}"`)
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
export function narrowToColor(catType: string, row: ShellRow) {
  const colorId = String(row.fields.colorid ?? '')
  if (!colorId) {
    return
  }
  openWith('colorItems', `colorid:"${colorId}" type:"${catType}"`)
}

/*
 * A width has to hold the heading as well as the value, and three of these are
 * headed by a longer word than anything under them: `S` under Type, a dash or
 * three digits under Weight, `2 x 4` under Dimensions. Those three are sized
 * for the label rather than for the column, because a table whose headings are
 * cut short cannot say what it is showing — and the headings are set in
 * brickzuke's own type size now that the shell takes it, which is wider than
 * the size these widths were first measured against. `itemRecordColumns` below
 * is the same table for one item, and carries the same three widths.
 */
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
  //
  // `role: 'image'` is on every one of these, and is what carries the picture
  // out of the table: a card draws it beside the name and a tile draws it
  // behind the caption, a catalogue record being what it looks like before it
  // is anything else.
  {
    key: 'image',
    role: 'image',
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
    hint: 'Which of BrickLink’s kinds of thing this is — a set, a part, a minifigure, a gear',
    width: '95px',
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
    width: '95px',
    sort: 'year',
    click: (row) => narrowBy('year', String(row.fields.year ?? ''))
  },
  /**
   * What the set is made of, and the way into the list of it.
   *
   * The one column here whose number is not in any bulk download: BrickLink
   * states an inventory a page at a time, so this reads as a dash until
   * somebody opens the set — and stays pressable meanwhile, that press being
   * how the number gets known at all. See CellParts.
   *
   * Pressing it opens the `inventory` type on this record, which is the same
   * place a record's name leads: every part of the set, its colour and how
   * many.
   */
  {
    key: 'parts',
    label: 'Parts',
    hint: 'How many pieces the set is made of — a dash until somebody opens it, BrickLink stating an inventory only a page at a time',
    kind: 'component',
    component: CellParts,
    width: '100px',
    sort: 'parts',
    click: (row) => narrowTo('inventory', 'record', String(row.fields.record ?? ''))
  },
  {
    key: 'weight',
    label: 'Weight',
    hint: 'What the whole item weighs, read in whatever unit the figure lands in — cg, g or kg',
    width: '110px',
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
    hint: 'The footprint BrickLink records for the part, in studs',
    width: '150px',
    sort: 'dimensions',
    // Every other part the same shape — pressing `2 x 4` is the one question a
    // dimension answers.
    click: (row) => narrowBy('dimensions', String(row.fields.dimensions ?? ''))
  }
]

/**
 * One opened item: the BrickLink records the items table collapses into a
 * line, drawn in the same order and to the same widths so opening one changes
 * what is listed and nothing about how it looks.
 *
 * One column says something else. The items table heads its second with the
 * type, which is all a collapsed line can say about however many records it
 * holds; a record has a line of its own, so that column states the record —
 * `S-75884-1`, the type letter still in front of it.
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
    role: 'image',
    kind: 'component',
    component: CellImage,
    width: '180px',
    height: '100px',
    // Where the name leads, because a picture of a set is the most obvious
    // thing on the row to press for what is in it.
    click: (row) => narrowTo('inventory', 'record', String(row.fields.id ?? ''))
  },
  /*
   * Where the items table has a Type, this has the record itself — `S-75884-1`
   * rather than `S`. The type is still in it, being the first character of it,
   * and the press is still the type's: what is added is the id, which on this
   * table is what tells one record of an item from another. It sits here
   * rather than after the name because the name is what the header says a
   * record is called, and the header states the id after it already.
   */
  {
    key: 'record',
    label: 'Record',
    hint: 'BrickLink’s own id for this one record, its type letter in front of it',
    width: '150px',
    mono: true,
    sort: 'record',
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
    width: '95px',
    sort: 'year',
    click: (row) => narrowTo('items', 'year', String(row.fields.year ?? ''))
  },
  // As on the items table, so opening an item changes what is listed and
  // nothing about how it looks.
  {
    key: 'parts',
    label: 'Parts',
    hint: 'How many pieces the set is made of — a dash until somebody opens it, BrickLink stating an inventory only a page at a time',
    kind: 'component',
    component: CellParts,
    width: '100px',
    sort: 'parts',
    click: (row) => narrowTo('inventory', 'record', String(row.fields.record ?? ''))
  },
  {
    key: 'weight',
    label: 'Weight',
    hint: 'What the whole item weighs, read in whatever unit the figure lands in — cg, g or kg',
    width: '110px',
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
    hint: 'The footprint BrickLink records for the part, in studs',
    width: '150px',
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
    role: 'image',
    kind: 'component',
    component: CellImage,
    label: 'Variant',
    hint: 'The part in the one colour this row is about, which is what a variant is',
    width: '100px',
    height: '60px',
    click: narrowToVariant
  },
  {
    key: 'type',
    label: 'Type',
    hint: 'Which of BrickLink’s kinds of thing the piece is — most of an inventory is parts, a few of it minifigures',
    width: '95px',
    sort: 'type',
    click: (row) => narrowTo('items', 'type', String(row.fields.type ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Item',
    width: '300px',
    sort: 'name',
    // Out to the catalogue entry for this part, colour and all. The picture
    // beside it keeps the colour, this being the row's two questions: what
    // part is that, and who sells it in that colour.
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
    width: '100px',
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
    hint: 'How many of this part the set contains',
    width: '125px',
    sort: 'quantity',
    format: counted
  }
]

/** A count, or an empty cell when the catalogue never stored the number. */
export function counted(value: unknown): string {
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
 * The name leads back into the items table, this being the end of the road
 * for the item itself: a colour's listing says which items, and the items
 * table is where an item is. The picture leads to that item in this colour,
 * which is the pair the listing is of.
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
    role: 'image',
    kind: 'component',
    component: CellImage,
    width: '120px',
    height: '70px',
    click: narrowToVariant
  },
  {
    key: 'number',
    label: 'No.',
    hint: 'BrickLink’s catalogue number for the item',
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
    width: '95px',
    sort: 'type',
    click: (row) => narrowTo('items', 'type', String(row.fields.typeId ?? ''))
  },
  {
    key: 'items',
    label: 'Items',
    hint: 'How many catalogue items are filed under this category',
    kind: 'component',
    component: CellCount,
    width: '100px',
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
    role: 'image',
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
    hint: 'Distinct part designs catalogued in this colour, off BrickLink’s own colour guide',
    kind: 'component',
    component: CellCount,
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => narrowToColor('P', row)
  },
  {
    key: 'sets',
    label: 'Sets',
    hint: 'Sets holding at least one piece in this colour',
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
    hint: 'Lots of this colour on other people’s wanted lists — buyers, not catalogue items',
    width: '120px',
    sort: 'wanted',
    format: counted
  },
  {
    key: 'forSale',
    label: 'For sale',
    hint: 'Lots of this colour sellers have on offer — stock, not catalogue items',
    width: '120px',
    sort: 'forSale',
    format: counted
  },
  {
    key: 'yearFrom',
    label: 'Year from',
    hint: 'The first year anything was made in this colour',
    width: '135px',
    sort: 'yearFrom'
  },
  {
    key: 'yearTo',
    label: 'Year to',
    hint: 'The last year anything was made in it, which for a colour still in use is this one',
    width: '115px',
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
    hint: 'How many catalogue items are of this type',
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
    hint: 'How many categories hold items of this type',
    kind: 'component',
    component: CellCount,
    width: '145px',
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
    role: 'image',
    kind: 'component',
    component: CellImage,
    label: 'Variant',
    hint: 'The part in the one colour this row is about, which is what a variant is',
    width: '100px',
    height: '60px',
    click: narrowToVariant
  },
  {
    key: 'type',
    label: 'Type',
    hint: 'Which of BrickLink’s kinds of thing the piece is — most of an inventory is parts, a few of it minifigures',
    width: '95px',
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
    hint: 'The set this part came out of, by BrickLink’s id for it',
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
    width: '100px',
    sort: 'color',
    click: (row) => narrowBy('colorid', String(row.fields.colorid ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quantity',
    hint: 'How many of this part the set contains',
    width: '125px',
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
    role: 'image',
    kind: 'component',
    component: CellImage,
    label: 'Variant',
    width: '100px',
    height: '60px',
    click: narrowToVariant
  },
  {
    key: 'type',
    label: 'Type',
    width: '95px',
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
    width: '100px',
    sort: 'color',
    click: (row) => narrowBy('colorid', String(row.fields.colorid ?? ''))
  },
  {
    key: 'sets',
    label: 'Sets',
    width: '90px',
    sort: 'sets',
    format: counted,
    click: (row) => narrowTo('itemInventories', 'variant', String(row.fields.variant ?? ''))
  }
]

/**
 * Which terms leave a column with nothing left to say, by column key.
 *
 * A column answers a question, and a query that has already fixed the answer
 * makes it a column of one repeated value — `Store` under `store:"brick8"`,
 * `Country` under `country:"DE"`. Those are rows of noise in a table read
 * across, so the query takes them out.
 *
 * Some columns are settled by a term that is not their own. Pinning a seller
 * pins where they are and what feedback they carry, neither of which varies
 * over one store's lots; pinning an item pins its name. Hence a list per
 * column rather than a field per column.
 */
const SETTLED_BY: Record<string, string[]> = {
  item: ['record'],
  color: ['colorid'],
  countryName: ['country', 'store'],
  storeName: ['store'],
  feedback: ['store'],
  conditionName: ['condition'],
  country: ['country'],
  province: ['province'],
  region: ['region']
}

/**
 * Whether an expression fixes one field to exactly one value.
 *
 * Every OR group has to name it, and name it the same, or the rows can still
 * differ: `store:"a" OR store:"b"` pins nothing, and a group with no term on
 * the field at all lets everything through.
 */
function pinsOneValue(expr: string, field: string): boolean {
  const groups = parseExpression(expr)
  if (!groups.length) {
    return false
  }
  let pinned: string | undefined
  for (const group of groups) {
    const term = group.find(
      (one) => one.kind === 'field' && one.field === field && one.comparator === ':'
    )
    if (!term) {
      return false
    }
    const value = String((term as { value?: unknown }).value ?? '')
    if (pinned !== undefined && pinned !== value) {
      return false
    }
    pinned = value
  }
  return pinned !== undefined
}

/**
 * The columns still worth drawing, given what the query has already settled.
 *
 * Promotes an identity where the pinned column was it. The identity is what
 * names a row wherever the shell is not drawing a table, so dropping it
 * because the query fixed it would leave nothing naming anything — the next
 * column carrying text takes the role instead.
 */
function informative(columns: ColumnDef[], expr: string): ColumnDef[] {
  const kept = columns.filter((column) => {
    const settling = column.key ? SETTLED_BY[column.key] : undefined
    return !settling?.some((field) => pinsOneValue(expr, field))
  })
  if (kept.length === columns.length || kept.some((column) => column.role === 'identity')) {
    return kept
  }
  const at = kept.findIndex((column) => column.kind === undefined && column.label)
  return at === -1
    ? kept
    : kept.map((column, index) => (index === at ? {
      ...column,
      role: 'identity' as const
    } : column))
}

/**
 * The price column, told which currency the figures under it are in.
 *
 * The currency is the viewer's own BrickLink setting, so it is not a thing
 * this app knows until a converted price has been read off a lot — see
 * [priceCurrency]. Before then the header says what the column is without
 * naming it, which is true at every moment rather than true once the lots
 * land.
 */
function pricedIn(columns: ColumnDef[], currency: string): ColumnDef[] {
  if (!currency) {
    return columns
  }
  return columns.map((column) => (column.key === 'priceValue' ? {
    ...column,
    hint: `What one piece costs in ${currency}, converted from what the seller charges`
  } : column))
}

/** The expression the shell is showing, which is the one in the URL. */
const openExpr = computed(() => String(router.currentRoute.value.query[PARAM_EXPR] ?? ''))

/**
 * What sellers have on offer — the original's `inventories` columns in its own
 * order: the lot's picture, its price, what it is, the seller's note on it,
 * where the seller is, who they are, the condition, how many and their
 * feedback.
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
    role: 'image',
    kind: 'component',
    component: CellImage,
    width: '70px',
    height: '50px',
    // The lot's own part and colour, out across every seller of it — a lot is
    // of a coloured part, and so is the picture. The Item column beside it is
    // the way to the catalogue entry.
    click: narrowToVariant
  },
  // Drawn by a component so the figure can stand alone while the currencies
  // stay reachable — see CellPrice. Sorted by that same converted number,
  // which is the one question a column of prices is asked; sorting the string
  // answers a different one, `US $10.00` coming before `US $9.00` on every
  // character that matters.
  {
    key: 'priceValue',
    kind: 'component',
    component: CellPrice,
    label: 'Price',
    // Named without the currency, which no column can state until a price has
    // been read — see [pricedIn], which puts it in once one has.
    hint: 'What one piece costs, converted into your own currency',
    width: '95px',
    sort: 'priceValue'
  },
  // What the lot is *of*, and the way through to it. The original had no such
  // column: every row on an item's page is the same item, so the only thing
  // worth printing there was the seller's note, and it took the name
  // `description`. A seller's own lots are the other way round — one seller,
  // every item they stock — and then the item is the whole of what a row says.
  {
    key: 'item',
    role: 'identity',
    label: 'Item',
    width: '280px',
    sort: 'itemName',
    value: (row) => row.fields.itemName,
    click: narrowToItem
  },
  {
    key: 'description',
    label: 'Remark',
    hint: 'The seller’s own note on this lot, which is theirs to write and often empty',
    width: '200px',
    sort: 'description'
  },
  {
    key: 'color',
    label: 'Color',
    width: '110px',
    sort: 'colorName',
    value: (row) => row.fields.colorName,
    click: (row) => narrowBy('colorid', String(row.fields.colorid ?? ''))
  },
  {
    key: 'countryName',
    role: 'reference',
    label: 'Country',
    hint: 'Where the seller is, which is where the parcel comes from',
    width: '120px',
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
    hint: 'New or Used, as the seller graded the lot',
    width: '130px',
    sort: 'conditionName',
    click: (row) => narrowBy('condition', String(row.fields.condition ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quant.',
    hint: 'How many pieces are in this one lot, all at the price beside it',
    width: '110px',
    sort: 'quantity',
    format: counted
  },
  {
    key: 'feedback',
    label: 'Feedback',
    hint: 'The seller’s feedback score on BrickLink — blank on their own store front, which never states it',
    width: '135px',
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
    width: '130px',
    sort: 'name',
    click: (row) => narrowTo('inventories', 'condition', String(row.fields.condition ?? ''))
  },
  {
    key: 'lots',
    label: 'Lots',
    hint: 'Listings of this condition among the lots loaded so far, not BrickLink’s own total',
    width: '90px',
    sort: 'lots',
    format: counted,
    click: (row) => narrowTo('inventories', 'condition', String(row.fields.condition ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quantity',
    hint: 'Every piece inside those lots, counted one by one',
    width: '125px',
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
    width: '95px',
    sort: 'year',
    click: (row) => narrowTo('items', 'year', String(row.fields.name ?? ''))
  },
  {
    key: 'items',
    label: 'Items',
    hint: 'Catalogue items BrickLink dates to this year',
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => narrowTo('items', 'year', String(row.fields.name ?? ''))
  }
]

/** The parts of the world BrickLink groups its sellers by. */
/**
 * The knobs, as a table: what each one is called, what it is set to, and what
 * turning it does.
 *
 * The value column is the one cell in brickzuke that writes — see [CellSetting]
 * — and the description column is wide because it is the whole of the
 * documentation a reader gets. No `click` on any of them: a setting leads
 * nowhere, it is simply changed where it stands.
 */
export const settingsColumns: ColumnDef[] = [
  {
    key: 'name',
    role: 'identity',
    label: 'Setting',
    // Wide enough for the longest name here to stand whole. A setting cut short
    // is a setting nobody can look up, and there are two of them — the room
    // costs nothing that a fourteen-column catalogue table would miss.
    width: '330px',
    sort: 'name'
  },
  {
    key: 'value',
    label: 'Value',
    kind: 'component',
    component: CellSetting,
    width: '120px'
  },
  {
    key: 'detail',
    label: 'What it does',
    // This column *is* the documentation, so it is sized to hold a sentence
    // rather than to fit a column of them.
    width: '900px'
  }
]

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
    hint: 'How many countries with sellers in them this part of the world holds',
    width: '135px',
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
    role: 'image',
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
    hint: 'BrickLink’s own count of the sellers here, stated before any of them has been fetched',
    width: '110px',
    sort: 'stores',
    format: counted,
    click: (row) => narrowTo('stores', 'country', String(row.fields.country ?? ''))
  },
  {
    key: 'region',
    role: 'reference',
    label: 'Region',
    hint: 'The part of the world BrickLink groups the country under',
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
    width: '120px',
    sort: 'country',
    click: (row) => narrowTo('countries', 'country', String(row.fields.country ?? ''))
  },
  {
    key: 'province',
    label: 'Province',
    width: '125px',
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
    hint: 'Every piece the seller has for sale, counted one by one — not how many listings that is',
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => narrowTo('inventories', 'store', String(row.fields.store ?? ''))
  },
  {
    key: 'instantCheckout',
    label: 'Instant Checkout',
    hint: 'Whether the seller takes payment straight away, rather than by invoice after they have quoted postage',
    width: '190px',
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
    role: 'image',
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
 * A population: how many records of a type there are, which is what
 * `entity.count` holds and the only number the shell formats a version of
 * itself.
 *
 * Abbreviated through brickzuke's own `formatInteger` — `1.7k`, `199k`,
 * `23.5m` — because a population is read for its size and not for its digits.
 * Nobody reaches the home screen to learn that there are 198,689 items; they
 * reach it to see which types are big, and eleven cards of grouped six-figure
 * numbers make that harder to see rather than easier.
 *
 * It was grouped through the shell's own `formatCount` up to here, to keep the
 * list of types writing its numbers one way: that control states the
 * population of every type except the one in force, and states that one as how
 * many rows matched, which is the shell's own number. That is settled the
 * other way round now — `formatCount` on the schema below hands the shell this
 * same hand to write its live count in — so the whole list reads alike without
 * brickzuke having to give up the abbreviation.
 *
 * Absent rather than zero while the worker is still counting — so a card reads
 * `Colors` until the number is real, never `Colors 0`.
 */
function population(value?: number): string {
  if (processingCounts.value || !value) {
    return ''
  }
  return abbreviate(value)
}

/**
 * One count, written the way brickzuke writes every count: `29`, `1.7k`,
 * `199k`, `23.5m`.
 *
 * `formatInteger` hands back `string | number | undefined`, none of which a
 * count on a card can be — the value is known to be a number by the time it
 * reaches here, and the callers want a string. This is the cast, in one place.
 */
function abbreviate(value: number): string {
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
 * Stated on the same terms `population` states the bulk five — abbreviated,
 * and absent rather than zero — but not gated on `processingCounts`, that being
 * the bulk downloads' own counting run and nothing to do with these.
 *
 * A type being filled in the background answers ahead of what is stored, and
 * that is the whole of the ordering here: while sellers are arriving a country
 * at a time, the count of the ones that have arrived is the least useful of
 * the three numbers available — it is true, it is on screen, and it is not
 * what anyone reading `Stores` wants to know. See [homeFill] for the two that
 * stand in front of it.
 */
function browsed(key: string): string {
  const fill = fills.value[key]
  if (fill) {
    return fill.estimate === undefined ? LOADING : '~' + abbreviate(fill.estimate)
  }
  const value = browsedCounts.value[key]
  return value ? abbreviate(value) : ''
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

/**
 * Whether a `record:` term is in force under an open type.
 *
 * The header puts names to the ids a query narrows by, and it does that by
 * reading the term back against the type that declares the field — which for
 * `record:` is `itemRecords`. So a set's inventory, an item's lots and its
 * pictures each need that type declared while they are up, none of them being
 * that type themselves.
 *
 * Under an open type only, because the home screen draws a card per declared
 * type and an item's records are a detail rather than a population — the same
 * reason the three below are declared exactly while they are being looked at.
 */
const recordNamed = computed(() => {
  const expr = router.currentRoute.value.query[PARAM_EXPR]
  if (!openEntity.value || typeof expr !== 'string') {
    return false
  }
  return parseExpression(expr).some((group) =>
    group.some((term) => term.kind === 'field' && term.field === 'record')
  )
})
const openInventory = computed(() => openEntity.value === 'inventory')
const openColorItems = computed(() => openEntity.value === 'colorItems')

const itemRecordsEntity: EntitySchema = {
  key: 'itemRecords',
  label: 'Item records',
  // The field every other table carries a BrickLink record's id in — what a
  // part of a set, a lot on offer and a picture all hold in `record`, and what
  // pressing a set writes. Declaring it is what lets the header say
  // `record:1968 Ford Mustang Fastback (S-75884-1)` where the query says
  // `record:"S-75884-1"`: the shell reads the term back through this field,
  // against this type, and shows what the record is called. An id is a join
  // key, and a set's inventory is the one table that says nothing about the
  // set it is of.
  scope: 'record',
  // Counted by what comes back, not by the catalogue: this is one item.
  count: '',
  facets: [],
  tabs: [],
  samples: [],
  columns: itemRecordColumns,
  sorts: [
    {
      key: 'record',
      label: 'Record'
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
      key: 'parts',
      label: 'Parts'
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
  /*
   * The one count the shell works out for itself — how many rows matched, said
   * on the type in force and on `Everything` — written in brickzuke's hand,
   * which is `population`'s hand and the cells' hand. Without it the list of
   * types read `Items · 199k` beside `Everything · 198,689`. Added to appfr in
   * 0.18.0 for exactly this.
   */
  formatCount: abbreviate,
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
        // Sorted over what was known when the scan ran, which is the sets
        // opened so far — the rest have no number to compare and sort as an
        // empty cell does.
        {
          key: 'parts',
          label: 'Parts'
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
      columns: pricedIn(informative(storeInventoryColumns, openExpr.value), priceCurrency.value),
      sorts: [
        {
          key: 'priceValue',
          label: 'Price'
        },
        {
          key: 'itemName',
          label: 'Item'
        },
        {
          key: 'description',
          label: 'Remark'
        },
        {
          key: 'colorName',
          label: 'Color'
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
      columns: informative(countryColumns, openExpr.value),
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
      columns: informative(storeColumns, openExpr.value),
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
    /*
     * The knobs, last on the wall.
     *
     * A type like any other, which is the point of putting them here rather
     * than behind a gear: they are records with names and values, and the
     * shell already draws records with names and values. It sorts, it filters,
     * it has a card — `Settings 2` beside `Colors 213` — and a reader who
     * wants to know what brickzuke will do on their behalf looks it up the way
     * they look anything else up.
     *
     * Declared unconditionally, unlike the three below it: a setting is not a
     * detail of whatever is open, and the one time somebody wants this card is
     * when something is behaving in a way they would like to change.
     */
    {
      key: 'settings',
      label: 'Settings',
      // The field a row carries its own key in, so the value cell can find the
      // setting it is drawing from the row alone.
      scope: 'setting',
      count: population(SETTINGS.length),
      facets: [],
      tabs: [],
      samples: [],
      columns: settingsColumns,
      sorts: [
        {
          key: 'name',
          label: 'Setting'
        }
      ]
    },
    ...(openItemRecords.value || recordNamed.value ? [itemRecordsEntity] : []),
    ...(openInventory.value ? [inventoryEntity] : []),
    ...(openColorItems.value ? [colorItemsEntity] : [])
  ]
}))
