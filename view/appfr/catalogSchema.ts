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
  excludingTerm,
  formatExpression,
  formatTerm,
  parseExpression,
  scopeTermFor,
  scopedEntity} from 'header-content-layout'
import type { ColumnDef, DomainSchema, EntitySchema, PressOptions, ShellRow } from 'header-content-layout'
import router from '@/router'
import { formatInteger } from '@/assets/js/utils'
import { itemTypes, processingCounts, selectedCounts } from '../../model'
import { browsedCounts } from './catalogCounts'
import { LOADING, fills } from './homeFill'
import { priceCurrency } from './priceCurrency'
import CellCount from './CellCount.vue'
import CellPrice from './CellPrice.vue'
import CellImage from './CellImage.vue'
import CellFlag from './CellFlag.vue'
import CellParts from './CellParts.vue'
import CellStoreInventory from './CellStoreInventory.vue'
import CellSetting from './CellSetting.vue'
import CellCartQuantity from './CellCartQuantity.vue'
import CartHeader from './CartHeader.vue'
import CellUserNumber from './CellUserNumber.vue'
import CellUserPick from './CellUserPick.vue'
import CellUserText from './CellUserText.vue'
import CellPriceModifier from './CellPriceModifier.vue'
import { openedOwnSet } from './userWrites'
import { SETTINGS } from './settings'
import { userCounts } from './userCounts'
import {cartLinesEntity,
  shopListItemsEntity,
  shopPlanEntity,
  shopStoresEntity,
  standingUserEntities} from './userSchema'

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
 *
 * With ⌘ held — `exclude`, as the shell reads it off the press — the same
 * value is what the screen is narrowed *away from*: `-category:"5"`, every row
 * but that category's. The shell's own rows answer the key this way, and a
 * cell brickzuke draws itself should not answer it differently.
 */
export function narrowBy(field: string, value: string, options: PressOptions = {}) {
  if (!value) {
    return
  }
  narrowByTerm(`${field}:"${value}"`, options)
}

/**
 * The same narrowing, given the term already written.
 *
 * What is *not* touched is as much of this as what is: the type stays, the view
 * stays, and so the screen someone is on is the screen they stay on with one
 * more constraint over it. That is what makes it usable from the home screen,
 * where the type is nothing and the view is the cards.
 */
