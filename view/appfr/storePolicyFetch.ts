/**
 * Getting a seller's shipping terms when they are not stored yet.
 *
 * The fifth of the same shape as [inventoryFetch], [colorItemsFetch],
 * [storesFetch] and [storeLotsFetch], and for the same reason: nothing bulk
 * states what a seller charges to ship, so the policy is scraped when
 * someone looks at a seller's shipping, and only then.
 *
 * Two deep, like the lots and sharing their first step: the front page for
 * the numeric id the policy is addressed by, then the policy itself. One
 * request each, both held for a week — so opening a seller's shipping after
 * opening their lots costs the policy and nothing more.
 */
import { installResponseListener } from '../assets/js/init-brick-link-worker'
import { processQueue } from '../assets/js/make-call'
import { fetchStorePolicy } from '../stores/bricklink/store-policy-page'
import type { StoredStorePolicy } from '../stores/bricklink/store-policy-page'
import { get, getAll } from '../../idb/db'
import { getDbConnection } from '../../idb/idb'
import STORES from '../../idb/stores'
import { storeIdFor } from './storeLotsFetch'
import { isLegoStore } from './legoLotsFetch'

/**
 * How long to wait before saying nothing is coming — the same budget a
 * seller's lots get, and for the same reason: the answer arrives through the
 * browser extension, or not at all.
 */
const DEADLINE_MS = 20_000

const MISSING_EXTENSION =
  'No answer from the BrickZuke extension. It fetches BrickLink pages on the ' +
  "app's behalf — check it is installed and that you are signed in to BrickLink."

/**
 * Every policy stored, whoever the seller.
 *
 * What the shipping tables show when no seller narrows them: the sellers
 * somebody has already looked at. Bounded by how many sellers have been
 * opened, which is why it can be read whole.
 */
export async function readStorePolicies(): Promise<StoredStorePolicy[]> {
  const db = await getDbConnection()
  try {
    return (await getAll<StoredStorePolicy>(db, STORES.STORE_POLICIES)) ?? []
  } finally {
    db.close()
  }
}

/** One seller's policy, or nothing where nobody has asked for it. */
export async function readStorePolicy(username: string): Promise<StoredStorePolicy | undefined> {
  const db = await getDbConnection()
  try {
    return await get<StoredStorePolicy>(db, STORES.STORE_POLICIES, username)
  } finally {
    db.close()
  }
}

/** Waits for the policy to land, or says why it has not. */
async function awaitPolicy(username: string): Promise<StoredStorePolicy> {
  const deadline = Date.now() + DEADLINE_MS
  for (;;) {
    const stored = await readStorePolicy(username)
    if (stored) {
      return stored
    }
    if (Date.now() > deadline) {
      throw new Error(MISSING_EXTENSION)
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

async function scrapePolicy(username: string): Promise<StoredStorePolicy> {
  const sid = await storeIdFor(username)
  installResponseListener()
  // Queues the call, or replays a cached response — a policy read within the
  // week never leaves the browser.
  await fetchStorePolicy(username, sid)
  // Nothing drains the queue on its own here: appfr asks for exactly the
  // page someone is looking at.
  await processQueue(1)
  return await awaitPolicy(username)
}

/** One fetch per seller at a time: two tables of one store are not two scrapes. */
const inFlight = new Map<string, Promise<StoredStorePolicy>>()

/**
 * A seller's terms: read if stored, fetched if not.
 *
 * Stored terms are taken as the answer for as long as they are stored, which
 * is what keeps every redraw of a table from being a request.
 */
export function storePolicyFor(username: string): Promise<StoredStorePolicy> {
  // LEGO's terms are on LEGO.com and are not a BrickLink policy; there is
  // nothing of BrickLink's to ask for them.
  if (isLegoStore(username)) {
    return Promise.reject(new Error('LEGO.com states no shipping terms here.'))
  }
  const running = inFlight.get(username)
  if (running) {
    return running
  }
  const attempt = (async () => {
    const stored = await readStorePolicy(username)
    return stored ?? (await scrapePolicy(username))
  })().finally(() => {
    inFlight.delete(username)
  })
  inFlight.set(username, attempt)
  return attempt
}

/**
 * The policies to draw a table from: one seller's if the query names one, and
 * otherwise whatever is already stored.
 *
 * Un-narrowed, this does not scrape, as the sellers table does not: there is
 * no page that states every seller's terms at once, and "every seller's
 * shipping" would be a request per seller ever opened.
 */
export async function storePoliciesFor(username?: string): Promise<StoredStorePolicy[]> {
  if (!username) {
    return await readStorePolicies()
  }
  return [await storePolicyFor(username)]
}
