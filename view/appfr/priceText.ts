/**
 * A price as the figure the tables show, in the units the reader chose.
 *
 * Every price brickzuke holds is in whole currency units — a lot at `0.05` is
 * five cents, a postage rate at `4.99` is what it says — and every price it
 * draws passes through here, so the one setting [priceUnits] turns all of
 * them at once: `0.05` shown as `5` in cents, or as `0.05` in euros. The
 * stored figures are never touched; this is how they are said.
 *
 * Which is why it is a function of the setting and not of the cell: the price
 * cell, the postage cell and the shipping cost's pill all draw a price, and a
 * reader who asked for cents asked for cents on all of them.
 */
import { priceUnitsChosen } from './settings'

/**
 * The figure, in the chosen units, with as many places as the number needs.
 *
 * Enough places to keep two figures, and never more than four: most of a bulk
 * seller's inventory is worth a fraction of a cent a piece, and two decimals
 * round all of that to a handful of values — `0.02` for anything from 0.015 to
 * 0.025, `0.00` for everything under half a cent. A column of those sorts
 * perfectly and says nothing, because the figure that separates one lot from
 * the next has been rounded off. Each tenth of the way down, one more place
 * goes on, so the second figure of the price survives however small it is:
 * `0.016` in euros, `1.6` in cents, not `0.02` or `2`.
 *
 * Trailing noughts are dropped once the figure is rounded — `3`, not `3.0`;
 * `0.2`, not `0.20` — so a column of whole cents is a column of whole
 * numbers, and the places only show where the price has something in them.
 *
 * `whole` is for a figure counted in whole cents — postage — which takes two
 * places in euros and none in cents, whatever its size.
 */
export function priceText(amount: number, whole = false): string {
  if (!Number.isFinite(amount)) {
    return ''
  }
  const size = Math.abs(amount)
  const places = whole ? 2 : size === 0 || size >= 0.1 ? 2 : size >= 0.01 ? 3 : 4
  const fixed = priceUnitsChosen() === 'cents'
    ? (amount * 100).toFixed(places - 2)
    : amount.toFixed(places)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

/**
 * The units a column of prices is in, said after the currency — `EUR` or
 * `EUR cents` — for a header or a pill that names them.
 */
export function priceUnitsPhrase(currency: string): string {
  return priceUnitsChosen() === 'cents' ? `${currency} cents`.trim() : currency
}
