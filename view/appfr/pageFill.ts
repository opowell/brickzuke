/**
 * The rest of a long answer, fetched while the table is up.
 *
 * Two of these tables are a page of BrickLink at a time and neither of them is
 * one page: Tan runs to two hundred and eighty-seven of them, a warehouse
 * seller to sixty-three and the biggest well past that. Both used to stop at a
 * cap — twenty pages for a colour, thirty for a store — and then stay stopped,
 * because stored rows are taken as the answer: a store fetched short was short
 * for ever, and the caveat under the header was the only thing that said so.
 *
 * So the caps are gone and the paging is here. The first page is fetched by
 * whatever the table asked, which is what puts rows on screen at all; the rest
 * arrives behind it, a page at a time, and the table redraws as each one
 * lands. What keeps that from being a scrape is the four rules below:
 *
 *   - it runs only while the table is up. `stream` makes one of these per
 *     query and stops it in the teardown, so leaving is what ends the run —
 *     at the page it has reached, not at the page it was aiming for.
 *   - it picks up where it left off. Which page is next is read from the scope
 *     stored beside the rows rather than counted in memory, so a seller left
 *     half fetched in one session carries on in the next.
 *   - it stops the moment a page brings nothing new. A page nobody answers, a
 *     page replayed from the call cache and a seller with fewer lots than
 *     BrickLink says are indistinguishable from here, and all three are the
 *     end of the run rather than a reason to ask again.
 *   - it leaves a gap between pages. Nobody asked for page forty-one; a table
 *     is simply open in front of somebody.
 */
import type { Ref } from 'vue'

/**
 * How long to wait for one page before deciding nothing is coming — the same
 * budget the first page gets, and for the same reason: the answer arrives
 * through the browser extension, or not at all.
 */
const DEADLINE_MS = 20_000

/** How often to look for it in the meantime. */
const POLL_MS = 400

/**
 * The gap between one page and the next.
 *
 * Half a second against a round trip through the extension, so it is a fifth
 * of the time a page takes rather than the whole of it: enough that a
 * sixty-page seller reads as a table filling in rather than as a burst of
 * requests, and little enough that somebody watching the count climb is not
 * kept waiting by it.
 */
const BETWEEN_MS = 500

/** The pages of one answer, as the three things a fill has to know about them. */
export interface Pages {
  /** The next page to ask for, or nothing when the whole answer is stored. */
  next(): Promise<number | undefined>
  /** Asks for it, and drains the queue that carries it. */
  fetch(page: number): Promise<void>
  /**
   * How far the stored answer reaches — lots for a seller, pages for a colour.
   * All that is asked of the figure is that landing a page moves it, that
   * being what tells a page that arrived from a page that never will.
   */
  reach(): Promise<number>
}

/** A fill in progress: what it has landed, and how to call it off. */
export interface Fill {
  /** Bumped as each page lands, for the table and the caveat drawn from it. */
  version: Ref<number>
  /**
   * Fetches the rest, and resolves when there is no more of it or the run was
   * stopped. Never rejects: the rows already on screen are not made wrong by
   * page forty-one failing to arrive, and a table that threw away what it had
   * over one would be the worse answer.
   */
  run(): Promise<void>
  /** Ends the run at the page it has reached, the table having been left. */
  stop(): void
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A fill over those pages, reporting itself through that version. */
export function fillPages(pages: Pages, version: Ref<number>): Fill {
  let stopped = false

  /** Whether the page asked for arrived — see the third rule at the top. */
  async function landed(before: number): Promise<boolean> {
    const deadline = Date.now() + DEADLINE_MS
    for (;;) {
      if (stopped) {
        return false
      }
      if ((await pages.reach()) > before) {
        return true
      }
      if (Date.now() > deadline) {
        return false
      }
      await wait(POLL_MS)
    }
  }

  return {
    version,
    stop() {
      stopped = true
    },
    async run() {
      while (!stopped) {
        const page = await pages.next()
        if (page === undefined || stopped) {
          return
        }
        const before = await pages.reach()
        try {
          await pages.fetch(page)
        } catch {
          // Nobody is answering, which is the same end as a page that brings
          // nothing: what is stored stands, and the caveat says how far it got.
          return
        }
        if (!(await landed(before))) {
          return
        }
        version.value++
        await wait(BETWEEN_MS)
      }
    }
  }
}
