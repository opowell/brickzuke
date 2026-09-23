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
 * Five kinds: numbers, which have one obvious control and one obvious
 * validation; a country, which is one of the directory's own and so is picked
 * rather than typed; a record of somebody's own — a cart, a price modifier
 * profile — picked the same way; a choice among a few values declared here,
 * which has a default rather than a blank; and a line of text, for a name
 * there are too many of to pick from. Which kind a setting is decides which
 * control the value cell draws — see [CellSetting].
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

/**
 * The cart being filled, as the id of a CARTS row — `'3'` — or blank while
 * none is.
 *
 * The quantity box on every lot of the store inventories table writes into
 * this cart and no other, so with none chosen the boxes are drawn but take
 * nothing. Held as a string because that is what a `<select>` hands back and
 * what every other setting here holds; read as a number through
 * [activeCartId].
 */
export const activeCart = useStorage('brickzuke-active-cart', '')

/** The active cart's key, or nothing where none is chosen. */
export function activeCartId(): number | undefined {
  return idIn(activeCart)
}

/**
 * The price modifier profile in force, as the id of a PRICE_MODIFIER_PROFILES
 * row — `'2'` — or blank while none is.
 *
 * The factors applied to every lot's price are this profile's and no other's,
 * and the factor box on every table writes into it — so with none chosen no
 * factor applies, which is how to switch them all off without losing any.
 * Held as a string for the reason the cart is; read as a number through
 * [activeProfileId].
 */
export const activeProfile = useStorage('brickzuke-active-profile', '')

/** The active profile's key, or nothing where none is chosen. */
export function activeProfileId(): number | undefined {
  return idIn(activeProfile)
}

/**
 * The units a price is shown in: EUR cents, or whole euros.
 *
 * A lot's price arrives in the viewer's currency — `0.05` — and most of a bulk
 * seller's inventory is a few cents a piece, so cents is the default: `5` is
 * read at a glance where `0.05` is counted. Euros for a reader who thinks in
 * them, or whose lots are dear enough that the cents are noise.
 */
export const priceUnits = useStorage('brickzuke-price-units', 'cents')

/** The values [priceUnits] takes. */
export type PriceUnits = 'cents' | 'euros'

/**
 * The units chosen, as the type rather than the string the picker holds —
 * cents wherever the stored value is not one of the two.
 */
export function priceUnitsChosen(): PriceUnits {
  return priceUnits.value === 'euros' ? 'euros' : 'cents'
}

/**
 * Whether a page is as long as the window is tall, or a fixed fifty rows.
 *
 * On, a table, a list or a wall of pictures shows exactly the rows that fit
 * the results area, read off what is drawn — see [pageFit] — so nothing
 * scrolls but a wide table sideways, and turning the page is the only way
 * down. Off is the shell's own page: fifty rows whatever the window, and a
 * scrollbar for the rest. A choice rather than a number because the number
 * is the point: it is one nobody should have to pick.
 */
export const dynamicPageSizes = useStorage('brickzuke-dynamic-page-sizes', 'on')

/** Whether the page is fitted — anything but an explicit `off` is. */
export function dynamicPageSizesOn(): boolean {
  return dynamicPageSizes.value !== 'off'
}

/**
 * What a lot's price is held against in the Price ratio column: one seller's
 * price for the same thing, a percentile of the lots the query matches, or
 * nothing at all.
 *
 * A price on its own says little — three cents is dear for a 1 x 1 plate and
 * a steal for a minifigure torso — so the ratio says it against something:
 * `0.8` is a fifth under the reference, `1.5` half again over it. What counts
 * as "the same thing" is the item in the colour, see [referenceKey]; the
 * condition is left to the query, which can say `condition:N` for itself.
 */
export const referencePrice = useStorage('brickzuke-reference-price', 'percentile')

/** The values [referencePrice] takes. */
export type ReferencePrice = 'percentile' | 'store' | 'off'

/** The reference chosen, as the type — a percentile wherever the stored value is none of the three. */
export function referencePriceChosen(): ReferencePrice {
  return referencePrice.value === 'store' || referencePrice.value === 'off'
    ? referencePrice.value
    : 'percentile'
}

/**
 * The seller whose price is the reference when [referencePrice] says a
 * store's, by the username a `store:` term names them by — LEGO.com's own
 * shop to begin with, its price being the one every other is marked up or
 * down from.
 *
 * Typed rather than picked: the directory runs to thousands of sellers, and
 * a list of all of them is not a control anybody can use.
 */
export const referenceStore = useStorage('brickzuke-reference-store', 'LEGO.com')

/**
 * Which percentile of the matching lots is the reference when
 * [referencePrice] says a percentile's: 50 is the median, 0 the cheapest
 * and 100 the dearest.
 */
export const referencePercentile = useStorage('brickzuke-reference-percentile', 50)

/** The key a picker setting holds, or nothing where it is blank or nonsense. */
function idIn(setting: Ref<string>): number | undefined {
  const id = Number(setting.value)
  return setting.value !== '' && Number.isFinite(id) && id > 0 ? id : undefined
}

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

