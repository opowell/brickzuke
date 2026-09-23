import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMIT, MOST_ROWS, MOST_STEPS, nextLimit } from '../pageFit'
import type { FitState, Measured } from '../pageFit'

/**
 * A drawn page of `rendered` rows, `per` tall each, under a `head` — a
 * table's header row — in a box `clientHeight` tall, with `slack` below.
 */
function drawn(rendered: number, per: number, clientHeight: number, slack = 0, head = 0): Measured {
  const rowsHeight = rendered * per
  const contentHeight = head + rowsHeight
  return {
    rendered,
    visible: Math.min(rendered, Math.floor((clientHeight - head) / per)),
    overflows: contentHeight + slack > clientHeight,
    clientHeight,
    contentHeight,
    rowsHeight
  }
}

function state(limit = DEFAULT_LIMIT, ceiling?: number): FitState {
  return {
    limit,
    steps: 0,
    ceiling 
  }
}

describe('fitting the page to the window', () => {
  it('trims a page that scrolls to the rows that end inside the box', () => {
    // Fifty rows of 20px in a 300px box: fifteen fit.
    expect(nextLimit(drawn(50, 20, 300), state())).toBe(15)
  })

  it('trims one more where every row ends inside the box but something under them does not', () => {
    expect(nextLimit(drawn(10, 20, 205, 8), state(10))).toBe(9)
  })

  it('never asks for fewer than one row', () => {
    expect(nextLimit(drawn(3, 500, 300), state(3))).toBe(1)
  })

  it('grows a full page that leaves room, by the rows already drawn', () => {
    // Ten rows of 20px in a 300px box: room for five more.
    expect(nextLimit(drawn(10, 20, 300), state(10))).toBe(15)
  })

  it('grows by the rows, not by the header over them', () => {
    // Eight rows of 49px under a 68px header in a 1352px box: eighteen more.
    expect(nextLimit(drawn(8, 49, 1352, 0, 68), state(8))).toBe(26)
  })

  it('leaves a full page that leaves less than a row', () => {
    expect(nextLimit(drawn(15, 20, 310), state(15))).toBeUndefined()
  })

  it('leaves a short page alone, however much room there is: it is the tail', () => {
    expect(nextLimit(drawn(4, 20, 300), state(50))).toBeUndefined()
  })

  it('says nothing of the last query’s rows still up while this one runs', () => {
    expect(nextLimit(drawn(50, 20, 300), state(15))).toBeUndefined()
  })

  it('says nothing of an empty page', () => {
    expect(nextLimit(drawn(0, 20, 300), state())).toBeUndefined()
  })

  it('remembers the first row that did not fit, and grows no further than under it', () => {
    // A grid: twelve tiles, four to a row of 100px, in a 350px box. The
    // estimate reads 25px a tile and asks for two more — which start a fourth
    // row that does not fit.
    const fit = state(12)
    expect(nextLimit(drawn(12, 25, 350), fit)).toBe(14)
    fit.limit = 14
    fit.steps++
    // Drawn: 14 tiles, the last two on a row ending at 400px.
    expect(
      nextLimit(
        {
          rendered: 14,
          visible: 12,
          overflows: true,
          clientHeight: 350,
          contentHeight: 400 
        },
        fit
      )
    ).toBe(12)
    expect(fit.ceiling).toBe(13)
    fit.limit = 12
    fit.steps++
    // Back at twelve there is still room by the estimate, and it is not taken.
    expect(nextLimit(drawn(12, 25, 350), fit)).toBeUndefined()
  })

  it('holds the length once somebody pages, whether the page would fit more or fewer', () => {
    // Taller rows on the next page would trim it to eleven, shorter ones grow
    // it to fifteen — and either moves where every page starts.
    const fit = state(12)
    fit.held = true
    expect(nextLimit(drawn(12, 25, 280), fit)).toBeUndefined()
    expect(nextLimit(drawn(12, 20, 300), fit)).toBeUndefined()
  })

  it('stops after enough passes, whatever the rows are doing', () => {
    const fit = state(10)
    fit.steps = MOST_STEPS
    expect(nextLimit(drawn(10, 20, 300), fit)).toBeUndefined()
  })

  it('asks for no more than the most a page may be', () => {
    expect(nextLimit(drawn(900, 1, 100_000), state(900))).toBe(MOST_ROWS)
  })
})