function narrowByTerm(term: string, options: PressOptions = {}) {
  const written = options.exclude ? excludingTerm(term) : term
  if (!written) {
    return
  }
  const params = new URLSearchParams(window.location.search)
  params.set(PARAM_EXPR, addTerm(params.get(PARAM_EXPR) ?? '', written))
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
export function narrowingTo(row: ShellRow): ((options?: PressOptions) => void) | undefined {
  const term = scopeTermFor(catalogSchema.value, row)
  return term ? (options) => narrowByTerm(term, options) : undefined
}

/**
 * The same press, when what it leads to is a different type: "show me the
 * items in this category" — or, `entity` null, "show me everything filed
 * under it": a count column names the population it counts, so it pivots to
 * that population's own table; a bucket's Name or picture names the bucket
 * itself, which is not a population of any one type, so it pivots to
 * `Everything` narrowed to it instead.
 *
 * The record terms carry over — a store or a country still identifies the
 * same store or country on the far side — with the stated term added to
 * them, the way `openType`'s press narrows plus the one term this press
 * states. An ordinary text or value term does not carry over: it was written
 * against one type's fields and means nothing against another's. The sort
 * goes for the same reason — the type on the far side declares its own, and
 * the shell falls back to it when the URL names none.
 */
export function narrowTo(entity: string | null, field: string, value: string) {
  if (!value) {
    return
  }
  openWith(entity, `${field}:"${value}"`)
}

/**
 * Every term of `expr` added to `base`, each superseding whatever `base`
 * already says on that field rather than ANDing with it.
 *
 * A record term names one record: `record:"S-10511-1"` kept from the last
 * press and `record:"S-43217-1"` stated by this one both together would ask
 * for a record that is two sets at once, a query that finds nothing rather
 * than the one this press is pointing at. So a field the new expression
 * states is dropped from `base` first — `addTerm` reads only the first term
 * of what it is handed, which is why a press stating two, like
 * `narrowToVariant`'s `record:` and `colorid:`, still needs each folded in on
 * its own rather than passed through in one call.
 */
function addTerms(base: string, expr: string): string {
  if (!base.trim()) {
    return expr
  }
  const stated = parseExpression(expr).flat()
  const statedFields = new Set(
    stated.map((term) => (term.kind === 'field' ? term.field : null)).filter((field) => field !== null)
  )
  const kept = formatExpression(
    parseExpression(base).map((group) =>
      group.filter((term) => !(term.kind === 'field' && statedFields.has(term.field)))
    )
  )
  if (!kept) {
    return expr
  }
  return stated.reduce((acc, term) => addTerm(acc, formatTerm(term)), kept)
}

/**
 * One type opened on a stated expression, added to whatever of the current
 * query still applies to it — the same record terms `openType` keeps, with
 * the terms this press states layered on top rather than replacing them. Two
 * terms rather than one is what the presses needing both ask for: a colour is
 * a colour and a catalogue type, and a picture is a part and the colour it is
 * moulded in.
 *
 * `entity` null is `Everything`: no type in force, the query alone doing the
 * narrowing — the same absence of `e` the home screen opens on, so pressing
 * back to a bucket's own name reads as coming from nowhere in particular.
 */
function openWith(entity: string | null, expr: string) {
  const params = new URLSearchParams(window.location.search)
  if (entity === null) {
    params.delete(PARAM_ENTITY)
  } else {
    params.set(PARAM_ENTITY, entity)
  }
  params.set(PARAM_EXPR, addTerms(recordTerms(params.get(PARAM_EXPR) ?? ''), expr))
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
 * never brickzuke's item id, so what names it is the record id an item states
 * after its name: `Brick 2 x 4 (P-3001)`. The parentheses are load-bearing,
 * `:` being a substring match: `(P-3001)` finds that part and not the
 * `P-3001-2` printed beside it.
 *
 * `Everything` rather than the items table: the picture and the name are the
 * row's own identity, not a count of anything, so what they press to is the
 * record itself rather than a population it belongs to — the items table
 * being one such population is what its own `year`, `category` and `type`
 * columns pivot to instead.
 */
function narrowToItem(row: ShellRow) {
  const type = String(row.fields.type ?? '')
  const number = String(row.fields.itemId ?? '')
  if (!type || !number) {
    return
  }
  narrowTo(null, 'name', `(${type}-${number})`)
}

/**
 * The part in the colour the picture is a picture of.
 *
 * A thumbnail on any of these tables is never of the catalogue part on its
 * own — it is that part moulded in one colour, and pressing it to be shown the
 * colourless catalogue entry throws away half of what was pressed. So it
 * states both terms: `record` addresses the item, which is what fetches the
 * lots, and `colorid` narrows them to the colour on the row. What comes back
 * is `Everything` narrowed to that part in that colour — BrickLink's
 * part-and-colour listing among whatever else the two terms resolve
 * against — with the item and the colour columns dropped, both being settled
 * by the query.
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
  openWith(null, `record:"${type}-${number}" colorid:"${colorId}"`)
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
    click: (row, options) => narrowBy('type', String(row.fields.typeId ?? ''), options)
  },
  // Pressing a name narrows to that one item, which is what the `item` filter
  // did — and not `activate`, because activating is what a row press reports
  // and rows here are not pressable.
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    /*
     * A box on an item of somebody's own and plain text on BrickLink's, this
     * table now listing both — see [userItemRows]. The box holds the name
     * without the record after it: `name` carries `(U-3)` the way a catalogue
     * row carries `(S-10511-1)`, which is what a set's parts lead back by, and
     * is not something anyone should be able to type over.
     */
    kind: 'component',
    component: CellUserText,
    value: (row) => (row.fields.own === true ? row.fields.ownName : row.fields.name),
    width: '300px',
    sort: 'name',
    click: (row, options) => narrowBy('id', String(row.fields.id ?? ''), options)
  },
  {
    key: 'category',
    role: 'reference',
    label: 'Category',
    width: '200px',
    sort: 'categoryName',
    // `category` holds the id so a term can address it; the cell shows the
    // name — and on an item of theirs, the picker, offering BrickLink's
    // categories and theirs together. See [CellUserPick].
    kind: 'component',
    component: CellUserPick,
    click: (row, options) => narrowBy('category', String(row.fields.category ?? ''), options)
  },
  {
    key: 'year',
    label: 'Year',
    width: '95px',
    sort: 'year',
    click: (row, options) => narrowBy('year', String(row.fields.year ?? ''), options)
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
  /**
   * How much of the piece the stores this query reaches are selling.
   *
   * A floor rather than a tally — see CellStoreInventory and
   * [storeInventoryCounts] — read from the lots brickzuke already holds and
   * grown, once a `store:` term names a seller nobody has looked at yet, by
   * fetching that seller's own front the same way pressing it by hand would.
   *
   * Pressing the number opens that record's own lots, on the `inventories`
   * table — `store:` and every other term this query carries still narrows
   * it, `openWith`'s own `recordTerms` being what carries them across.
   */
  {
    key: 'storeInventory',
    label: 'Store inventories',
    hint: 'How many of this piece the stores the current query reaches have on offer — a floor: only a seller somebody has actually looked at is counted',
    kind: 'component',
    component: CellStoreInventory,
    width: '160px',
    sort: 'storeInventory',
    click: (row) => narrowTo('inventories', 'record', String(row.fields.record ?? ''))
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
    click: (row, options) => narrowBy('dimensions', String(row.fields.dimensions ?? ''), options)
  },
  /*
   * What somebody wrote about an item of their own, and blank on every row
   * of BrickLink's. Last, and the first to stand down as the table narrows,
   * because on the catalogue's two hundred thousand rows it is an empty
   * column; it is here at all because a field nothing draws is a field nobody
   * can write.
   */
  {
    key: 'note',
    label: 'Note',
    hint: 'Your own note on an item of your own',
    kind: 'component',
    component: CellUserText,
    width: '220px',
    sort: 'note',
    hideBelow: 1100
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
 * Type, category, year and dimensions all narrow this same table, the way the
 * items table's own columns do: a record carries every one of those fields
 * itself, so pressing one is asking to see the other records of this item that
 * share it, not to leave for the whole catalogue and lose which item this was
 * — the same fix `inventoryColumns` needed for its Type and Category.
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
    click: (row, options) => narrowBy('type', String(row.fields.typeId ?? ''), options)
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
    click: (row, options) => narrowBy('category', String(row.fields.category ?? ''), options)
  },
  {
    key: 'year',
    label: 'Year',
    width: '95px',
    sort: 'year',
    click: (row, options) => narrowBy('year', String(row.fields.year ?? ''), options)
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
    click: (row, options) => narrowBy('dimensions', String(row.fields.dimensions ?? ''), options)
  }
]

/**
 * What a set is made of — the original's `itemInventories` columns in its own
 * order: the variant picture, its type, the item, its category, its colour and
 * how many of them.
 *
 * Type and category both narrow this same table rather than leaving it, the
 * way colour already did: `record:` is what fetched these rows, not a filter
 * over them, so pressing either leaves the parts of this set that match —
 * exactly the same move as pressing a colour. Pivoting to the items table
 * instead, as this used to, dropped `record:` on the way there and turned "the
 * DUPLO bricks in this set" into "every DUPLO brick BrickLink lists".
 *
 * Colour cannot do the same trick in reverse: an item row carries no colour at
 * all, which is the same reason the colours table narrows nothing.
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
    click: (row, options) => narrowBy('type', String(row.fields.type ?? ''), options)
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Item',
    /*
     * A box on a part of a set of somebody's own and plain text on a part of
     * BrickLink's — this table lists either set, by its record. The three
     * writing cells below are the same: a part of theirs is written on this
     * table, and a part of BrickLink's is read off it.
     */
    kind: 'component',
    component: CellUserText,
    width: '300px',
    sort: 'name',
    // Out to the catalogue entry for this part, colour and all. The picture
    // beside it keeps the colour, this being the row's two questions: what
    // part is that, and who sells it in that colour.
    click: narrowToItem
  },
  /*
   * The part's record — `P-3001`, or `U-5` for one of theirs — which a
   * BrickLink set's rows never showed, the picture and the name having said
   * it. A set of theirs is written by it: it is what the planner matches a
   * lot against, so it is what somebody has to be able to type.
   */
  {
    key: 'part',
    label: 'Record',
    hint: 'The part’s record — BrickLink’s, P-3001, or one of your own, U-5. On a set of your own, what you type here is what the sellers’ lots are matched against',
    kind: 'component',
    component: CellUserText,
    width: '130px',
    mono: true,
    sort: 'part',
    value: (row) =>
      row.fields.part ??
      (row.fields.type && row.fields.itemId ? `${row.fields.type}-${row.fields.itemId}` : undefined)
  },
  {
    key: 'categoryName',
    role: 'reference',
    label: 'Category',
    width: '160px',
    sort: 'categoryName',
    click: (row, options) => narrowBy('category', String(row.fields.category ?? ''), options)
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
    click: (row, options) => narrowBy('colorid', String(row.fields.colorid ?? ''), options)
  },
  // The colour's id beside its name, because the id is what a part of theirs
  // is written in — the name is looked up from it — and what a lot carries.
  {
    key: 'colorid',
    label: 'Color id',
    hint: 'BrickLink’s own colour id, which is what a seller’s lots carry. On a set of your own, blank takes the part in any colour',
    kind: 'component',
    component: CellUserText,
    width: '95px',
    sort: 'colorid'
  },
  {
    key: 'quantity',
    label: 'Quantity',
    hint: 'How many of this part the set contains',
    kind: 'component',
    component: CellUserNumber,
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
 * The name leads to `Everything` narrowed to the item itself, this being the
 * end of the road for the item as such — its own identity, not a count of any
 * one population. The picture leads to that item in this colour, the pair the
 * listing is of, narrowed the same way.
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
 * The factor somebody has put on every lot of this row's — colour, seller,
 * category, condition, country, item type, region or province — as the box
 * that sets it.
 *
 * One column on eight tables, and the same on each: what it scales is the lots
 * table's price, whichever table it stands on. The factor shown and written
 * is the active profile's — see [CellPriceModifier], and [priceModifiers] for
 * what the factors do.
 */
const priceModifierColumn: ColumnDef = {
  key: 'priceModifier',
  label: 'Price mod.',
  hint: 'Multiplies the price of every lot of this, in the active price modifier profile — 1.1 marks them up a tenth, 0.9 down, 0 makes them free; blank leaves them alone',
  kind: 'component',
  component: CellPriceModifier,
  width: '110px',
  sort: 'priceModifier'
}

/**
 * Categories, as the original draws them: type, how many items are in it, and
 * the name with its id after it. The count leads to those items —
 * `narrowToCategoryItems` — and the name to `Everything` filed under the
 * category, the name being the category's own identity rather than a count of
 * the one population its Items column already names. Type narrows this same
 * table — a category row carries its own `typeId` — rather than leaving for
 * the item types table and losing whatever this list was narrowed to.
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
    click: (row, options) => narrowBy('type', String(row.fields.typeId ?? ''), options)
  },
  {
    key: 'items',
    label: 'Items',
    hint: 'How many items are filed under this category — the catalogue’s under one of BrickLink’s, yours under one of your own',
    kind: 'component',
    component: CellCount,
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => narrowToCategoryItems(row)
  },
  /*
   * A box on a category of somebody's own, and plain text on BrickLink's: the
   * table lists both — see [categoryRows] — and the one column has to draw
   * both. [CellUserText] tells them apart by the row, so a name that can be
   * changed is the only one offered a box, and the box is what says which
   * rows are theirs.
   */
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    kind: 'component',
    component: CellUserText,
    width: '300px',
    sort: 'name',
    click: (row) => narrowTo(null, 'category', String(row.fields.category ?? ''))
  },
  priceModifierColumn
]

