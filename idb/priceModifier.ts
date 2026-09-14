/**
 * Price modifiers, written and read — see [PriceModifier].
 *
 * Not through [userRecord], whose helpers assume an auto-increment `id`: a
 * modifier is keyed by what it is on, so setting one is a `put` under that
 * key whether or not one was there, and taking it off is a delete of the
 * same. Two operations, and no create apart from set.
 */
import type { IDBPDatabase } from 'idb'
import stores from './stores'
import type { PriceModifier } from './userTypes'
import { dbDelete, getAll, put } from './db'

/**
 * Puts a factor on one thing, or takes it off.
 *
 * Off, rather than a factor of one, when handed nothing: a modifier of one
 * is a row saying nothing, and a table of those would be the modifiers lost
 * among them. A factor that is not a positive number is refused rather than
 * clamped — there is no nearest legal value to nought that means anything.
 */
export async function setPriceModifier(
  db: IDBPDatabase,
  entity: string,
  key: string,
  factor: number | undefined
): Promise<PriceModifier | undefined> {
  if (factor === undefined) {
    await dbDelete(db, stores.PRICE_MODIFIERS, [entity, key])
    return undefined
  }
  if (!Number.isFinite(factor) || factor <= 0) {
    return undefined
  }
  const modifier: PriceModifier = {
    entity,
    key,
    factor
  }
  await put<PriceModifier>(db, stores.PRICE_MODIFIERS, modifier)
  return modifier
}

export async function loadPriceModifiers(db: IDBPDatabase): Promise<PriceModifier[]> {
  return (await getAll<PriceModifier>(db, stores.PRICE_MODIFIERS)) ?? []
}
