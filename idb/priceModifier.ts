/**
 * Price modifiers, written and read — see [PriceModifier]. The profiles they
 * are filed under are in [priceModifierProfile].
 *
 * Not through [userRecord], whose helpers assume an auto-increment `id`: a
 * modifier is keyed by the profile it is in and what it is on, so setting one
 * is a `put` under that key whether or not one was there, and taking it off
 * is a delete of the same. Two operations, and no create apart from set.
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import type { PriceModifier } from './userTypes'
import { dbDelete, getAll, getAllFromIndex, put } from './db'

/**
 * Puts a factor on one thing in one profile, or takes it off.
 *
 * Off, rather than a factor of one, when handed nothing: a modifier of one
 * is a row saying nothing, and a table of those would be the modifiers lost
 * among them. Nought is allowed — it prices every lot of the thing at
 * nothing, which is how to say "count this as free" or to push a colour to
 * the head of every plan. Less than nought is refused rather than clamped: a
 * negative price is not a price.
 */
export async function setPriceModifier(
  db: IDBPDatabase,
  profileId: number,
  entity: string,
  key: string,
  factor: number | undefined
): Promise<PriceModifier | undefined> {
  if (factor === undefined) {
    await dbDelete(db, stores.PRICE_MODIFIERS, [profileId, entity, key])
    return undefined
  }
  if (!Number.isFinite(factor) || factor < 0) {
    return undefined
  }
  const modifier: PriceModifier = {
    profileId,
    entity,
    key,
    factor
  }
  await put<PriceModifier>(db, stores.PRICE_MODIFIERS, modifier)
  return modifier
}

/** Every factor in one profile. */
export async function loadPriceModifiers(db: IDBPDatabase, profileId: number): Promise<PriceModifier[]> {
  return (await getAllFromIndex<PriceModifier>(db, indices.PRICE_MODIFIERS_BY_PROFILE, profileId)) ?? []
}

/** Every factor in every profile — for a table counting what each holds. */
export async function loadAllPriceModifiers(db: IDBPDatabase): Promise<PriceModifier[]> {
  return (await getAll<PriceModifier>(db, stores.PRICE_MODIFIERS)) ?? []
}