/**
 * The items filed under a category, on whichever table holds them.
 *
 * A category of somebody's own holds only items of their own — no catalogue
 * item names a negative category — so pressing it opens their items table
 * narrowed to it, where pressing one of BrickLink's opens the catalogue's.
 * The term is the same either way; only the table it is read against differs.
 */
function narrowToCategoryItems(row: ShellRow) {
  narrowTo(
    row.fields.own === true ? 'userItems' : 'items',
    'category',
    String(row.fields.category ?? '')
  )
}

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
 *
 * `Lots` and `Quantity` are the conditions table's pair, and blank for the
 * same reason its are: they count the lots a query reached through — an
 * item's, a seller's, a region's — and an un-narrowed list of colours has
 * reached none. See `joined` in the source, and [reach].
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
    // The colour's own scope term, `colorid:`, which is what the lots and the
    // colour items are addressed by and what the header names a colour from.
    // It wrote `id:` once, which is brickzuke's own key for the colour and,
    // on every table but the colours', the items table's name for an item.
    // Nothing at all for a colour BrickLink has no id for: no term can name
    // it, and `narrowBy` writes none for an empty value.
    click: (row, options) => narrowBy('colorid', String(row.fields.colorid ?? ''), options)
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
    key: 'lots',
    label: 'Lots',
    hint: 'Listings in this colour among the lots the query reached, not BrickLink’s own total',
    width: '90px',
    sort: 'lots',
    format: counted,
    click: (row) => narrowTo('inventories', 'colorid', String(row.fields.colorid ?? ''))
  },
  {
    key: 'quantity',
    label: 'Quantity',
    hint: 'Every piece inside those lots, counted one by one',
    width: '125px',
    sort: 'quantity',
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
  },
  priceModifierColumn
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
    // The type's own identity rather than a count, so it pivots to
    // `Everything` narrowed to it — the Items and Categories columns beside
    // it are what lead to those two populations.
    click: (row) => narrowTo(null, 'type', String(row.fields.type ?? ''))
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
  },
  priceModifierColumn
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
    click: (row, options) => narrowBy('type', String(row.fields.type ?? ''), options)
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
    click: (row, options) => narrowBy('category', String(row.fields.category ?? ''), options)
  },
  {
    key: 'color',
    label: 'Color',
    width: '100px',
    sort: 'color',
    click: (row, options) => narrowBy('colorid', String(row.fields.colorid ?? ''), options)
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
    click: (row, options) => narrowBy('type', String(row.fields.type ?? ''), options)
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
    click: (row, options) => narrowBy('category', String(row.fields.category ?? ''), options)
  },
  {
    key: 'color',
    label: 'Color',
    width: '100px',
    sort: 'color',
    click: (row, options) => narrowBy('colorid', String(row.fields.colorid ?? ''), options)
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
  // One item, whichever way the query names it: a `record:` spelling the
  // BrickLink record, or the `id:` a press on the items table writes — the
  // same two the lots read as what to fetch, see [namesItem].
  item: ['record', 'id'],
  color: ['colorid'],
  // A record's category never varies row to row, whether it is pinned
  // directly or through the one record it names.
  categoryName: ['category', 'record'],
  countryName: ['country', 'store'],
  storeName: ['store'],
  feedback: ['store'],
  conditionName: ['condition'],
  country: ['country'],
  provinceName: ['province'],
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
  return columns.map((column) =>
    column.key === 'priceValue'
      ? {
        ...column,
        hint: `What one piece costs in ${currency}, converted from what the seller charges`
      }
      : column.key === 'modPrice'
        ? {
          ...column,
          hint: `That price in ${currency} times every price modifier that applies to this lot — hover for the working`
        }
        : column
  )
}

