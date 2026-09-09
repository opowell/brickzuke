/**
 * The lots behind a narrowed wall, fetched while it is being looked at.
 *
 * [reach] answers a card by joining through the store inventories, so what the
 * wall can say about a colour, a category or a year under `region:"Europe"` is
 * bounded by how many European lots brickzuke happens to hold. On a fresh
 * catalogue that is none, and the honest answer is the whole population with no
 * join at all; on a browsed one it is a few thousand lots out of many millions,
 * and the answer is a floor wearing a `~`. This is what lifts the floor.
 *
 * It is a fill in the same manners as [homeFill], and for the same reason —
 * these are somebody else's pages, fetched on nobody's explicit instruction,
 * because a screen is open in front of somebody:
 *
 *   - it runs only while the narrowed home screen is up, and stops on the way
 *     out at whatever seller it had reached;
 *   - one request in flight, with a pause the length of a glance between them;
 *   - it gives up after three silences in a row, that being the extension not
 *     being there rather than one seller having no page;
 *   - a seller asked about once is not asked about again this session.
 *
 * **Breadth before depth**, which is the whole of the prioritisation and the
 * one thing here worth arguing about. A seller runs to a hundred and twenty
 * pages, and the second page of a seller says almost nothing the first did not:
 * the same shop stocks the same categories in the same colours. The first page
 * of the *next* seller says something new. So the run takes one page from every
 * seller in scope, biggest first, before it takes a second page from anybody —
 * the order that turns a wall from wrong to roughly right in the fewest
 * requests, which is what somebody watching it wants. Only once every seller in
 * scope has been opened does it go back for the rest, and that is where
 * [pageFill] takes over.
 *
 * Biggest first within that, on [homeFill]'s own argument: the seller with the
 * most on offer is the one whose page moves the answer furthest, and it is also
 * the one somebody would have opened by hand.
 *
 * **It stops when it stops learning**, rather than at a number of sellers fixed
 * in advance. Europe is seven thousand sellers and fetching all of them is
 * hours of somebody else's pages for a wall that stopped changing in the first
 * few dozen: the colours, conditions and types saturate almost at once, and the
 * categories not long after. So the run counts sellers that add no value the
 * wall had not already reached, and gives up after enough of them in a row —
 * `reachPatience`, which the reader sets and which the Settings table draws.
 * That is a bound on the actual goal instead of a guess at it.
 */
import { ref } from 'vue'
import type { ShellRow } from 'header-content-layout'
import { forgetPreview } from './catalogPreviews'
import { storedRows } from './catalogSource'
import { filled } from './homeFill'
import { JOINED, forgetReach, matching, reachFor, reaches } from './reach'
import { reachGapMs, reachPatience } from './settings'
import { readAllStoreLots, storeLotsFill, storeLotsFor } from './storeLotsFetch'

/** Three silences in a row is nobody answering — [homeFill]'s number. */
const GIVE_UP = 3

/**
 * The dimensions a seller can be new in.
 *
 * What the fill is for is the reach: which colours, conditions, types, items,
 * categories and years a narrowed wall can get to. Every one of those is a
 * function of these four fields on a lot — a category and a year are the item's,
 * and the item is the record — so a seller whose lots hold no value new in any
 * of them has moved nothing on any card, whatever else is true of them.
 *
 * The seller's own name is deliberately not among them. Every new seller is new
 * in `store` by definition, so counting it would mean no seller was ever barren
 * and the run would never settle — and the sellers card is answered off the
 * directory anyway, which needs no lot to say who is in Europe.
 */
const DIMENSIONS = ['colorid', 'condition', 'itemType', 'record'] as const

/** How far the run has got, for the wall to say so. */
export interface Reaching {
  /** Sellers in scope whose lots are stored — the ones the join can see. */
  read: number
  /** Sellers in scope, stored or not. */
  scope: number
}

/**
 * The run in progress, or nothing when the wall is not being deepened.
 *
 * A card reads this to say it is still filling in: the `~` says the number is a
 * floor and this says the floor is still rising, which are two different things
 * and a reader watching a count climb wants both.
 */
