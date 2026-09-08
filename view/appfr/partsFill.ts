/**
 * Filling the Parts column in, one set at a time and behind everything else.
 *
 * A parts count is only known for a set somebody has fetched, so a column of
 * dashes stays a column of dashes until it is asked for. This asks — but the
 * asking is the whole problem: 20,000 sets is 20,000 pages of BrickLink, and
 * a table that fires one request per visible row on every scroll is a table
 * that gets the extension rate-limited within a minute.
 *
 * So the rule here is that this is the lowest-priority thing in the app:
 *
 * - it only ever asks about sets a cell has actually drawn — see CellParts,
 *   which is the only caller. Paging the table is what widens the backlog.
 * - one request at a time, spaced, and never overlapping: the next is
 *   scheduled after the last has come back, not on a fixed clock that would
 *   pile up behind a slow answer.
 * - newest first. A record drawn a moment ago is on screen; one asked for
 *   forty rows back has been scrolled past, and the backlog is capped so the
 *   ones that fell off the bottom are the ones nobody is looking at.
 * - it stands aside for anything a person is waiting on. `inventoryFor` is
 *   shared with the foreground — opening a set goes through the same queue —
 *   so a tick that finds a fetch already running gives up its turn.
 * - it stops when the tab is not being looked at, and backs off when the
 *   extension is not answering, rather than spending twenty seconds a set
 *   discovering that again.
 *
 * The requests themselves go through `queueCall` like every other call in the
 * app: they land in QUEUED_CALLS and are drained newest-first, so a set opened
 * by hand while the backlog is running is served before the backlog is.
 */
import { ref } from 'vue'
import { fetchesInFlight, hasInventory, inventoryFor } from './inventoryFetch'
import { partsOf } from './partCounts'

/**
 * The gap between one set and the next.
 *
 * The app's own queue pump drains a call every ten seconds. This is quicker
 * because it is answering something on screen, and still slow enough that a
 * page of fifty sets takes minutes rather than seconds to fill.
 */
const EVERY_MS = 5_000

/**
 * Where the wait ends up when nothing is answering — a minute a try, which is
 * often enough to notice an extension being installed and rare enough to be
 * no load at all.
 */
const BACKOFF_MAX_MS = 60_000

/**
 * How many sets in a row have to fail before the pace drops.
 *
 * A single failure says nothing about the queue: `inventoryFor` cannot tell a
 * set BrickLink lists nothing for from a set nobody answered about — both are
 * an empty read at the deadline — and old sets with no inventory on file are
 * scattered right through the catalogue. Backing off on the first would let
 * one 1966 Samsonite box slow the whole column to a minute a set.
 *
 * A run of them is different. The failure that matters is the extension being
 * absent or signed out, and that one fails every set, so three in a row is
 * enough to tell the two apart while costing an un-inventoried set nothing.
 */
const FAILURES_BEFORE_BACKOFF = 3

/**
 * How many sets to keep waiting on.
 *
 * Anything past this has been scrolled away from, and a backlog that grows
 * without limit is one that spends the evening fetching pages nobody is
 * looking at any more.
 */
const BACKLOG = 200

/** Sets waiting to be counted, oldest first — the end of the array is next. */
const backlog: string[] = []

/** Asked about once already, however that turned out. */
const asked = new Set<string>()

/**
 * Sets that were asked about and came back with nothing.
 *
 * The difference between this and a set still on the backlog is the difference
 * between a cell that is loading and a cell that is finished with no number to
 * show — and a column that animates both is telling one of them a lie. Plenty
 * of old sets have no inventory on file at all: the 1966 Samsonite boxes never
 * answer, and a spinner beside them would spin for ever.
 */
const unanswered = ref<Record<string, true>>({})

/**
 * Whether a number is still expected for this set: waiting on the backlog, or
 * being fetched, or not yet asked. False once it has been asked and failed.
 */
export function stillExpected(record: string): boolean {
  return !unanswered.value[record]
}

let timer: ReturnType<typeof setTimeout> | undefined
let delay = EVERY_MS
let failures = 0

/**
 * "This cell has no number." Adds the set to the backlog, if it is a set, if
 * it is not counted already, and if it has not been asked about before.
 */
export function requestPartCount(record: string) {
  if (!record || !hasInventory(record) || partsOf(record) || asked.has(record)) {
    return
  }
  asked.add(record)
  backlog.push(record)
  if (backlog.length > BACKLOG) {
    backlog.shift()
  }
  schedule()
}

function schedule() {
  timer ??= setTimeout(() => {
    timer = undefined
    void tick()
  }, delay)
}

/**
 * Whether now is somebody else's turn.
 *
 * A fetch already running is a set somebody opened and is watching a spinner
 * for; a hidden tab is nobody at all. Either way the turn is given up rather
 * than taken, and the backlog is still there on the next tick.
 */
function busy(): boolean {
  if (fetchesInFlight() > 0) {
    return true
  }
  return typeof document !== 'undefined' && document.hidden
}

async function tick(): Promise<void> {
  if (!backlog.length) {
    // Nothing waiting: the filler exists only while there is a backlog, and
    // starts again by itself the next time a cell asks.
    return
  }
  if (busy()) {
    schedule()
    return
  }
  // The most recently drawn, which is the one most likely to still be on
  // screen.
  const record = backlog.pop()!
  try {
    // Reads what is stored, or queues the page and waits for the extension.
    // Either way `readInventory` inside it tells [partCounts] what came back,
    // which is what puts the number in the cell.
    await inventoryFor(record)
    failures = 0
    delay = EVERY_MS
  } catch {
    // Asked, and nothing came back — so the cell stops saying it is counting.
    unanswered.value = {
      ...unanswered.value,
      [record]: true
    }
    // A set that will not answer is not a reason to stop, and on its own not
    // a reason to slow down either — see FAILURES_BEFORE_BACKOFF. A run of
    // them is the extension being absent, and then the wait doubles.
    failures++
    delay =
      failures >= FAILURES_BEFORE_BACKOFF ? Math.min(delay * 2, BACKOFF_MAX_MS) : EVERY_MS
  }
  schedule()
}

/** What is still waiting, for tests and for anything that wants to look. */
export function partsBacklog(): string[] {
  return [...backlog]
}

/** Drops the backlog and the timer — the state a fresh session starts in. */
export function stopPartsFill() {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  backlog.length = 0
  asked.clear()
  unanswered.value = {}
  delay = EVERY_MS
  failures = 0
}