/** The expression the shell is showing, which is the one in the URL. */
const openExpr = computed(() => String(router.currentRoute.value.query[PARAM_EXPR] ?? ''))

/**
 * What sellers have on offer — the original's `inventories` columns in its own
 * order: the lot's picture, its price, what it is, the seller's note on it,
 * where the seller is, who they are, the condition, how many and their
 * feedback.
 *
 * Country, store, colour and condition all narrow this same table — a lot
 * carries each of them — so a press keeps the reader where they are, on the
 * lots, with one more constraint over them. The column pressed then goes, the
 * query having settled it: see [SETTLED_BY].
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
  // The same figure with the price modifiers on this lot applied — its
  // colour's, its seller's, its category's — and the working on hover. Beside
  // the price because it is read against it. See [priceModifiers].
  {
    key: 'modPrice',
    kind: 'component',
    component: CellPrice,
    label: 'Mod. price',
    hint: 'The price times every price modifier that applies to this lot — hover for the working',
    width: '115px',
    sort: 'modPrice'
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
    key: 'categoryName',
    role: 'reference',
    label: 'Category',
    width: '150px',
    sort: 'categoryName',
    click: (row, options) => narrowBy('category', String(row.fields.category ?? ''), options)
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
    click: (row, options) => narrowBy('colorid', String(row.fields.colorid ?? ''), options)
  },
  {
    key: 'countryName',
    role: 'reference',
    label: 'Country',
    hint: 'Where the seller is, which is where the parcel comes from',
    width: '120px',
    sort: 'countryName',
    click: (row, options) => narrowBy('country', String(row.fields.country ?? ''), options)
  },
  {
    key: 'storeName',
    role: 'reference',
    label: 'Store',
    width: '200px',
    sort: 'storeName',
    // This seller's lots among the ones on screen, not the seller's row on the
    // stores table: the question a press asks is "what else of this do they
    // have", and the answer is on this table with `store:` pinned. The seller
    // and everything the seller settles — country, feedback — then stand
    // down, see [SETTLED_BY].
    click: (row, options) => narrowBy('store', String(row.fields.store ?? ''), options)
  },
  {
    key: 'conditionName',
    label: 'Condition',
    hint: 'New or Used, as the seller graded the lot',
    width: '130px',
    sort: 'conditionName',
    click: (row, options) => narrowBy('condition', String(row.fields.condition ?? ''), options)
  },
  {
    key: 'quantity',
    label: 'Quant.',
    hint: 'How many pieces are in this one lot, all at the price beside it',
    width: '110px',
    sort: 'quantity',
    format: counted
  },
  // The one column here that is somebody's own: how many of the lot are in
  // the active cart, as the box that changes it. Beside the seller's quantity
  // because it is capped by it, and because the two are read together — how
  // many there are, how many to take. See [CellCartQuantity]; and over it the
  // whole column at once, Max, 0, Apply and Reset — see [CartHeader], which is
  // what the width is for.
  {
    key: 'cartQuantity',
    label: 'Cart',
    hint: 'How many of this lot to put in the active cart — pick the cart in Settings',
    kind: 'component',
    component: CellCartQuantity,
    header: CartHeader,
    // Room for the label and the four buttons — all four fixed words, not
    // "Apply 3,002": a header the shell cannot fit is a header it cuts to an
    // ellipsis, and Max with nothing ticked can propose thousands of rows, a
    // count with no bound to hold a width budget to. See [CartHeader].
    width: '340px',
    sort: 'cartQuantity'
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
    // Its own identity, not the count beside it, so it pivots to `Everything`
    // narrowed to it rather than to the lots the Lots column counts.
    click: (row) => narrowTo(null, 'condition', String(row.fields.condition ?? ''))
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
  },
  priceModifierColumn
]

/**
 * The years the catalogue covers, and how many items came out in each.
 *
 * The count leads to those items, which is what every count in this schema
 * does — see the categories table, where the same press is the whole point of
 * the column. The year itself, being the row's own identity rather than a
 * count, leads to `Everything` narrowed to it instead.
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
    click: (row) => narrowTo(null, 'year', String(row.fields.name ?? ''))
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
    // is a setting nobody can look up, and there are three of them — the room
    // costs nothing that a fourteen-column catalogue table would miss.
    width: '330px',
    sort: 'name'
  },
  {
    key: 'value',
    label: 'Value',
    kind: 'component',
    component: CellSetting,
    // What the cell's text is, where the cell is text rather than the control
    // — `5000 ms`, as the control itself writes it.
    format: (value, row) => [value, row.fields.unit].filter(Boolean).join(' '),
    // Room for a country's name in the picker, not only five figures in the
    // number field — `United Kingdom` is the widest value a setting takes.
    width: '200px'
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
    // The region's own identity, not the count beside it, so it pivots to
    // `Everything` narrowed to it rather than to the countries the Countries
    // column counts.
    click: (row) => narrowTo(null, 'region', String(row.fields.region ?? ''))
  },
  {
    key: 'countries',
    label: 'Countries',
    hint: 'How many countries with sellers in them this part of the world holds',
    width: '135px',
    sort: 'countries',
    format: counted,
    click: (row) => narrowTo('countries', 'region', String(row.fields.region ?? ''))
  },
  priceModifierColumn
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
  // The flag and the name as one cell — see [CellFlag]. `narrowingTo` rather
  // than a row press: rows stopped taking presses of their own once brickzuke
  // moved the hand back onto the cells that lead somewhere, and this is the one
  // cell whose whole job is leading to the record itself — `region:"Europe"`
  // and all, on top of whatever the screen already asked. The count beside it
  // narrows to the sellers instead.
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    kind: 'component',
    component: CellFlag,
    width: '220px',
    sort: 'name',
    click: (row, options) => narrowingTo(row)?.(options)
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
    // Narrows the countries on screen to that region, as `provinceColumns`
    // does with the same field — a country row carries `region` itself, so
    // pressing it need not leave for the regions table and lose the rest of
    // whatever this list was narrowed to.
    click: (row, options) => narrowBy('region', String(row.fields.region ?? ''), options)
  },
  priceModifierColumn
]

/**
 * The provinces a country's sellers are grouped under — the directory's own
 * grouping, for the countries it groups at all.
 *
 * Between a country and its sellers, and derived from the sellers rather than
 * fetched: BrickLink lists no provinces of its own, so `stores` here is a
 * count over the sellers stored rather than a number off a page — see
 * `provincesOf` — and a province nobody has fetched the country of is not
 * here yet.
 */