/**
 * A knob that is one of somebody's own carts, by id, or blank.
 *
 * As with a country, the choices are not declared here: they are whatever
 * carts are stored, which [userCounts] reads after every write and the cell
 * draws — see [CellSetting].
 */
export interface CartSetting extends SettingBase {
  kind: 'cart'
  value: Ref<string>
}

/** A knob that is one of somebody's own price modifier profiles, by id, or blank — as a cart is. */
export interface ProfileSetting extends SettingBase {
  kind: 'profile'
  value: Ref<string>
}

/**
 * A knob that is one of a few values declared here, never blank.
 *
 * Unlike the pickers above, the choices are the setting's own to state, and
 * the first of them is the default: there is no "not set" for a price's
 * units, since a price is always shown in some.
 */
export interface ChoiceSetting extends SettingBase {
  kind: 'choice'
  value: Ref<string>
  choices: {
    value: string
    label: string
  }[]
}

/**
 * A knob that is a line of text, or blank — for a name there are too many of
 * to offer as a list, a seller's username among them.
 */
export interface TextSetting extends SettingBase {
  kind: 'text'
  value: Ref<string>
}

/** One knob, as the table draws it. */
export type Setting =
  | NumberSetting
  | CountrySetting
  | CartSetting
  | ProfileSetting
  | ChoiceSetting
  | TextSetting

/** The kinds drawn as a picker rather than a number field. */
export function pickedSetting(setting: Setting | undefined): setting is CountrySetting | CartSetting | ProfileSetting | ChoiceSetting {
  return setting?.kind === 'country' || setting?.kind === 'cart' || setting?.kind === 'profile' || setting?.kind === 'choice'
}

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
  },
  {
    kind: 'cart',
    key: 'activeCart',
    name: 'Active cart',
    detail:
      'The cart the quantity box on every lot puts that lot into. Make one on the Carts table first.',
    value: activeCart
  },
  {
    kind: 'profile',
    key: 'activeProfile',
    name: 'Active price modifier profile',
    detail:
      'The set of price modifiers applied to every lot, and the one the factor boxes write into. Not set means no modifier applies.',
    value: activeProfile
  },
  {
    kind: 'choice',
    key: 'priceUnits',
    name: 'Price units',
    detail: 'Whether every price — lots, carts, postage — is shown in EUR cents or in whole euros.',
    value: priceUnits,
    choices: [
      {
        value: 'cents',
        label: 'EUR cents'
      },
      {
        value: 'euros',
        label: 'EUROs'
      }
    ]
  },
  {
    kind: 'choice',
    key: 'referencePrice',
    name: 'Reference price',
    detail:
      'What the Price ratio on every lot divides its price by: a percentile of the lots the query matches, or one store’s price — each for the same item in the same colour.',
    value: referencePrice,
    choices: [
      {
        value: 'percentile',
        label: 'A percentile'
      },
      {
        value: 'store',
        label: 'A store’s price'
      },
      {
        value: 'off',
        label: 'Off'
      }
    ]
  },
  {
    kind: 'number',
    key: 'referencePercentile',
    name: 'Reference percentile',
    detail:
      'Which percentile of the matching lots is the reference, when the reference price is a percentile: 50 is the median, 0 the cheapest lot.',
    value: referencePercentile,
    min: 0,
    max: 100,
    unit: 'percentile'
  },
  {
    kind: 'text',
    key: 'referenceStore',
    name: 'Reference store',
    detail:
      'The store whose price is the reference, when the reference price is a store’s — its username, as a store: term names it. LEGO.com for LEGO’s own prices.',
    value: referenceStore
  },
  {
    kind: 'choice',
    key: 'dynamicPageSizes',
    name: 'Dynamic page sizes',
    detail:
      'Whether a page is exactly as many rows as fit the window, so nothing scrolls but a wide table sideways — or a fixed fifty rows a page.',
    value: dynamicPageSizes,
    choices: [
      {
        value: 'on',
        label: 'On'
      },
      {
        value: 'off',
        label: 'Off'
      }
    ]
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
 * code it is and a cart or a profile as the id it is — the control is a
 * picker either way, so what arrives is one of the choices or blank — and a
 * value of the wrong kind changes nothing. Text is taken trimmed, blank
 * included. A choice is held to the choices it
 * declares: there is no blank to fall back on, so a value that is none of
 * them leaves the one that is set.
 */
export function setSetting(key: string, value: number | string): void {
  const setting = settingFor(key)
  if (!setting) {
    return
  }
  if (setting.kind === 'text') {
    if (typeof value === 'string') {
      setting.value.value = value.trim()
    }
    return
  }
  if (pickedSetting(setting)) {
    if (typeof value !== 'string') {
      return
    }
    const picked = value.trim()
    if (setting.kind !== 'choice' || setting.choices.some((choice) => choice.value === picked)) {
      setting.value.value = picked
    }
    return
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return
  }
  setting.value.value = Math.min(setting.max, Math.max(setting.min, Math.round(value)))
}
