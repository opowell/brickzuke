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
  const colorId = String(row.fields.colorId ?? '')
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
    click: (row) => narrowTo('items', 'category', String(row.fields.category ?? ''))
  },
  {
    key: 'color',
    label: 'Color',
    width: '90px',
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
    click: (row) => narrowTo('items', 'category', String(row.fields.categoryId ?? ''))
  },
  {
    key: 'name',
    role: 'identity',
    label: 'Name',
    width: '300px',
    sort: 'name',
    click: (row) => narrowTo('items', 'category', String(row.fields.categoryId ?? ''))
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
    format: counted,
    click: (row) => narrowToColor('S', row)
  },
  {
    key: 'wanted',
    label: 'Wanted',
    width: '90px',
    format: counted
  },
  {
    key: 'forSale',
    label: 'For sale',
    width: '90px',
    format: counted
  },
  {
    key: 'yearFrom',
    label: 'Year from',
    width: '90px'
  },
  {
    key: 'yearTo',
    label: 'Year to',
    width: '90px'
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
    click: (row) => narrowTo('items', 'type', String(row.fields.code ?? ''))
  },
  {
    key: 'items',
    label: 'Items',
    kind: 'component',
    component: CellCount,
    width: '100px',
    sort: 'items',
    format: counted,
    click: (row) => narrowTo('items', 'type', String(row.fields.code ?? ''))
  },
  {
    key: 'categories',
    label: 'Categories',
    kind: 'component',
    component: CellCount,
    width: '110px',
    format: counted,
    click: (row) => narrowTo('categories', 'type', String(row.fields.code ?? ''))
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
 * Every type brickzuke counts, in the order its own home screen lists them.
 *
 * Only `items` has columns and a source behind it — this prototype moves one
 * table. The other four are here because the home screen is a summary of the
 * whole catalogue, and a summary missing four of its five lines is not one.
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
      key: 'name',
      label: 'Name'
    },
    {
      key: 'year',
      label: 'Year'
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
      key: 'name',
      label: 'Item'
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
      key: 'name',
      label: 'Name'
    },
    {
      key: 'number',
      label: 'No.'
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
      count: population(selectedCounts.value?.categories),
      facets: [],
      tabs: [],
      samples: [],
      columns: categoryColumns,
      sorts: [
        {
          key: 'name',
          label: 'Name'
        },
        {
          key: 'items',
          label: 'Items'
        }
      ]
    },
    {
      key: 'colors',
      label: 'Colors',
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
        }
      ]
    },
    {
      key: 'itemTypes',
      label: 'Item types',
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
      // button that sorts by it.
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
    ...(openItemRecords.value ? [itemRecordsEntity] : []),
    ...(openInventory.value ? [inventoryEntity] : []),
    ...(openColorItems.value ? [colorItemsEntity] : [])
  ]
}))