export const provinceColumns: ColumnDef[] = [
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
    // The country as well as the province, so whichever table fetches sellers
    // by country still does and the header names both. `Everything` rather
    // than the sellers table, being the province's own identity and not a
    // count of the sellers the Stores column already leads to.
    click: (row) => openWith(null, provinceTerms(row))
  },
  {
    key: 'countryName',
    role: 'reference',
    label: 'Country',
    width: '140px',
    sort: 'countryName',
    // Narrows the provinces on screen to that country, as the sellers table does
    // with the same field — a province row carries `country` itself.
    click: (row, options) => narrowBy('country', String(row.fields.country ?? ''), options)
  },
  {
    key: 'stores',
    label: 'Stores',
    hint: 'How many of the sellers fetched so far are in this province',
    width: '110px',
    sort: 'stores',
    format: counted,
    click: (row) => openWith('stores', provinceTerms(row))
  },
  {
    key: 'items',
    label: 'Items',
    hint: 'Every piece those sellers have for sale, counted one by one and added up',
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => openWith('stores', provinceTerms(row))
  },
  {
    key: 'region',
    role: 'reference',
    label: 'Region',
    hint: 'The part of the world BrickLink groups the country under',
    width: '140px',
    sort: 'region',
    // Narrows the provinces on screen to that region, as `countryColumns` does
    // with the same field — a province row carries `region` itself.
    click: (row, options) => narrowBy('region', String(row.fields.region ?? ''), options)
  },
  priceModifierColumn
]

