/**
 * Turns for the screen, taken by work nobody is waiting to see finish.
 *
 * A scan over two hundred thousand items, a walk over every lot, a table read
 * again because a page of BrickLink landed behind it — all of it runs on the
 * one thread that also answers a click. A loop that hands the thread back
 * every thousand rows still holds it for as long as a thousand rows take,
 * and that is a figure nobody chose: it grew with what a row costs to make,
 * until opening the type picker in front of a filling table took seconds.
 *
 * So the rule is time, not rows. Background work runs in slices of a few
 * milliseconds and gives the thread back between them — see [maybeYield] —
 * and work set off by something arriving rather than by somebody asking
 * waits for the screen to be idle before it starts — see [backgroundTurn].
 * Responsiveness first; fetching and inserting results after.
 */

/**
 * How long one slice may run before giving the thread back — half a frame,
 * so a press is answered within the frame it lands in.
 */
const SLICE_MS = 8

/** When the slice now running began, on the page's own clock. */
let sliceStart = performance.now()

interface Scheduler {
  yield?: () => Promise<void>
  postTask?: (task: () => void, options?: { priority?: string }) => Promise<void>
}

function scheduler(): Scheduler | undefined {
  return (globalThis as { scheduler?: Scheduler }).scheduler
}

/**
 * Gives the thread back, and carries on once input and painting have had it.
 *
 * `scheduler.yield` where the browser has it: the continuation keeps its
 * place ahead of other queued work, so a scan the table is waiting on is not
 * pushed behind every timer on the page — only behind the reader.
 */
export async function yieldToInput(): Promise<void> {
  const yielding = scheduler()?.yield
  if (yielding) {
    await yielding.call(scheduler())
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  sliceStart = performance.now()
}

/**
 * Gives the thread back if the slice has run its length, and costs a clock
 * read if not — cheap enough to ask once a row.
 */
export async function maybeYield(): Promise<void> {
  if (performance.now() - sliceStart >= SLICE_MS) {
    await yieldToInput()
  }
}

/**
 * Waits until the page has nothing more urgent to do.
 *
 * For work set off by an arrival — a page of lots landing, a count coming
 * in — rather than by a press: `background` priority runs after every task
 * the reader could be waiting on, a click's included. Where the browser has
 * no scheduler, an idle callback does the same job, with a bound so a page
 * that is never idle still gets its rows.
 */
export async function backgroundTurn(): Promise<void> {
  const posting = scheduler()?.postTask
  if (posting) {
    await posting.call(scheduler(), () => undefined, {
      priority: 'background'
    })
  } else if (typeof requestIdleCallback === 'function') {
    await new Promise<void>((resolve) => requestIdleCallback(() => resolve(), {
      timeout: 500
    }))
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  sliceStart = performance.now()
}
