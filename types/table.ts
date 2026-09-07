import type { Filter } from './filter'

/**
 * A row as a table sees it.
 *
 * Tables are declared per view over different records — categories, colours,
 * item types, items — and one list holds them side by side, so a component
 * drawing any of them cannot state the type of the rows in front of it, and
 * neither can a column that is written against its own table's record.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableRow = any

/**
 * What pressing a cell narrows by: a whole filter, or the value on its own —
 * in which case the column's `clickKey` names the field it filters on.
 */
export type ClickValue = Filter | string | number | undefined