/**
 * The expression that opens one province's sellers: the country, which is
 * what fetches the page, and the province, which narrows it.
 */
function provinceTerms(row: ShellRow): string {
  return `country:"${String(row.fields.country ?? '')}" province:"${String(row.fields.province ?? '')}"`
}

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
    // Narrows the sellers on screen to that country, as `storeInventoryColumns`
    // already does with the same field — a store row carries `country` itself,
    // so pressing it need not leave for the countries directory and lose the
    // rest of whatever this list was narrowed to.
    click: (row, options) => narrowBy('country', String(row.fields.country ?? ''), options)
  },
  {
    key: 'provinceName',
    role: 'reference',
    label: 'Province',
    hint: 'The province the directory groups the seller under — blank where it does not group the country at all',
    width: '125px',
    sort: 'provinceName',
    // The key rather than the name: a name alone is not one province — see
    // `provinceId` — and the key is what the provinces table is scoped by.
    click: (row, options) => narrowBy('province', String(row.fields.province ?? ''), options)
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
    click: (row, options) => narrowBy('store', String(row.fields.store ?? ''), options)
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
  },
  priceModifierColumn
]

/**
 * The ways a seller will send an order, off the policy their store front
 * draws its Terms tab from.
 *
 * What BrickLink states as data about shipping, which is the method and who
 * it is offered to — `Domestic` for buyers in the seller's own country,
 * `International` for everyone else — and never the charge. The charge is
 * the next table's, read out of the prose.
 */
export const shippingMethodColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'storeName',
    role: 'reference',
    label: 'Seller',
    width: '200px',
    sort: 'storeName',
    click: (row, options) => narrowBy('store', String(row.fields.store ?? ''), options)
  },
  {
    key: 'countryName',
    role: 'reference',
    label: 'Country',
    hint: 'Where the seller is, which is what “Domestic” means for them',
    width: '130px',
    sort: 'countryName',
    click: (row, options) => narrowBy('country', String(row.fields.country ?? ''), options)
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Method',
    width: '240px',
    sort: 'name'
  },
  {
    key: 'reach',
    label: 'Offered to',
    hint: 'Buyers in the seller’s own country, buyers everywhere else, or both',
    width: '135px',
    sort: 'reach'
  },
  {
    key: 'note',
    label: 'Note',
    hint: 'What the seller wrote beside the method, which is theirs to write and often empty',
    width: '320px',
    sort: 'note'
  },
  {
    key: 'shipsTo',
    label: 'Ships to',
    hint: 'How many countries the seller ships to — blank where they declared none, which BrickLink shows as everywhere',
    width: '100px',
    sort: 'shipsTo',
    format: counted,
    muted: true
  }
]

/**
 * What a seller says shipping costs, as far as it can be read.
 *
 * BrickLink holds a seller's charges as prose and nowhere as data, so every
 * row here is a reading of a sentence — see [shipping-terms] — and the
 * sentence is the last column, for checking the reading against. A rate is
 * where to, how heavy an order it covers, what it costs and in what.
 */
