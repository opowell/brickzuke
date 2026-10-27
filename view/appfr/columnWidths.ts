/*
 * Every column width in the catalogue, in one place. A column is as wide as
 * its key says in [WIDTHS] in every table that has it — Color is Color
 * wherever it is shown — unless the table names its own width in [OVERRIDES],
 * as it does where the same key holds different things: a year's name is four
 * figures, an item's is a sentence.
 *
 * A width has to hold the heading as well as the value, at the 18px the app is
 * read at. Where the heading is the longer of the two, the width is sized for
 * the heading: a table whose headings are cut short cannot say what it is
 * showing.
 */
import type { ColumnDef } from 'appfr'

const WIDTHS: Record<string, string> = {
  applies: '80px',
  // Room for the label and the four buttons — all four fixed words, not
  // "Apply 3,002": a header the shell cannot fit is a header it cuts to an
  // ellipsis, and Max with nothing ticked can propose thousands of rows, a
  // count with no bound to hold a width budget to. See [CartHeader].
  cartQuantity: '340px',
  categories: '145px',
  category: '200px',
  categoryName: '160px',
  color: '141px',
  colorid: '95px',
  conditionName: '130px',
  cost: '90px',
  countries: '135px',
  country: '120px',
  countryName: '140px',
  currency: '100px',
  description: '200px',
  destination: '220px',
  // This column *is* the documentation, so it is sized to hold a sentence
  // rather than to fit a column of them.
  detail: '900px',
  // Sized for the heading: `2 x 4` is narrower than Dimensions.
  dimensions: '150px',
  feedback: '135px',
  forSale: '120px',
  image: '100px',
  instantCheckout: '190px',
  item: '280px',
  items: '100px',
  label: '160px',
  lots: '90px',
  maxValue: '115px',
  maxWeight: '90px',
  minValue: '115px',
  minWeight: '90px',
  modPrice: '150px',
  name: '300px',
  note: '220px',
  number: '110px',
  ordinal: '48px',
  part: '130px',
  parts: '100px',
  priceModifier: '110px',
  // Wide enough for the heading with its sort arrow and the button's own
  // room around it — see ItemsShell's `.dc-table__sort` rule for what happens
  // to one that is not.
  priceValue: '105px',
  provinceName: '125px',
  quantity: '125px',
  ratio: '145px',
  reach: '135px',
  record: '150px',
  region: '140px',
  sets: '90px',
  shipsTo: '100px',
  source: '400px',
  storeInventory: '160px',
  storeName: '200px',
  stores: '110px',
  // Sized for the heading: `S` is narrower than Type.
  type: '95px',
  // Room for a country's name in the picker, not only five figures in the
  // number field — `United Kingdom` is the widest value a setting takes.
  value: '200px',
  wanted: '120px',
  // Sized for the heading: a dash or `2.52` is narrower than Weight (g).
  weight: '110px',
  year: '95px',
  yearFrom: '135px',
  yearTo: '115px'
}

/** Per table, by the name its columns are exported under less `Columns`. */
const OVERRIDES: Record<string, Record<string, string>> = {
  color: {
    name: '200px'
  },
  colorItem: {
    image: '120px'
  },
  condition: {
    name: '130px'
  },
  country: {
    name: '220px'
  },
  image: {
    image: '200px',
    record: '160px'
  },
  item: {
    image: '180px'
  },
  itemInventory: {
    name: '280px',
    record: '110px'
  },
  itemRecord: {
    image: '180px'
  },
  itemType: {
    name: '160px'
  },
  province: {
    name: '200px'
  },
  region: {
    name: '200px'
  },
  // Wide enough for the longest name here to stand whole. A setting cut short
  // is a setting nobody can look up, and there are three of them — the room
  // costs nothing that a fourteen-column catalogue table would miss.
  settings: {
    name: '330px'
  },
  shippingMethod: {
    name: '240px',
    note: '320px'
  },
  store: {
    name: '220px'
  },
  storeInventory: {
    image: '70px'
  },
  year: {
    name: '95px'
  }
}

/** [columns], each as wide as [OVERRIDES] or [WIDTHS] says for [table]. */
export function sized(table: string, columns: ColumnDef[]): ColumnDef[] {
  return columns.map((column) =>
    column.key ? {
      ...column,
      width: OVERRIDES[table]?.[column.key] ?? WIDTHS[column.key]
    } : column
  )
}
