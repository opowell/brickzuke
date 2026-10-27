/**
 * Whether a term's comparator names a value of its field, rather than
 * comparing against one.
 *
 * Both spellings do: `store:"x"` is the one brickzuke and older bookmarks
 * write, and `store="x"` is the one the shell writes for a press on a record
 * (appfr 0.52.0, which compares the id whole so that one id nested in another
 * is not taken for it). A source that reads a naming term as an address has
 * to read both, or a press on a seller opens every seller's lots.
 */
import type { Comparator } from 'appfr'

export function naming(comparator: Comparator): boolean {
  return comparator === ':' || comparator === '='
}