export const shippingCostColumns: ColumnDef[] = [
  {
    key: 'ordinal',
    kind: 'ordinal',
    label: '#',
    width: '48px'
  },
  {
    key: 'storeName',
    role: 'reference',
    label: 'Seller',
    width: '200px',
    sort: 'storeName',
    click: (row, options) => narrowBy('store', String(row.fields.store ?? ''), options)
  },
  {
    key: 'countryName',
    role: 'reference',
    label: 'Country',
    hint: 'Where the seller is',
    width: '130px',
    sort: 'countryName',
    click: (row, options) => narrowBy('country', String(row.fields.country ?? ''), options)
  },
  {
    key: 'destination',
    role: 'identity',
    label: 'Destination',
    hint: 'Where the rate applies, in the seller’s own words — the heading the line sat under',
    width: '220px',
    sort: 'destination'
  },
  {
    key: 'applies',
    label: 'To you',
    hint: 'Whether this is one of the rates for the “Ship to” country — the closest heading the seller wrote to it, as read by brickzuke',
    width: '80px',
    sort: 'applies'
  },
  {
    key: 'label',
    label: 'Method',
    hint: 'What the seller called the rate, where they named it',
    width: '160px',
    sort: 'label'
  },
  // The cost before the bounds on it: what a rate is read for, and the number
  // a card's tile shows, the tile taking the first figure after the name.
  {
    key: 'cost',
    role: 'metric',
    label: 'Cost',
    hint: 'What the seller wrote, in the seller’s currency — not converted',
    kind: 'component',
    component: CellPrice,
    // The figure with its currency, where the cell is text rather than the
    // component — the home screen's pill says `49.99 EUR`, not `49.99 cost`.
    format: (value, row) => [value, row.fields.currency].filter(Boolean).join(' '),
    width: '90px',
    sort: 'cost'
  },
  {
    key: 'currency',
    label: 'Currency',
    width: '100px',
    sort: 'currency',
    muted: true
  },
  {
    key: 'minWeight',
    label: 'From (g)',
    hint: 'The lightest order the rate starts at, in grams',
    width: '90px',
    sort: 'minWeight',
    muted: true
  },
  {
    key: 'maxWeight',
    label: 'Up to (g)',
    hint: 'The heaviest order the rate covers, in grams — the grams themselves, a band being read against a scale',
    width: '90px',
    sort: 'maxWeight'
  },
  {
    key: 'minValue',
    label: 'Order from',
    hint: 'The order value the rate starts at, where the seller bounded it — free postage over a value is a nought from there',
    width: '115px',
    sort: 'minValue',
    muted: true
  },
  {
    key: 'maxValue',
    label: 'Order up to',
    hint: 'The dearest order the rate applies to, where the seller bounded it',
    width: '115px',
    sort: 'maxValue',
    muted: true
  },
  {
    key: 'source',
    label: 'As written',
    hint: 'The line the rate was read off, as the seller wrote it — the reading is a guess and this is what to check it against',
    width: '400px',
    sort: 'source',
    muted: true
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
 * The one count `setCounts` writes straight onto the table it belongs to,
 * rather than into the per-query `counts` map: item types do not narrow with
 * the query.
 */
function tableCount(id: string): number | undefined {
  return itemTypes.value.find((table) => table.id === id)?.count
}

/**
 * A population of one of the browse-filled types, as [catalogCounts] counts
 * them.
 *
 * Stated on the same terms `population` states the bulk four — abbreviated,
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
 * card reading "Item records" beside the four brickzuke counts would be a card
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
/*
 * And the three details over somebody's own lists, on the same rule: declared
 * exactly while the URL is on them. See [userSchema].
 */
const openShopListItems = computed(() => openEntity.value === 'shopListItems')
const openShopPlan = computed(() => openEntity.value === 'shopPlan')
const openShopStores = computed(() => openEntity.value === 'shopStores')
/* And the lots in one cart, on the same rule. */
const openCartLines = computed(() => openEntity.value === 'cartLines')

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

/**
 * The open set's parts. Named `create` and `delete` only while the set is one
 * of theirs: a part can be added to what they designed and not to what
 * BrickLink states, and the shell draws the bar and the ticks from these two
 * fields alone. Computed from the URL for that reason, where the two types
 * beside it are constants.
 */
const inventoryEntity = computed<EntitySchema>(() => ({
  key: 'inventory',
  label: 'Inventory',
  count: '',
  ...(openedOwnSet(openExpr.value)
    ? {
      create: 'Add part',
      delete: 'Delete'
    }
    : {}),
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
      key: 'part',
      label: 'Record'
    },
    {
      key: 'color',
      label: 'Color'
    },
    {
      key: 'colorid',
      label: 'Color id'
    },
    {
      key: 'quantity',
      label: 'Quantity'
    }
  ]
}))

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
      // The catalogue's count and theirs together, this being the one table
      // that lists both. Reading `userCounts` here is also what rebuilds the
      // schema after one of theirs is written, which is what makes the new row
      // appear — see [userCounts].
      count: population(
        (selectedCounts.value?.categories ?? 0) + (userCounts.value.userCategories ?? 0)
      ),
      /*
       * The one catalogue type that can be added to and taken from. What is
       * made is a category of theirs, which is a row of this table; what can
       * be deleted is only such a row — the handler leaves BrickLink's alone
       * whatever is ticked. See [userWrites].
       */
      create: 'New category',
      delete: 'Delete',
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
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
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
          key: 'lots',
          label: 'Lots'
        },
        {
          key: 'quantity',
          label: 'Quantity'
        },
        {
          key: 'yearFrom',
          label: 'Year from'
        },
        {
          key: 'yearTo',
          label: 'Year to'
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
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
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
        }
      ]
    },
    {
      key: 'items',
      label: 'Items',
      // The field every other record carries this item's id in — `id`, on a
      // lot of any store's or a set's own inventory, because that is what
      // `toRow` names it and an expression field is read verbatim. Declaring
      // it is what lets the header say `item: Tile 6 x 6` where the query
      // says `id:"21971"` — `scopeLabel` says "item" in place of the field's
      // own bare name, which reads as nothing to a reader.
      scope: 'id',
      scopeLabel: 'item',
      // The catalogue's count and theirs, this table listing both — and
      // reading `userCounts` is what rebuilds the schema after one of theirs
      // is written. See [userCounts].
      count: population((selectedCounts.value?.items ?? 0) + (userCounts.value.userItems ?? 0)),
      /*
       * The second catalogue type that can be added to and taken from. What
       * is made is an item of theirs, a row of this table; what can be
       * deleted is only such a row — see [userWrites].
       */
      create: 'New item',
      delete: 'Delete',
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
        // As with `parts`: sorted over what the fold over held lots knew when
        // the scan ran — see [storeInventoryCounts].
        {
          key: 'storeInventory',
          label: 'Store inventories'
        },
        {
          key: 'weight',
          label: 'Weight'
        },
        {
          key: 'dimensions',
          label: 'Dimensions'
        },
        {
          key: 'note',
          label: 'Note'
        }
      ]
    },
    /**
     * The rest of what brickzuke has tables for: the parts a set is made of
     * and the lots a seller has for sale, BrickLink's stores and where in the
     * world they are, and the cross-sections the original slices all of it by.
     *
     * These are `view/stores/models.ts`'s. That is the older of brickzuke's
     * two models and it lists nine tables beside the four `model.ts` counts —
     * a schema built from the second file alone drops the stores, the
     * countries and the inventories, and states the catalogue as the bulk
     * downloads rather than as the catalogue.
     *
     * In that file's order, and counted by [catalogCounts] rather than by
     * `setCounts` — the latter counts the four stores the bulk downloads fill,
     * and every one of these is filled by browsing instead: a set opened, a
     * country asked about. So the number on the card is how much of each has
     * been fetched so far, which is exactly what its table shows.
     *
     * Until something has been fetched that number is zero, and zero is drawn
     * as no count at all: a card reading `0` for a type nobody has asked about
     * states a number brickzuke never gave. That is the same rule `population`
     * follows for the bulk four while their counts are still running.
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
      facets: [
        {
          kind: 'range',
          key: 'quantity',
          label: 'Quantity',
          min: 0,
          max: 1_000
        },
        {
          kind: 'range',
          key: 'priceValue',
          label: 'Price',
          min: 0,
          max: 1_000
        }
      ],
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
          key: 'categoryName',
          label: 'Category'
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
          key: 'cartQuantity',
          label: 'Cart'
        },
        {
          key: 'feedback',
          label: 'Feedback'
        },
        {
          key: 'modPrice',
          label: 'Mod. price'
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
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
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
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
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
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
        }
      ]
    },
    {
      // The key a seller carries its province under — the country code and
      // the name together, since a name alone is not one province.
      key: 'provinces',
      label: 'Provinces',
      scope: 'province',
      count: browsed('provinces'),
      facets: [],
      tabs: [],
      samples: [],
      columns: informative(provinceColumns, openExpr.value),
      sorts: [
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'countryName',
          label: 'Country'
        },
        {
          key: 'stores',
          label: 'Stores'
        },
        {
          key: 'items',
          label: 'Items'
        },
        {
          key: 'region',
          label: 'Region'
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
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
          key: 'provinceName',
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
        },
        {
          key: 'priceModifier',
          label: 'Price mod.'
        }
      ]
    },
    /*
     * A seller's terms, after the seller. Neither declares a scope: a method
     * and a rate are things a seller has, not things anything else carries
     * the id of, and both are reached by narrowing to the seller.
     */
    {
      key: 'shippingMethods',
      label: 'Shipping methods',
      count: browsed('shippingMethods'),
      facets: [],
      tabs: [],
      samples: [],
      columns: informative(shippingMethodColumns, openExpr.value),
      sorts: [
        {
          key: 'storeName',
          label: 'Seller'
        },
        {
          key: 'countryName',
          label: 'Country'
        },
        {
          key: 'name',
          label: 'Method'
        },
        {
          key: 'reach',
          label: 'Offered to'
        },
        {
          key: 'note',
          label: 'Note'
        },
        {
          key: 'shipsTo',
          label: 'Ships to'
        }
      ]
    },
    {
      key: 'shippingCosts',
      label: 'Shipping costs',
      count: browsed('shippingCosts'),
      facets: [],
      tabs: [],
      samples: [],
      columns: informative(shippingCostColumns, openExpr.value),
      sorts: [
        {
          key: 'storeName',
          label: 'Seller'
        },
        {
          key: 'countryName',
          label: 'Country'
        },
        {
          key: 'destination',
          label: 'Destination'
        },
        {
          key: 'applies',
          label: 'To you'
        },
        {
          key: 'label',
          label: 'Method'
        },
        {
          key: 'minWeight',
          label: 'From (g)'
        },
        {
          key: 'maxWeight',
          label: 'Up to (g)'
        },
        {
          key: 'cost',
          label: 'Cost'
        },
        {
          key: 'currency',
          label: 'Currency'
        },
        {
          key: 'minValue',
          label: 'Order from'
        },
        {
          key: 'maxValue',
          label: 'Order up to'
        },
        {
          key: 'source',
          label: 'As written'
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
    /*
     * And the types nobody scraped, last on the wall: somebody's own
     * categories, items and sets, the shopping lists they buy the parts from,
     * and the carts they put lots in. Standing types like the catalogue's own
     * — each with a card, a table and a population — and the first here that
     * are also written from the screen that draws them. See [userSchema].
     */
    ...standingUserEntities(),
    ...(openItemRecords.value || recordNamed.value ? [itemRecordsEntity] : []),
    ...(openInventory.value ? [inventoryEntity.value] : []),
    ...(openColorItems.value ? [colorItemsEntity] : []),
    ...(openShopListItems.value ? [shopListItemsEntity] : []),
    ...(openShopPlan.value ? [shopPlanEntity] : []),
    ...(openShopStores.value ? [shopStoresEntity] : []),
    ...(openCartLines.value ? [cartLinesEntity] : [])
  ]
}))
