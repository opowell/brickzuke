/**
 * The price modifiers, kept where a lot's row can read them without asking.
 *
 * The sibling of [activeCart], and held for the same reason: the lots table is
 * built a row at a time off a cursor — see [eachLot] — and every row wants to
 * say what its price comes to once the factors on it are applied. So the
 * modifiers are read once, here, into a map by what each is on, and the row
 * builders look their lot up in it. Refreshed after every write, through
 * [refreshUserCounts], which is what re-runs the query anyway.
 *
 * What a factor is on is a row of one of eight tables, and the lot it applies
 * to is one carrying that row's key — see [MODIFIED]. A lot's modified price
 * is its price times every factor whose key it carries: see [modifiedPrice].
 */
import { ref } from 'vue'
import type { IDBPDatabase } from 'idb'
import type { PriceModifier } from '../../idb/userTypes'
import { loadPriceModifiers } from '../../idb/priceModifier'

/**
 * The tables a factor can be put on a row of, and how a lot carries that
 * row's key.
 *
 * `on` is the field the table's own rows carry the key in — its `scope`, the
 * field a term names one of its rows by — and `lot` is the field a lot row
 * carries the same key in. The two are the same name wherever a lot states
 * the thing directly. A category is the exception: a lot never states its
 * item's category, so the row builder looks it up and files it under a name
 * no term can reach — the parser lowercases a term's field, and `categoryId`
 * is not lowercase — because `category:` on the lots table has meant nothing
 * so far, and a field that matched only the lots looked up would be a term
 * that narrows differently on different days.
 */
export const MODIFIED: Record<string, { on: string; lot: string }> = {
  colors: {
    on: 'colorid',
    lot: 'colorid'
  },
  stores: {
    on: 'store',
    lot: 'store'
  },
  categories: {
    on: 'category',
    lot: 'categoryId'
  },
  conditions: {
    on: 'condition',
    lot: 'condition'
  },
  countries: {
    on: 'country',
    lot: 'country'
  },
  itemTypes: {
    on: 'type',
    lot: 'type'
  },
  regions: {
    on: 'region',
    lot: 'region'
  },
  provinces: {
    on: 'province',
    lot: 'province'
  }
}

/** Every factor, by the table it is on and then by the key it is on. */
export const priceModifiers = ref<Map<string, Map<string, number>>>(new Map())

/** Re-reads them all. */
export async function refreshPriceModifiers(db: IDBPDatabase): Promise<void> {
  holdPriceModifiers(await loadPriceModifiers(db))
}

/** Holds these and no others — what the refresh does with what it read. */
export function holdPriceModifiers(modifiers: readonly PriceModifier[]): void {
  const held = new Map<string, Map<string, number>>()
  for (const modifier of modifiers) {
    let byKey = held.get(modifier.entity)
    if (!byKey) {
      byKey = new Map()
      held.set(modifier.entity, byKey)
    }
    byKey.set(modifier.key, modifier.factor)
  }
  priceModifiers.value = held
}

/** The factor on one row of one table, or nothing where none is. */
export function priceModifierOf(entity: string, key: unknown): number | undefined {
  if (key === undefined || key === null || key === '') {
    return undefined
  }
  return priceModifiers.value.get(entity)?.get(String(key))
}

/** Whether any factor is on a row of this table — what decides if a lookup is worth making. */
export function anyPriceModifierOn(entity: string): boolean {
  return (priceModifiers.value.get(entity)?.size ?? 0) > 0
}

/** One factor that applies to a lot, and what it is on — for the hover to spell out. */
export interface AppliedModifier {
  entity: string
  key: string
  factor: number
}

/**
 * The factors that apply to one lot, read off the fields its row carries.
 *
 * In the order [MODIFIED] lists the tables, so the working reads the same on
 * every lot: colour, seller, category, condition, country, type, region,
 * province.
 */
export function modifiersApplying(fields: Record<string, unknown>): AppliedModifier[] {
  const applied: AppliedModifier[] = []
  for (const [entity, carried] of Object.entries(MODIFIED)) {
    const factor = priceModifierOf(entity, fields[carried.lot])
    if (factor !== undefined) {
      applied.push({
        entity,
        key: String(fields[carried.lot]),
        factor
      })
    }
  }
  return applied
}

/**
 * What a lot's price comes to with every factor on it applied — or nothing
 * where the lot has no price to scale.
 *
 * The price itself where nothing applies, so the column reads down as a
 * price on every row and sorts as one: a blank on every unmodified lot would
 * put the modified ones on their own at one end, which is not what a column
 * of prices is for.
 */
export function modifiedPrice(fields: Record<string, unknown>): number | undefined {
  const price = Number(fields.priceValue)
  if (fields.priceValue === undefined || !Number.isFinite(price)) {
    return undefined
  }
  return modifiersApplying(fields).reduce((scaled, applied) => scaled * applied.factor, price)
}
