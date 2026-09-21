/**
 * Which BrickLink records each item has turned out to stand for.
 *
 * An item is brickzuke's own row and its records are BrickLink's — `S-8813-1`
 * under item 6658 — and a query written as `id:6658` names the item without
 * saying which kind of thing it is. The source finds out when it reads the
 * item's records off the index (see `itemRecords` in [catalogSource]), and
 * what it found is worth keeping: whether the `Set` column of the item
 * inventories still says anything under that query turns on it, see
 * [namesOneSet] in [catalogSchema].
 *
 * A ref, as [priceCurrency] is, because the schema is built before any read
 * has run. The table is drawn with the column and drawn again without it
 * once the answer is in — which is once per item, the map keeping every
 * answer for the session.
 */
import { shallowRef, triggerRef } from 'vue'

/** The records of every item looked up so far, by the item's id. */
export const recordsOfItem = shallowRef(new Map<number, readonly string[]>())

/**
 * Notes what the index said an item's records are — every record of the
 * item, before any `type:` narrows them, so that what is kept is a fact
 * about the item and not about one query.
 *
 * Silent where nothing changed: this is called on every read of the item,
 * and the schema rebuilding on each of them is a table redrawn for nothing.
 */
export function noteRecordsOfItem(itemId: number, records: readonly string[]): void {
  const known = recordsOfItem.value.get(itemId)
  if (known && known.length === records.length && known.every((one, at) => one === records[at])) {
    return
  }
  recordsOfItem.value.set(itemId, [...records])
  triggerRef(recordsOfItem)
}

/** Drops every note, for a test that wants the schema not to know. */
export function forgetRecordsOfItem(): void {
  recordsOfItem.value = new Map()
}
