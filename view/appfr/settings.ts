/**
 * The knobs, and the one place their values live.
 *
 * A number that decides how hard brickzuke works on somebody's behalf should
 * not be a constant in a module they cannot see. These are the ones worth
 * turning, held where the colour scheme is already held — `localStorage`, per
 * browser, read synchronously so a schema computed from them needs no await —
 * and published as records so the shell can draw them as a table like any
 * other type.
 *
 * Numbers only, so far. A setting that is a number has one obvious control and
 * one obvious validation, and the two here are both counts of patience.
 */
import { useStorage } from '@vueuse/core'
import type { Ref } from 'vue'

/**
 * How many sellers in a row may add nothing new before the reach fill decides
 * it has seen what there is to see.
 *
 * The fill exists to sharpen a narrowed wall — see [reachFill] — and it stops
 * when it stops changing anything rather than at a number of sellers picked in
 * advance. This is what "stops changing anything" means: a shop whose lots
 * introduce no colour, condition, type or item the wall had not already reached
 * has moved nothing on screen, and enough of those in a row is the answer
 * having settled.
 *
 * Fifteen because the signal is noisy rather than clean: sellers differ enough
 * that two or three barren ones in a row prove nothing, and by fifteen the
 * common colours and categories are long since in. Turn it up to keep digging,
 * down to stop sooner.
 */
export const reachPatience = useStorage('brickzuke-reach-patience', 15)

/**
 * The gap the reach fill leaves between one seller and the next, in
 * milliseconds.
 *
 * These are somebody else's pages, fetched because a screen is open rather
 * than because anyone asked — so the pause is manners rather than mechanism,
 * and it is the reader's to set. Faster settles the wall sooner and asks
 * BrickLink harder.
 */
export const reachGapMs = useStorage('brickzuke-reach-gap-ms', 1_500)

/** One knob, as the table draws it. */
export interface Setting {
  /** The row's id, and what a `setting:` term names it by. */
  key: string
  name: string
  /** What turning it does, in the words the table shows. */
  detail: string
  value: Ref<number>
  min: number
  max: number
  /** What the value is counted in, for the cell to say after the number. */
  unit?: string
}

/**
 * Every setting, in the order the table lists them.
 *
 * A plain array rather than a map: this is a small, ordered, human-facing list,
 * and the table wants it in the order somebody would read it.
 */
export const SETTINGS: Setting[] = [
  {
    key: 'reachPatience',
    name: 'Barren sellers before stopping',
    detail:
      'How many sellers in a row may add nothing new before a narrowed home screen stops fetching more.',
    value: reachPatience,
    min: 1,
    max: 1_000
  },
  {
    key: 'reachGapMs',
    name: 'Pause between sellers',
    detail:
      'How long a narrowed home screen waits between one seller and the next while it fills itself in.',
    value: reachGapMs,
    min: 0,
    max: 60_000,
    unit: 'ms'
  }
]

/** One setting by key, for a cell that has only the row. */
export function settingFor(key: string): Setting | undefined {
  return SETTINGS.find((setting) => setting.key === key)
}

/**
 * Writes one, held to the range it declares.
 *
 * Clamped rather than refused: the control is a number field, so a reader can
 * type anything into it, and the nearest legal value is a better answer than
 * either a silent nought or a dialog.
 */
export function setSetting(key: string, value: number): void {
  const setting = settingFor(key)
  if (!setting || !Number.isFinite(value)) {
    return
  }
  setting.value.value = Math.min(setting.max, Math.max(setting.min, Math.round(value)))
}
