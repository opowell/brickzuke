/**
 * Which currency a column of prices is in.
 *
 * BrickLink converts every lot into whatever currency the viewer's account is
 * set to, and prints the sign in front of the figure — `EUR 0.016`, `US $0.13`.
 * Nothing here chooses it and no stored lot states it on its own, so the only
 * place it is written down is the prices themselves: one of them says what the
 * whole column is in, and the header can then say so too.
 *
 * A ref, because the schema is built long before any lot has been fetched. The
 * header takes the currency when it arrives and says what it can until then.
 */
import { ref } from 'vue'

/** The sign in front of the converted prices, or `''` before any is read. */
export const priceCurrency = ref('')

/**
 * Reads that sign off a price as BrickLink printed it, which is everything in
 * front of the digits — `EUR` from `EUR 0.016`, `US $` from `US $0.13`.
 *
 * The first price read settles it and the rest are ignored, which is two
 * things at once. Every converted price in a session is in the one currency,
 * so there is nothing for a second reading to add; and this is read while rows
 * are being built, off a value the header is drawn from, so a sign that could
 * change is a table that rebuilds itself every time it is drawn. Once is
 * enough and once terminates.
 *
 * Silent about anything it cannot read: a lot whose price never arrived leaves
 * the currency unset rather than settling it on nothing.
 */
export function notePriceCurrency(printed: unknown): void {
  if (priceCurrency.value) {
    return
  }
  const sign = (/^[^\d]+/.exec(String(printed ?? ''))?.[0] ?? '').trim()
  if (sign) {
    priceCurrency.value = sign
  }
}
