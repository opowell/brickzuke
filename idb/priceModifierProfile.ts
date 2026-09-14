/**
 * Price modifier profiles — see [PriceModifierProfile] — and the factors filed
 * under each.
 *
 * The sibling of [cart]: a named record of theirs that other records are
 * filed under, one of which is picked as active in the settings. The four
 * operations a cart has, through the same [userRecord] helpers — except the
 * delete, which cannot go through [removeWithChildren]: that removes each
 * child by its `id`, and a modifier has none, being keyed by the profile and
 * what it is on. So a profile's factors are listed by the index and each is
 * deleted by the compound key it carries.
 */
import type { IDBPDatabase } from 'idb'
import indices from './indices'
import stores from './stores'
import type { PriceModifier, PriceModifierProfile } from './userTypes'
import { dbDelete, getAllFromIndex } from './db'
import { createRecord, listRecords, removeRecord, updateRecord } from './userRecord'

export const NEW_PROFILE_NAME = 'New profile'

export async function createPriceModifierProfile(
  db: IDBPDatabase,
  name: string = NEW_PROFILE_NAME
): Promise<PriceModifierProfile> {
  return createRecord<PriceModifierProfile>(db, stores.PRICE_MODIFIER_PROFILES, {
    name,
    createdAt: new Date()
  })
}

export async function updatePriceModifierProfile(
  db: IDBPDatabase,
  id: number,
  changes: Partial<Omit<PriceModifierProfile, 'id'>>
): Promise<PriceModifierProfile | undefined> {
  return updateRecord<PriceModifierProfile>(db, stores.PRICE_MODIFIER_PROFILES, id, changes)
}

/** The profile and every factor in it, so none is left filed under a profile that has gone. */
export async function deletePriceModifierProfile(db: IDBPDatabase, id: number): Promise<void> {
  const held = (await getAllFromIndex<PriceModifier>(db, indices.PRICE_MODIFIERS_BY_PROFILE, id)) ?? []
  for (const modifier of held) {
    await dbDelete(db, stores.PRICE_MODIFIERS, [modifier.profileId, modifier.entity, modifier.key])
  }
  await removeRecord(db, stores.PRICE_MODIFIER_PROFILES, id)
}

export async function loadPriceModifierProfiles(db: IDBPDatabase): Promise<PriceModifierProfile[]> {
  return listRecords<PriceModifierProfile>(db, stores.PRICE_MODIFIER_PROFILES)
}
