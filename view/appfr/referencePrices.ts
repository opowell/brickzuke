/**
 * What a lot's price is held against, and the ratio that comes to.
 *
 * A lot's reference is the price of the same thing somewhere else: one
 * seller's — LEGO.com's, say — or a percentile of every lot the query
 * matches. "The same thing" is the item in the colour: a part's price in
 * one colour says nothing about it in another, and a set has one colour, so
 * the key is the record and the colour id together — see [referenceKey].
 * The condition is not in it: the query settles that where the reader wants
 * it settled, `condition:N`, and a store's reference is whatever it sells.
 *
 * The ratio is the lot's price over its reference — `ratio` on the row, a
 * lowercase field so `ratio<0.8` can be typed as a term. Blank where there is
 * no reference, which in a store's case is most lots: a seller stocks a
 * fraction of what the others do.
 *
 * Nothing here reads a store or a setting; the source works out which
 * references are wanted — see [referenced] in catalogSource — and this is the
 * arithmetic on them.
 */
import type { ShellRow } from 'header-content-layout'

/** The field the ratio is on, and the one a term or a sort names it by. */
export const RATIO = 'ratio'

/** A lot's item in its colour, as its reference is filed under — or nothing where it states no item. */
export function referenceKey(record: unknown, colorId: unknown): string | undefined {
  if (record === undefined || record === null || record === '') {
    return undefined
  }
  const colour = colorId === undefined || colorId === null || colorId === '' ? '' : Number(colorId)
  return `${String(record)}|${colour}`
}

/** A lot row's key — see [referenceKey]. */
export function referenceKeyOf(fields: Record<string, unknown>): string | undefined {
  return referenceKey(fields.record, fields.colorid)
}

/**
 * A lot row's price, or nothing where it has none to compare.
 *
 * Nothing for a lot at nought as well: a price the page never gave rather
 * than one anybody sells at. Few lots read so, but each one is a ratio of
 * nought at the head of a table sorted by the ratio, and a percentile pulled
 * towards free.
 */
function priceOf(fields: Record<string, unknown>): number | undefined {
  const price = fields.priceValue
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : undefined
}

/**
 * The `p`th percentile of these prices, sorted cheapest first, interpolated
 * between the two lots it falls between — so the median of an even count is
 * the mean of the middle two, as a reader would work it out.
 */
export function percentileOf(sorted: readonly number[], p: number): number | undefined {
  if (!sorted.length) {
    return undefined
  }
  const at = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1)
  const below = Math.floor(at)
  const above = Math.ceil(at)
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below)
}

/**
 * The prices of the lots seen so far, by item and colour, for a percentile
 * of them to be taken once the last has been seen.
 *
 * A number per lot rather than the lots: the walk over every stored lot is a
 * few hundred thousand of them, and a number is all the percentile needs.
 */
export interface PriceSpread {
  note(fields: Record<string, unknown>): void
  /** The `p`th percentile of each item and colour's prices. */
  references(p: number): Map<string, number>
}

export function priceSpread(): PriceSpread {
  const prices = new Map<string, number[]>()
  return {
    note(fields) {
      const key = referenceKeyOf(fields)
      const price = priceOf(fields)
      if (key === undefined || price === undefined) {
        return
      }
      const held = prices.get(key)
      if (held) {
        held.push(price)
      } else {
        prices.set(key, [price])
      }
    },
    references(p) {
      const references = new Map<string, number>()
      for (const [key, held] of prices) {
        const reference = percentileOf(held.sort((a, b) => a - b), p)
        if (reference !== undefined) {
          references.set(key, reference)
        }
      }
      return references
    }
  }
}

/** The `p`th percentile of these lots' prices, by item and colour. */
export function percentileReferences(rows: Iterable<ShellRow>, p: number): Map<string, number> {
  const spread = priceSpread()
  for (const row of rows) {
    spread.note(row.fields)
  }
  return spread.references(p)
}

/**
 * The lowest price per item and colour among these — a store's references,
 * where it sells the same thing twice, New and Used, being the one it will
 * let go for least.
 */
export function lowestReferences(
  lots: Iterable<{ record: unknown; colorId: unknown; price: number | undefined }>
): Map<string, number> {
  const references = new Map<string, number>()
  for (const lot of lots) {
    const key = referenceKey(lot.record, lot.colorId)
    if (key === undefined || lot.price === undefined || !Number.isFinite(lot.price) || lot.price <= 0) {
      continue
    }
    const held = references.get(key)
    if (held === undefined || lot.price < held) {
      references.set(key, lot.price)
    }
  }
  return references
}

/**
 * The lot's row with its reference and ratio on it, as a copy — the rows are
 * the caller's, and may be held by whatever else read them.
 *
 * No ratio where there is no reference, or where the lot has no price — see
 * [priceOf].
 */
export function withRatio(row: ShellRow, references: ReadonlyMap<string, number>): ShellRow {
  const key = referenceKeyOf(row.fields)
  const reference = key === undefined ? undefined : references.get(key)
  const price = priceOf(row.fields)
  return {
    ...row,
    fields: {
      ...row.fields,
      reference,
      [RATIO]: reference && price !== undefined ? price / reference : undefined
    }
  }
}

/**
 * A ratio as the column draws it: two places, `0.84`, and blank where there
 * is none — and two figures under a tenth, `0.0025`, where two places would
 * round a lot at a four-hundredth of the going rate to `0.00`. That lot is
 * the one a reader sorting by the ratio is looking for, and a column of
 * noughts cannot tell them which it is.
 */
export function ratioText(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }
  return value > 0 && value < 0.1 ? String(Number(value.toPrecision(2))) : value.toFixed(2)
}
