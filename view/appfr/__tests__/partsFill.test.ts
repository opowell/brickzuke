/**
 * The background fill behind the Parts column.
 *
 * The column is only as filled-in as BrickLink has been asked, and asking is
 * the expensive part: one page per set, through the same extension every other
 * call goes through. So what is pinned here is not that the numbers arrive —
 * `inventoryFor` is what fetches them and is tested elsewhere — but that they
 * arrive politely: one at a time, spaced, newest first, standing aside for
 * anything a person is waiting on, and backing off when nothing answers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const inventoryFor = vi.fn<(record: string) => Promise<unknown[]>>()
const fetchesInFlight = vi.fn(() => 0)
const partsOf = vi.fn<(record: string) => unknown>()

vi.mock('../inventoryFetch', () => ({
  inventoryFor: (record: string) => inventoryFor(record),
  fetchesInFlight: () => fetchesInFlight(),
  // The real rule, restated rather than imported: sets, minifigures and gear
  // list an inventory and nothing else does.
  hasInventory: (record: string) => ['S', 'M', 'G'].includes(record.split('-')[0])
}))

vi.mock('../partCounts', () => ({
  partsOf: (record: string) => partsOf(record)
}))

const {
  partsBacklog,
  requestPartCount,
  stillExpected,
  stopPartsFill
} = await import('../partsFill')

/** The gap the filler leaves between one set and the next. */
const EVERY_MS = 5_000

beforeEach(() => {
  vi.useFakeTimers()
  inventoryFor.mockReset().mockResolvedValue([])
  fetchesInFlight.mockReset().mockReturnValue(0)
  partsOf.mockReset().mockReturnValue(undefined)
  stopPartsFill()
})

afterEach(() => {
  stopPartsFill()
  vi.useRealTimers()
})

describe('what goes on the backlog', () => {
  it('takes a set nobody has counted', () => {
    requestPartCount('S-10511-1')
    expect(partsBacklog()).toEqual(['S-10511-1'])
  })

  it('leaves out what is not made of anything', () => {
    requestPartCount('P-3001')
    requestPartCount('I-5000')
    expect(partsBacklog()).toEqual([])
  })

  it('leaves out a set already counted', () => {
    partsOf.mockReturnValue({
      parts: 8,
      lots: 2
    })
    requestPartCount('S-10511-1')
    expect(partsBacklog()).toEqual([])
  })

  it('asks about a set once, however often its cell is drawn', () => {
    requestPartCount('S-10511-1')
    requestPartCount('S-10511-1')
    requestPartCount('S-10511-1')
    // Paging back to a row that is still uncounted must not queue it again:
    // the answer is on its way, or it already failed.
    expect(partsBacklog()).toEqual(['S-10511-1'])
  })

  it('keeps the most recently drawn when the backlog is full', () => {
    for (let i = 0; i < 250; i++) {
      requestPartCount(`S-${i}-1`)
    }
    const held = partsBacklog()
    expect(held).toHaveLength(200)
    // The first fifty have been scrolled past; the newest is still the next up.
    expect(held[0]).toBe('S-50-1')
    expect(held[held.length - 1]).toBe('S-249-1')
  })
})

describe('how the backlog is worked through', () => {
  it('fetches one set at a time, a tick apart, newest first', async () => {
    requestPartCount('S-1-1')
    requestPartCount('S-2-1')
    requestPartCount('S-3-1')

    // Nothing before the first tick: the column is drawn, not fetched.
    expect(inventoryFor).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(EVERY_MS)
    // The one drawn last, which is the one most likely still on screen.
    expect(inventoryFor.mock.calls.map((call) => call[0])).toEqual(['S-3-1'])

    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor.mock.calls.map((call) => call[0])).toEqual(['S-3-1', 'S-2-1'])

    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor.mock.calls.map((call) => call[0])).toEqual(['S-3-1', 'S-2-1', 'S-1-1'])
  })

  it('stops once there is nothing left, and starts again when asked', async () => {
    requestPartCount('S-1-1')
    await vi.advanceTimersByTimeAsync(EVERY_MS * 5)
    expect(inventoryFor).toHaveBeenCalledTimes(1)
    expect(partsBacklog()).toEqual([])

    requestPartCount('S-2-1')
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(2)
  })

  it('gives up its turn while somebody is waiting on a set', async () => {
    // Somebody opened a set: that fetch is in flight and this one is not
    // worth queueing behind it.
    fetchesInFlight.mockReturnValue(1)
    requestPartCount('S-1-1')
    await vi.advanceTimersByTimeAsync(EVERY_MS * 3)
    expect(inventoryFor).not.toHaveBeenCalled()
    // Still waiting, not dropped.
    expect(partsBacklog()).toEqual(['S-1-1'])

    fetchesInFlight.mockReturnValue(0)
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(1)
  })

  it('keeps its pace past a set BrickLink lists nothing for', async () => {
    // One failure says nothing: an old set with no inventory on file reads
    // exactly like a set nobody answered about, and there are plenty of those
    // scattered through the catalogue.
    inventoryFor.mockRejectedValueOnce(new Error('no answer'))
    for (const record of ['S-1-1', 'S-2-1', 'S-3-1']) {
      requestPartCount(record)
    }

    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(3)
  })

  it('slows down once a run of sets goes unanswered', async () => {
    inventoryFor.mockRejectedValue(new Error('No answer from the BrickZuke extension.'))
    for (let i = 0; i < 8; i++) {
      requestPartCount(`S-${i}-1`)
    }

    // The first three are the tolerance: every set failing is the extension
    // being absent, not the catalogue being patchy.
    await vi.advanceTimersByTimeAsync(EVERY_MS * 3)
    expect(inventoryFor).toHaveBeenCalledTimes(3)

    // From there the wait doubles, so the fourth is two ticks after the third
    // rather than one.
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(4)
  })

  it('stops expecting a number once a set has been asked about and failed', async () => {
    inventoryFor.mockRejectedValue(new Error('no answer'))
    requestPartCount('S-1-1')

    // Still on its way: the cell is right to be animating.
    expect(stillExpected('S-1-1')).toBe(true)

    await vi.advanceTimersByTimeAsync(EVERY_MS)
    // Asked and answered with nothing, so the cell stops saying it is counting
    // — an old set with no inventory on file would otherwise animate for ever.
    expect(stillExpected('S-1-1')).toBe(false)
    // A set nobody has got to yet is untouched by that.
    expect(stillExpected('S-2-1')).toBe(true)
  })

  it('comes back up to speed once a set answers', async () => {
    inventoryFor.mockRejectedValue(new Error('no answer'))
    for (let i = 0; i < 6; i++) {
      requestPartCount(`S-${i}-1`)
    }

    await vi.advanceTimersByTimeAsync(EVERY_MS * 3)
    expect(inventoryFor).toHaveBeenCalledTimes(3)

    // The fourth answers, which resets both the run and the wait.
    inventoryFor.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(EVERY_MS * 2)
    expect(inventoryFor).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(inventoryFor).toHaveBeenCalledTimes(5)
  })
})
