/**
 * Which types have been opened, most recently first.
 *
 * The home screen lists every type brickzuke has a table for, in the schema's
 * own order — which is the catalogue's shape and not anyone's use of it. A
 * fourteen-card wall read top-left to bottom-right is a long way to the two or
 * three types someone actually keeps coming back to, and that order never
 * changes however many times they go there.
 *
 * So the cards remember. Opening a type puts it at the front, and the front is
 * where the home screen draws it next time; everything not yet opened keeps the
 * schema's order behind them. Nothing is hidden and no card is dropped — the
 * summary is still the whole catalogue, just led by the part of it in use.
 *
 * Kept in localStorage, because the point of it is the next visit rather than
 * this one. It is a convenience and never an answer: a browser that refuses
 * storage, or a first visit, simply gets the schema's order, which is what the
 * screen showed before this existed.
 */
import { ref } from 'vue'

/** Where the list is kept. Namespaced, the origin being shared with the app. */
const KEY = 'brickzuke.recentTypes'

/**
 * How many are remembered. More than the home screen has cards, so a full tour
 * of the catalogue is held whole, and bounded so the entry cannot grow without
 * end on the keys of types that no longer exist.
 */
const KEPT = 20

function read(): string[] {
  try {
    const held: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(held) ? held.filter((key): key is string => typeof key === 'string') : []
  } catch {
    // A private window, cleared site data, or a browser set to refuse storage.
    return []
  }
}

function write(keys: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(keys))
  } catch {
    // Storage full or refused. The order still holds for this session.
  }
}

/** The types opened, most recent first. */
export const recentTypes = ref<string[]>(typeof window === 'undefined' ? [] : read())

/**
 * One type opened, which puts it at the front.
 *
 * Called with whatever the URL names, including the detail types that are not
 * cards at all — an item's records, a seller's lots. Those cost nothing: the
 * ordering below only ever asks about the types the home screen is drawing, so
 * a key with no card is a key nothing matches.
 */
export function rememberType(entity: string) {
  if (!entity || recentTypes.value[0] === entity) {
    return
  }
  const next = [entity, ...recentTypes.value.filter((key) => key !== entity)].slice(0, KEPT)
  recentTypes.value = next
  write(next)
}

/**
 * The same types, led by the ones most recently opened.
 *
 * A stable rearrangement rather than a sort: the opened types come first in the
 * order they were last opened, and everything else follows in exactly the order
 * it was given — so a home screen nobody has used yet is the one the schema
 * declares.
 */
export function byRecency<T extends { key: string }>(entities: readonly T[]): T[] {
  const rank = new Map(recentTypes.value.map((key, at) => [key, at]))
  const recent = entities
    .filter((entity) => rank.has(entity.key))
    .sort((a, b) => rank.get(a.key)! - rank.get(b.key)!)
  return [...recent, ...entities.filter((entity) => !rank.has(entity.key))]
}

/** Drops what has been remembered — the home screen back to the schema's order. */
export function forgetTypes() {
  recentTypes.value = []
  write([])
}