export const reaching = ref<Reaching | undefined>(undefined)

/**
 * Which run is the live one. Zero is none: the query changed or the wall was
 * left, and every loop still in flight stops at its next look at this.
 */
let current = 0
let issued = 0

/** Sellers asked about this session, answered or not, so none is asked twice. */
const attempted = new Set<string>()

/** The expression the live run is deepening, so the same one does not restart it. */
let running = ''

/**
 * The sellers the query reaches.
 *
 * The same pair of filters a card is read through — the store's own fields
 * answer `region:` and `country:` directly, and anything they cannot answer is
 * joined through the lots like everywhere else. So narrowing to a colour fetches
 * the sellers already known to stock it, which is the right set to deepen even
 * though it is not yet the whole of it.
 */
async function sellersInScope(expr: string): Promise<ShellRow[]> {
  const rows = (await storedRows('stores')) ?? []
  if (!rows.length) {
    return []
  }
  const reach = await reachFor('stores', expr, rows)
  const match = matching('stores', expr)
  return rows.filter((row) => match(row) && reaches(reach, row))
}

/**
 * What the run has reached so far, and whether a seller added to it.
 *
 * One set per dimension, carried across the whole run. A seller's lots are
 * offered to it and it says whether any value in them was new — which is the
 * stopping rule in one question: a wall that a seller does not change is a wall
 * that seller had nothing to say to.
 */
function ledger() {
  const seen = new Map<string, Set<string>>(
    DIMENSIONS.map((field) => [field, new Set<string>()])
  )
  return {
    /** Adds a seller's lots, and reports whether any of it was new. */
    add(lots: readonly Record<string, unknown>[]): boolean {
      let fresh = false
      for (const lot of lots) {
        for (const field of DIMENSIONS) {
          const value = String(lot[field] ?? '').trim()
          if (!value) {
            continue
          }
          const values = seen.get(field)!
          if (!values.has(value)) {
            values.add(value)
            fresh = true
          }
        }
      }
      return fresh
    }
  }
}

/** Most on offer first — the page that moves the answer furthest. */
function biggestFirst(rows: ShellRow[]): ShellRow[] {
  return rows
    .slice()
    .sort((left, right) => Number(right.fields.items ?? 0) - Number(left.fields.items ?? 0))
}

/**
 * Tells the wall that the fact table has grown.
 *
 * Every joined type at once rather than one of them: a page of lots is a page
 * of colours and categories and years together, so there is no card it could
 * have changed that it did not.
 */
function landed(): void {
  // The held walks first: a card re-read against a pass taken before this page
  // landed would redraw itself with the answer it already had.
  forgetReach()
  for (const entity of JOINED) {
    forgetPreview(entity)
  }
  // The home screen's own watch, which re-reads the cards. Shared with
  // [homeFill] because the two are one thing to a reader: something arrived.
  filled.value++
}

function report(read: number, scope: number): void {
  reaching.value = {
    read,
    scope
  }
}

/**
 * Starts deepening the wall under this query, or leaves the run already
 * deepening it alone.
 *
 * A query with nothing to join is not a query with anything to fetch: the wall
 * is the whole catalogue and every card is already exact, so an un-narrowed home
 * screen fetches no seller at all. That is the difference between this and
 * [homeFill], which fills the directory whatever is on screen.
 */
export function startReachFill(expr: string): void {
  const asked = expr.trim()
  if (!asked) {
    stopReachFill()
    return
  }
  if (current && running === asked) {
    return
  }
  running = asked
  const mine = (current = ++issued)
  void deepen(mine, asked)
}

/**
 * Stops it, for the way out of the home screen or a change of query.
 *
 * The progress goes with it: a card saying how far a run has got, behind a run
 * that is not running, says something is coming when nothing is. What was
 * fetched stays, and the next visit resumes from the sellers already stored.
 */
