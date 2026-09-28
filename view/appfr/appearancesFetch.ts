/**
 * Getting what a part is in when it is not stored yet.
 *
 * The same shape as [inventoryFetch], from the other side: a set's page says
 * what the set is made of, a part's page says what the part is in. Two pages
 * per part — the sets, and the minifigures — each asked for once and then
 * read back. See [catalog-item-in-page].
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { Call, makeTextCall, processQueue } from '../assets/js/make-call'
import { BOT_CHECK_MESSAGE, checkedSince } from '../assets/js/bot-check'
import { ONE_WEEK } from '../assets/js/timesToMs'
import { get, getAll, getAllFromIndex } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import indices from '../../idb/indices'
import STORES from '../../idb/stores'
import { CATALOG_PAGE_OPTIONS } from '../stores/bricklink/catalog-item-inv-page'
import {appearanceScopeId,
  appearsInUrl} from '../stores/bricklink/catalog-item-in-page'
import type {Container,
  StoredAppearance,
  StoredAppearanceScope} from '../stores/bricklink/catalog-item-in-page'

const DEADLINE_MS = 20_000

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
  "app's behalf — check it is installed and that you are signed in to BrickLink."

/**
 * What an item's pages are asked about: for a part the sets it is in and the
 * minifigures, and for a minifigure the sets — nothing is made of minifigures
 * but sets.
 */
function containersOf(record: string): readonly Container[] {
  return record.startsWith('M-') ? ['S'] : ['S', 'M']
}

/** The kinds of item that are made of parts, and so have pages saying what they are in. */
export function hasAppearances(record: string): boolean {
  return record.startsWith('P-') || record.startsWith('M-')
}

/** Every line one part is stated to be in. */
export async function readAppearances(part: string): Promise<StoredAppearance[]> {
  const db = await getDbConnection()
  try {
    return (
      (await getAllFromIndex<StoredAppearance>(db, indices.PART_APPEARANCES_BY_PART, part)) ?? []
    )
  } finally {
    db.close()
  }
}

/** Every line any part is stated to be in. */
export async function readAllAppearances(): Promise<StoredAppearance[]> {
  const db = await getDbConnection()
  try {
    return (await getAll<StoredAppearance>(db, STORES.PART_APPEARANCES)) ?? []
  } finally {
    db.close()
  }
}

async function readScope(part: string, within: Container): Promise<StoredAppearanceScope | undefined> {
  const db = await getDbConnection()
  try {
    return await get<StoredAppearanceScope>(
      db,
      STORES.PART_APPEARANCE_SCOPES,
      appearanceScopeId(part, within)
    )
  } finally {
    db.close()
  }
}

/** Whether both of a part's pages have been read. */
export async function appearancesKnown(part: string): Promise<boolean> {
  for (const within of containersOf(part)) {
    if (!(await readScope(part, within))) {
      return false
    }
  }
  return true
}

async function scrape(part: string, within: Container): Promise<void> {
  installResponseListener()
  const asked = Date.now()
  const [type, ...rest] = part.split('-')
  await makeTextCall(
    Call.GET_CATALOG_ITEM_IN_PAGE,
    appearsInUrl(part, within),
    CATALOG_PAGE_OPTIONS,
    {
      part,
      within,
      type,
      number: rest.join('-')
    },
    ONE_WEEK
  )
  await processQueue(1)
  const deadline = asked + DEADLINE_MS
  for (;;) {
    if (await readScope(part, within)) {
      return
    }
    if (checkedSince(asked)) {
      throw new Error(BOT_CHECK_MESSAGE)
    }
    if (Date.now() > deadline) {
      throw new Error(MISSING_EXTENSION)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

/** One fetch per part at a time: two tables asking about one part are not two scrapes. */
const inFlight = new Map<string, Promise<StoredAppearance[]>>()

/**
 * What a part is in: read if both its pages are stored, fetched where not.
 * Nothing for an item that is not made into anything.
 */
export function appearancesFor(part: string): Promise<StoredAppearance[]> {
  if (!hasAppearances(part)) {
    return Promise.resolve([])
  }
  const running = inFlight.get(part)
  if (running) {
    return running
  }
  const attempt = (async () => {
    for (const within of containersOf(part)) {
      if (!(await readScope(part, within))) {
        await scrape(part, within)
      }
    }
    return await readAppearances(part)
  })().finally(() => inFlight.delete(part))
  inFlight.set(part, attempt)
  return attempt
}
