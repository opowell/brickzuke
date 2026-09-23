/**
 * A page as long as the window is tall.
 *
 * The shell asks its source for a page of rows and draws them in one
 * scroller, and how many rows a page is was a constant — fifty, the shell's
 * own default. Fifty is too many for a table of lots on a laptop and too few
 * for a wall of thumbnails on a big screen, and either way it is the wrong
 * unit: what somebody looking at a page wants is the rows in front of them,
 * and the scrollbar is the sign that some of them are not.
 *
 * So, while the "Dynamic page sizes" setting is on, the page is however many
 * rows fill the results area and no more. Nothing is measured in advance —
 * a row's height depends on the view, on the type, on whether a name runs to
 * three lines and on whether its picture has arrived — so the answer is read
 * off what the shell has actually drawn: the page is rendered, the rows that
 * end inside the scroller's box are counted, and the shell is asked for that
 * many. Too many is trimmed to the count that fit; room to spare is filled
 * by an estimate from the rows already up, which is exact for a list and an
 * overshoot for a grid, and an overshoot is trimmed on the next pass. What
 * keeps the two from chasing each other is the ceiling: the first row that
 * did not fit is remembered, and nothing grows the page back up to it until
 * the window or the query changes. Every pass is one re-run of the query, so
 * they are kept to as few as the rule allows, and to a handful at most.
 *
 * Only the vertical scroll is spent this way. `clientHeight` stops above a
 * horizontal scrollbar, so a table wider than the window keeps its sideways
 * scroll and loses nothing to it. Two screens keep the fixed page: the home
 * screen, which draws no rows of the shell's, and the preview view, which
 * shows one record at a time and steps through the page rather than
 * stacking it.
 */
import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** The shell's own default, kept wherever the page is not fitted. */
export const DEFAULT_LIMIT = 50

/**
 * The most rows a fitted page may ask for. A wall of small thumbnails on a
 * large screen fills at a few hundred; past this the query would be paying
 * for rows nobody can tell apart.
 */
export const MOST_ROWS = 1_000

/**
 * How many times one page may be re-fitted before it is left as it stands.
 * The ceiling is what makes the fit settle; this is what makes it stop if
 * something — a row that changes height as it is drawn — keeps it from
 * settling.
 */
export const MOST_STEPS = 8

/** The result elements of the views that stack: one per record, in order. */
const RESULT_SELECTOR =
  '.dc-table__row, .dc-list__row, .dc-card, .dc-grid__cell, .dc-images__cell, .dc-links__item'

/** What one look at the drawn page says. */
export interface Measured {
  /** Result elements drawn. */
  rendered: number
  /** Of those, how many end inside the scroller's box. */
  visible: number
  /** Whether the scroller has anything to scroll to, vertically. */
  overflows: boolean
  /** The box's height, above any horizontal scrollbar. */
  clientHeight: number
  /**
   * The height the results take: from the top of the box's content to the
   * bottom of the last of them. Not the scroll height, which a view stretched
   * to fill the box reports as the box's own however few rows it holds.
   */
  contentHeight: number
  /**
   * The height the results themselves span, first to last — the content less
   * whatever heads it, a table's header row, which one more row adds nothing
   * to.
   */
  rowsHeight: number
}

/** The fit as it stands, carried from one pass to the next. */
export interface FitState {
  /** The page length the shell was last asked for. */
  limit: number
  /** The shortest page known not to fit, or nothing yet. */
  ceiling?: number
  /** Passes made against this key. */
  steps: number
  /**
   * Set once somebody pages: the length stands as it was fitted, whatever
   * the page after it would fit — see [usePageFit].
   */
  held?: boolean
}

/**
 * The page length to ask for next, or nothing where the one asked for stands.
 *
 * A drawn page that is longer than the limit is the last query's rows still
 * up while this one runs, and says nothing about this one. A page shorter
 * than the limit that fits is the tail of the answer: there are no more rows
 * to ask for, however much room there is.
 */
export function nextLimit(measured: Measured, state: FitState): number | undefined {
  if (state.held || measured.rendered === 0 || measured.rendered > state.limit) {
    return undefined
  }
  if (state.steps >= MOST_STEPS) {
    return undefined
  }
  if (measured.overflows) {
    // The first row that does not fit lands where it lands whatever comes
    // after it, so a page one shorter than that is the most that can. Every
    // row ending inside the box and the box still scrolling is something
    // under the last of them — a margin, a wall's slack — and one row less
    // is the answer to that too.
    const fits = Math.max(
      1,
      measured.visible < measured.rendered ? measured.visible : measured.rendered - 1
    )
    state.ceiling = Math.min(state.ceiling ?? Infinity, fits + 1)
    const limit = Math.min(fits, state.ceiling - 1)
    return limit === state.limit ? undefined : limit
  }
  if (measured.rendered < state.limit) {
    return undefined
  }
  const spare = measured.clientHeight - measured.contentHeight
  const per = measured.rowsHeight / measured.rendered
  if (!(per > 0)) {
    return undefined
  }
  const extra = Math.floor(spare / per)
  if (extra < 1) {
    return undefined
  }
  const limit = Math.min(state.limit + extra, (state.ceiling ?? Infinity) - 1, MOST_ROWS)
  return limit > state.limit ? limit : undefined
}

/**
 * Looks at the drawn page. Nothing where the scroller holds no stacked
 * results — the preview, an empty answer, the moment before the first row.
 */
