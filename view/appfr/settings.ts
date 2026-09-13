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
 * Two kinds: numbers, which have one obvious control and one obvious
 * validation, and a country, which is one of the directory's own and so is
 * picked rather than typed. Which kind a setting is decides which control the
 * value cell draws — see [CellSetting].
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

/**
 * The country an order would be posted to, as the code a seller and a lot both
 * carry — `DE` — or blank while nobody has said.
 *
 * What a seller charges to ship depends on where to, so a shipping cost is
 * not a number brickzuke can state until it knows this. Held as the code
 * rather than the name because the code is what the directory keys a country
 * by and what `country:"DE"` already reads as.
 */
export const shipTo = useStorage('brickzuke-ship-to', '')

/** What every knob states: its row's id, its name, and what turning it does. */
interface SettingBase {
  /** The row's id, and what a `setting:` term names it by. */
  key: string
  name: string
  /** What turning it does, in the words the table shows. */
  detail: string
}

/** A knob that is a number in a stated range. */
export interface NumberSetting extends SettingBase {
  kind: 'number'
  value: Ref<number>
  min: number
  max: number
  /** What the value is counted in, for the cell to say after the number. */
  unit?: string
}

/**
 * A knob that is one of the directory's countries, by code, or blank.
 *
 * The choices are not declared here: they are whatever countries the directory
 * has stored, which the cell reads for itself — see [CellSetting].
 */
export interface CountrySetting extends SettingBase {
  kind: 'country'
  value: Ref<string>
}

/** One knob, as the table draws it. */
export type Setting = NumberSetting | CountrySetting

/**
 * Every setting, in the order the table lists them.
 *
 * A plain array rather than a map: this is a small, ordered, human-facing list,
 * and the table wants it in the order somebody would read it.
 */
export const SETTINGS: Setting[] = [
  {
    kind: 'number',
    key: 'reachPatience',
    name: 'Barren sellers before stopping',
    detail:
      'How many sellers in a row may add nothing new before a narrowed home screen stops fetching more.',
    value: reachPatience,
    min: 1,
    max: 1_000,
    unit: 'sellers'
  },
  {
    kind: 'number',
    key: 'reachGapMs',
    name: 'Pause between sellers',
    detail:
      'How long a narrowed home screen waits between one seller and the next while it fills itself in.',
    value: reachGapMs,
    min: 0,
    max: 60_000,
    unit: 'ms'
  },
  {
    kind: 'country',
    key: 'shipTo',
    name: 'Ship to',
    detail:
      'The country an order would be posted to, which is what a seller’s shipping charge depends on.',
    value: shipTo
  }
]

/** One setting by key, for a cell that has only the row. */
export function settingFor(key: string): Setting | undefined {
  return SETTINGS.find((setting) => setting.key === key)
}

/**
 * Writes one, held to what it declares.
 *
 * A number is clamped rather than refused: the control is a number field, so a
 * reader can type anything into it, and the nearest legal value is a better
 * answer than either a silent nought or a dialog. A country is taken as the
 * code it is — the control is a picker, so what arrives is one of the choices
 * or blank — and a value of the wrong kind changes nothing.
 */
export function setSetting(key: string, value: number | string): void {
  const setting = settingFor(key)
  if (!setting) {
    return
  }
  if (setting.kind === 'country') {
    if (typeof value === 'string') {
      setting.value.value = value.trim()
    }
    return
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return
  }
  setting.value.value = Math.min(setting.max, Math.max(setting.min, Math.round(value)))
}