export function stopReachFill(): void {
  current = 0
  running = ''
  reaching.value = undefined
}

/** One page from every seller in scope, then the rest of each. */
async function deepen(mine: number, expr: string): Promise<void> {
  let scope: ShellRow[]
  try {
    scope = biggestFirst(await sellersInScope(expr))
  } catch {
    // No directory to read, so no seller to ask about. The cards say what they
    // said, which is the population with no join in it.
    return
  }
  if (mine !== current || !scope.length) {
    return
  }
  const stored = new Set((await readAllStoreLots()).map((lot) => lot.store))
  if (mine !== current) {
    return
  }
  report(scope.filter((row) => stored.has(String(row.fields.store ?? ''))).length, scope.length)

  const opened = await breadth(mine, scope, stored)
  if (mine !== current) {
    return
  }
  await depth(mine, opened)
  if (mine === current) {
    // The run is done rather than stopped: it went on until the sellers stopped
    // telling it anything. The `~` stays even so — what settled is the *reach*,
    // and the count behind it is still only over the lots that were fetched.
    reaching.value = undefined
  }
}

/**
 * The first page of every seller in scope that has none, biggest first.
 *
 * Returns the sellers the wall now holds something of, which is what the second
 * pass goes back for.
 */
async function breadth(
  mine: number,
  scope: ShellRow[],
  stored: Set<string>
): Promise<string[]> {
  const opened: string[] = []
  const reached = ledger()
  let failures = 0
  let barren = 0
  for (const row of scope) {
    if (mine !== current) {
      return opened
    }
    const username = String(row.fields.store ?? '')
    if (!username) {
      continue
    }
    if (stored.has(username)) {
      opened.push(username)
      continue
    }
    if (attempted.has(username)) {
      continue
    }
    // Enough sellers in a row that changed nothing: the wall has stopped
    // moving, and going on is fetching a region to confirm what is already on
    // screen. The reader sets how much patience that takes — see [settings].
    if (barren >= reachPatience.value) {
      return opened
    }
    attempted.add(username)
    let lots: Record<string, unknown>[]
    try {
      lots = (await storeLotsFor(username)) as unknown as Record<string, unknown>[]
    } catch {
      if (++failures >= GIVE_UP) {
        return opened
      }
      continue
    }
    failures = 0
    if (!lots.length) {
      // Nothing to offer is not the same as nothing new, but it counts the
      // same way: this seller did not move the wall.
      barren++
      continue
    }
    barren = reached.add(lots) ? 0 : barren + 1
    stored.add(username)
    opened.push(username)
    if (mine !== current) {
      return opened
    }
    report(stored.size, scope.length)
    landed()
    await wait(reachGapMs.value)
  }
  return opened
}

/**
 * The rest of each seller already opened, through [pageFill]'s own runner.
 *
 * Second because of the argument at the top: page two of a seller says less
 * than page one of the next. It runs at all because a seller's first hundred
 * lots are the front of their shop, and a wall that only ever saw those would
 * lean the same way for every seller in the world.
 */
async function depth(mine: number, opened: string[]): Promise<void> {
  for (const username of opened) {
    if (mine !== current) {
      return
    }
    const fill = storeLotsFill(username)
    // Stopped rather than awaited to a finish when the wall is left: the run is
    // the seller's whole inventory, and nobody asked for it.
    const watching = watchRun(mine, fill)
    try {
      await fill.run()
    } finally {
      clearInterval(watching)
      fill.stop()
    }
    if (mine !== current) {
      return
    }
    landed()
    await wait(reachGapMs.value)
  }
}

/**
 * Ends a seller's paging the moment the wall is left.
 *
 * `fillPages` stops when it is told to and not when a token changes, and its
 * run is minutes long — so this is the token, looked at on the same beat the
 * fill leaves between pages.
 */
function watchRun(mine: number, fill: { stop(): void }): ReturnType<typeof setInterval> {
  return setInterval(() => {
    if (mine !== current) {
      fill.stop()
    }
  }, 500)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