export function measureResults(scroller: HTMLElement): Measured | undefined {
  const items = scroller.querySelectorAll(RESULT_SELECTOR)
  if (items.length === 0) {
    return undefined
  }
  const box = scroller.getBoundingClientRect()
  // Where the box's content starts, whatever it is scrolled to; the floor is
  // one client height below, which stops short of a horizontal scrollbar.
  const top = box.top + scroller.clientTop - scroller.scrollTop
  const floor = top + scroller.clientHeight + 0.5
  let visible = 0
  let first = Infinity
  let bottom = top
  for (const item of items) {
    const rect = item.getBoundingClientRect()
    if (rect.bottom <= floor) {
      visible++
    }
    first = Math.min(first, rect.top)
    bottom = Math.max(bottom, rect.bottom)
  }
  return {
    rendered: items.length,
    visible,
    overflows: scroller.scrollHeight > scroller.clientHeight,
    clientHeight: scroller.clientHeight,
    contentHeight: bottom - top,
    rowsHeight: bottom - first
  }
}

/**
 * The page length for the shell under `root`, fitted while `on`.
 *
 * `key` names what the fit is of: the query and the window. A change to it is
 * a new page to fit from scratch, and what the last one learned about how many
 * rows fit is let go. `page` is not part of it: a page is a cut of the query
 * `limit` rows long, so a length fitted afresh for each page — eleven rows
 * here, twelve on the next, where a remark wraps on one and not the other —
 * moved where every page starts, and the page count with it, on every step,
 * and could skip a row or show one twice between two pages. So a step to
 * another page holds the length the query was fitted to, and the page scrolls
 * a little or leaves a little room instead. A change to the limit itself is not one — the rows
 * redraw, and the ceiling carries over, which is what keeps a grow and a trim
 * from trading places for ever. `view` names what is about to be drawn — the
 * type and the view, as the URL has them — which is what a page's length is
 * remembered by.
 *
 * Watched through the DOM rather than the shell: the shell is a package, and
 * what a row costs in height is not something it reports. A mutation under
 * the root is rows landing or a view being swapped; a resize of the scroller
 * or of what it holds is the window moving or a picture arriving. Each is
 * folded into one look on the next frame.
 */
export function usePageFit(
  root: Ref<HTMLElement | null>,
  on: Ref<boolean>,
  key: Ref<string>,
  view: Ref<string>,
  page: Ref<unknown>
): Ref<number> {
  const limit = ref(DEFAULT_LIMIT)
  const state: FitState = {
    limit: DEFAULT_LIMIT,
    steps: 0
  }
  /**
   * What each view was last fitted to, by the name the URL gives it, so a
   * table left and come back to is asked for at its length rather than at
   * the last view's and then re-fitted. By the URL rather than by what is
   * drawn, because the prediction is made before the switch is drawn.
   */
  const fitted = new Map<string, number>()

  let mutations: MutationObserver | null = null
  let resizes: ResizeObserver | null = null
  let frame = 0

  function scroller(): HTMLElement | null {
    return root.value?.querySelector<HTMLElement>('.dc-results') ?? null
  }

  /** Asks the shell for a page of that length; a pass is one that was measured. */
  function set(next: number, pass: boolean) {
    state.limit = next
    if (pass) {
      state.steps++
    }
    limit.value = next
  }

  function fit() {
    frame = 0
    if (!on.value) {
      return
    }
    const box = scroller()
    if (!box) {
      return
    }
    // The scroller and what it draws, watched anew each pass: the view's
    // element is replaced when the view is, and observing twice is free.
    if (resizes) {
      resizes.disconnect()
      resizes.observe(box)
      if (box.firstElementChild) {
        resizes.observe(box.firstElementChild)
      }
    }
    if (box.querySelector('.dc-preview')) {
      if (state.limit !== DEFAULT_LIMIT) {
        set(DEFAULT_LIMIT, false)
      }
      return
    }
    const measured = measureResults(box)
    if (!measured) {
      return
    }
    const next = nextLimit(measured, state)
    if (next === undefined) {
      if (measured.rendered === state.limit && !measured.overflows) {
        fitted.set(view.value, state.limit)
      }
      return
    }
    set(next, true)
  }

  function schedule() {
    if (frame === 0) {
      frame = requestAnimationFrame(fit)
    }
  }

  function reset() {
    state.ceiling = undefined
    state.steps = 0
    state.held = false
    // Asked for at the length this view fitted to last time, before the
    // query runs, so the common case is no re-run at all.
    const known = fitted.get(view.value)
    if (known !== undefined && known !== state.limit) {
      set(known, false)
    }
    schedule()
  }

  function start() {
    if (typeof MutationObserver === 'undefined' || typeof ResizeObserver === 'undefined') {
      return
    }
    if (!root.value) {
      return
    }
    mutations = new MutationObserver(schedule)
    mutations.observe(root.value, {
      childList: true,
      subtree: true
    })
    resizes = new ResizeObserver(schedule)
    window.addEventListener('resize', schedule)
    schedule()
  }

  function stop() {
    mutations?.disconnect()
    mutations = null
    resizes?.disconnect()
    resizes = null
    window.removeEventListener('resize', schedule)
    if (frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  watch(on, (now) => {
    if (now) {
      start()
      reset()
    } else {
      stop()
      state.ceiling = undefined
      state.steps = 0
      state.held = false
      set(DEFAULT_LIMIT, false)
    }
  })

  // Together, so a new query that also went back to page one is a new fit
  // rather than a held one.
  watch([key, page], ([nextKey], [lastKey]) => {
    if (nextKey !== lastKey) {
      reset()
    } else {
      state.held = true
    }
  })

  onMounted(() => {
    if (on.value) {
      start()
    }
  })

  onBeforeUnmount(stop)

  return limit
}
