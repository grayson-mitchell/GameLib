/**
 * Behaviour table for the focus-row overflow arithmetic (Phase 48 Plan 04,
 * Task 1). The Frontend jest project is `testEnvironment: 'node'` -- no
 * jsdom -- so every function under test takes a plain measurement object
 * or a hand-built event stub rather than a live element.
 */
import {
  canScrollBack,
  canScrollForward,
  createNextFrameRunner,
  measureCardPitch,
  measureFitAllowance,
  pageScrollDelta,
  pagedScrollLeft,
  scrollFocusedCardIntoViewHorizontally
} from '../focusRowOverflow'
import {
  LIBRARY_TILE_WIDTH_DEFAULT,
  LIBRARY_TILE_WIDTH_MAX,
  LIBRARY_TILE_WIDTH_MIN
} from '../../../libraryTileSize'

const m = (clientWidth: number, scrollWidth: number, scrollLeft: number) => ({
  clientWidth,
  scrollWidth,
  scrollLeft
})

describe('pageScrollDelta', () => {
  it('pages by the number of whole visible cards, not one card', () => {
    expect(pageScrollDelta(m(600, 2000, 0), 180)).toBe(540)
  })

  it('floors a fractional card count down to whole cards', () => {
    // 700 / 180 = 3.88 -> 3 whole cards
    expect(pageScrollDelta(m(700, 2000, 0), 180)).toBe(540)
  })

  it('returns exactly one card pitch when the width fits no whole card', () => {
    expect(pageScrollDelta(m(100, 2000, 0), 180)).toBe(180)
  })

  it('never returns 0 for a positive pitch, even at zero width', () => {
    expect(pageScrollDelta(m(0, 2000, 0), 180)).toBe(180)
  })

  it('falls back to the pitch (or 0) for a non-positive pitch', () => {
    expect(pageScrollDelta(m(600, 2000, 0), 0)).toBe(0)
    expect(pageScrollDelta(m(600, 2000, 0), -5)).toBe(0)
  })

  it('stays finite for NaN and Infinity measurements', () => {
    expect(Number.isFinite(pageScrollDelta(m(NaN, 2000, 0), 180))).toBe(true)
    expect(pageScrollDelta(m(NaN, 2000, 0), 180)).toBe(180)
    expect(Number.isFinite(pageScrollDelta(m(Infinity, 2000, 0), 180))).toBe(
      true
    )
    expect(pageScrollDelta(m(Infinity, 2000, 0), 180)).toBe(180)
  })

  it('stays finite for a NaN or Infinity pitch', () => {
    expect(Number.isFinite(pageScrollDelta(m(600, 2000, 0), NaN))).toBe(true)
    expect(Number.isFinite(pageScrollDelta(m(600, 2000, 0), Infinity))).toBe(
      true
    )
  })

  it('returns a positive delta for a positive pitch (caller negates for back)', () => {
    expect(pageScrollDelta(m(600, 2000, 300), 180)).toBeGreaterThan(0)
  })

  it('pages one short on the bare count and exactly the grid column count with the fit allowance (261011-ulj D-02)', () => {
    // C = 516 is an exact 3-column fit at a 156px tile (3 x 180 = 540 = C + 24),
    // so the track's clientWidth is C + 15 = 531.
    expect(pageScrollDelta(m(531, 2000, 0), 180)).toBe(360)
    expect(pageScrollDelta(m(531, 2000, 0), 180, 9)).toBe(540)
  })

  it('treats a non-finite fit allowance as 0', () => {
    expect(pageScrollDelta(m(531, 2000, 0), 180, NaN)).toBe(360)
    expect(pageScrollDelta(m(531, 2000, 0), 180, Infinity)).toBe(360)
    expect(pageScrollDelta(m(531, 2000, 0), 180, -Infinity)).toBe(360)
  })

  // The track is the viewport box, which bleeds 15px at the start only, so its
  // clientWidth is the grid content width C plus 15, integer-rounded. The grid
  // fits n = floor((C + 24) / pitch) columns. With allowance 9 (gap 24 minus
  // lead padding 15) a page is n cards, or n + 1 only inside a 1.5px rounding
  // band.
  const sweepP1 = (allowance: number): { bad: string[]; short: number } => {
    const bad: string[] = []
    let short = 0
    for (const w of [
      LIBRARY_TILE_WIDTH_MIN,
      LIBRARY_TILE_WIDTH_DEFAULT,
      188,
      LIBRARY_TILE_WIDTH_MAX
    ]) {
      const pitch = w + 24
      for (let i = 0; w + i * 0.37 <= 3000; i++) {
        const c = w + i * 0.37
        const n = Math.floor((c + 24) / pitch)
        for (const clientWidth of [Math.round(c + 15), Math.floor(c + 15)]) {
          const cards =
            pageScrollDelta(m(clientWidth, 99999, 0), pitch, allowance) / pitch
          const whole = Math.round(cards)
          if (whole === n - 1) {
            short++
          }
          if (
            Math.abs(cards - whole) > 1e-9 ||
            whole < n ||
            whole > n + 1 ||
            (whole === n + 1 && (n + 1) * pitch - (c + 24) > 1.5)
          ) {
            bad.push(
              `W=${w} C=${c} clientWidth=${clientWidth} got ${cards} cards, want ${n} (or ${n + 1} within 1.5px)`
            )
          }
        }
      }
    }
    return { bad, short }
  }

  it('P1: pages the grid column count at every tile width, including the 188px live tile (261011-ulj)', () => {
    expect(sweepP1(9).bad).toEqual([])
  })

  it('P1 non-vacuity: the same sweep without the allowance pages one short at least once', () => {
    expect(sweepP1(0).short).toBeGreaterThan(0)
    expect(sweepP1(9).short).toBe(0)
  })
})

describe('pagedScrollLeft (261029-v5a follow-up)', () => {
  it('pages from a column to the next whole-pitch column', () => {
    expect(pagedScrollLeft(m(540, 2000, 0), 540, 180)).toBe(540)
  })

  it('rounds a half-card start back onto a column', () => {
    // 90 is half a card in; 90 + 540 = 630 -> 3.5 pitches -> 4 pitches
    expect(pagedScrollLeft(m(540, 2000, 90), 540, 180)).toBe(720)
    expect(pagedScrollLeft(m(540, 2000, 80), 540, 180)).toBe(540)
  })

  it('clamps to the end of travel and to 0', () => {
    expect(pagedScrollLeft(m(540, 1620, 900), 540, 180)).toBe(1080)
    expect(pagedScrollLeft(m(540, 1620, 180), -540, 180)).toBe(0)
  })

  it('travels through negative scrollLeft on an RTL track', () => {
    expect(pagedScrollLeft(m(540, 1620, 0), -540, 180, true)).toBe(-540)
    expect(pagedScrollLeft(m(540, 1620, -900), -540, 180, true)).toBe(-1080)
    expect(pagedScrollLeft(m(540, 1620, -180), 540, 180, true)).toBe(0)
  })

  it('leaves scrollLeft alone on a non-finite input', () => {
    expect(pagedScrollLeft(m(540, 1620, 90), NaN, 180)).toBe(90)
    expect(pagedScrollLeft(m(540, 1620, 90), 540, 0)).toBe(90)
  })
})

describe('measureFitAllowance', () => {
  const makeTrack = (list: unknown) =>
    ({ firstElementChild: list }) as unknown as Element
  const style =
    (columnGap: string, paddingLeft: string, paddingRight: string) => () => ({
      columnGap,
      paddingLeft,
      paddingRight
    })

  it('is the gap minus the inline padding (24 - 15 = 9)', () => {
    expect(
      measureFitAllowance(makeTrack({}), style('24px', '15px', '15px'))
    ).toBe(9)
  })

  it('is 0 for no track or no list', () => {
    expect(measureFitAllowance(null, style('24px', '15px', '15px'))).toBe(0)
    expect(
      measureFitAllowance(makeTrack(null), style('24px', '15px', '15px'))
    ).toBe(0)
  })

  it('is 0 for an unreadable gap', () => {
    expect(
      measureFitAllowance(makeTrack({}), style('normal', '15px', '15px'))
    ).toBe(0)
  })

  it('is 0, not a throw, when getStyle throws', () => {
    expect(
      measureFitAllowance(makeTrack({}), () => {
        throw new Error('boom')
      })
    ).toBe(0)
  })
})

describe('canScrollForward / canScrollBack', () => {
  it('both false when the content is narrower than the viewport', () => {
    expect(canScrollForward(m(600, 400, 0))).toBe(false)
    expect(canScrollBack(m(600, 400, 0))).toBe(false)
  })

  it('both false when the content exactly fits', () => {
    expect(canScrollForward(m(600, 600, 0))).toBe(false)
    expect(canScrollBack(m(600, 600, 0))).toBe(false)
  })

  it('at the start with overflow: back false, forward true', () => {
    expect(canScrollBack(m(600, 2000, 0))).toBe(false)
    expect(canScrollForward(m(600, 2000, 0))).toBe(true)
  })

  it('mid-travel: both true', () => {
    expect(canScrollBack(m(600, 2000, 500))).toBe(true)
    expect(canScrollForward(m(600, 2000, 500))).toBe(true)
  })

  it('at the end of travel: back true, forward false', () => {
    expect(canScrollBack(m(600, 2000, 1400))).toBe(true)
    expect(canScrollForward(m(600, 2000, 1400))).toBe(false)
  })

  it('a sub-pixel residue at the end does not leave forward enabled', () => {
    // 1000.4 - 600 - 400 === 0.4 of unreachable travel
    expect(canScrollForward(m(600, 1000.4, 400))).toBe(false)
  })

  it('a sub-pixel scrollLeft at the start does not enable back', () => {
    expect(canScrollBack(m(600, 2000, 0.4))).toBe(false)
  })

  it('is total over non-finite measurements', () => {
    expect(canScrollForward(m(NaN, 2000, 0))).toBe(false)
    expect(canScrollBack(m(600, NaN, 100))).toBe(false)
  })
})

describe('scrollFocusedCardIntoViewHorizontally', () => {
  interface Rect {
    left: number
    right: number
  }

  const makeEvent = (cardRect: Rect, trackRect: Rect, scrollLeft: number) => {
    const scrollTo = jest.fn()
    const track = {
      scrollLeft,
      scrollTo,
      getBoundingClientRect: () => trackRect
    }
    const target = {
      closest: (sel: string) => (sel === '.focusRowTrack' ? track : null),
      getBoundingClientRect: () => cardRect
    }
    return { ev: { target } as unknown as FocusEvent, scrollTo }
  }

  it('returns silently when the target has no .focusRowTrack ancestor', () => {
    const target = { closest: () => null }
    expect(() =>
      scrollFocusedCardIntoViewHorizontally({ target } as unknown as FocusEvent)
    ).not.toThrow()
  })

  it('does not call scrollTo when there is no track', () => {
    const scrollTo = jest.fn()
    const target = { closest: () => null, scrollTo }
    scrollFocusedCardIntoViewHorizontally({ target } as unknown as FocusEvent)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not throw for a null or non-element target', () => {
    expect(() =>
      scrollFocusedCardIntoViewHorizontally({ target: null } as FocusEvent)
    ).not.toThrow()
    expect(() =>
      scrollFocusedCardIntoViewHorizontally({
        target: {}
      } as unknown as FocusEvent)
    ).not.toThrow()
  })

  it('produces zero scrollTo calls for a fully visible card', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 200, right: 356 },
      { left: 100, right: 700 },
      300
    )
    scrollFocusedCardIntoViewHorizontally(ev)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('a card flush with the track edges is fully visible', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 100, right: 256 },
      { left: 100, right: 700 },
      0
    )
    scrollFocusedCardIntoViewHorizontally(ev)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('a card left of the track scrolls its left edge flush with the track left', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 60, right: 216 },
      { left: 100, right: 700 },
      300
    )
    scrollFocusedCardIntoViewHorizontally(ev)
    // 300 + (60 - 100) = 260
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ left: 260, behavior: 'smooth' })
  })

  it('a card past the right edge scrolls by exactly the overhang', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 600, right: 756 },
      { left: 100, right: 700 },
      300
    )
    scrollFocusedCardIntoViewHorizontally(ev)
    // overhang is 756 - 700 = 56 -> 300 + 56
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ left: 356, behavior: 'smooth' })
  })

  it('measures against the track rect, not an offsetParent', () => {
    // The track itself sits at left:500 in the window; a card at left:480 is
    // 20px left of it regardless of how the card is positioned in its parent.
    const { ev, scrollTo } = makeEvent(
      { left: 480, right: 636 },
      { left: 500, right: 1100 },
      0
    )
    scrollFocusedCardIntoViewHorizontally(ev)
    expect(scrollTo).toHaveBeenCalledWith({ left: -20, behavior: 'smooth' })
  })
})

describe('scrollFocusedCardIntoViewHorizontally -- edge clearance (G-48-8a / G-48-8b)', () => {
  // The list's inline padding is the clearance a focused card keeps from the
  // track edge, so its 3px ring at +2px offset (scaled 1.05) is not cut. It is
  // read from the list's computed style at call time, never restated here.
  interface Rect {
    left: number
    right: number
  }

  const makeEvent = (
    cardRect: Rect,
    trackRect: Rect,
    scrollLeft: number,
    firstElementChild: unknown = {}
  ) => {
    const scrollTo = jest.fn()
    const track = {
      scrollLeft,
      scrollTo,
      firstElementChild,
      getBoundingClientRect: () => trackRect
    }
    const target = {
      closest: (sel: string) => (sel === '.focusRowTrack' ? track : null),
      getBoundingClientRect: () => cardRect
    }
    return { ev: { target } as unknown as FocusEvent, scrollTo }
  }

  const padded =
    (paddingLeft: string, paddingRight: string) =>
    (): {
      paddingLeft: string
      paddingRight: string
    } => ({ paddingLeft, paddingRight })
  const twelve = padded('12px', '12px')
  const trackRect = { left: 100, right: 700 }

  it('Test A: a card flush with the right edge scrolls by the right clearance', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 544, right: 700 },
      trackRect,
      300
    )
    scrollFocusedCardIntoViewHorizontally(ev, twelve)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ left: 312, behavior: 'smooth' })
  })

  it('Test B: a card flush with the left edge scrolls back by the left clearance', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 100, right: 256 },
      trackRect,
      300
    )
    scrollFocusedCardIntoViewHorizontally(ev, twelve)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ left: 288, behavior: 'smooth' })
  })

  it('Test C: a card at least the clearance inside both edges does not scroll', () => {
    const left = makeEvent({ left: 112, right: 268 }, trackRect, 300)
    scrollFocusedCardIntoViewHorizontally(left.ev, twelve)
    expect(left.scrollTo).not.toHaveBeenCalled()

    const right = makeEvent({ left: 532, right: 688 }, trackRect, 300)
    scrollFocusedCardIntoViewHorizontally(right.ev, twelve)
    expect(right.scrollTo).not.toHaveBeenCalled()
  })

  it('Test D: a card past the right edge scrolls by the overhang plus the clearance', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 600, right: 756 },
      trackRect,
      300
    )
    scrollFocusedCardIntoViewHorizontally(ev, twelve)
    // overhang 756 - 700 = 56, plus 12 of clearance
    expect(scrollTo).toHaveBeenCalledWith({ left: 368, behavior: 'smooth' })
  })

  it('reads each side from its own padding, not a shared value', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 544, right: 700 },
      trackRect,
      300
    )
    scrollFocusedCardIntoViewHorizontally(ev, padded('4px', '20px'))
    expect(scrollTo).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' })
  })

  it.each(['', 'auto', 'NaN', '-8px'])(
    'Test E: an unreadable padding (%p) gives zero clearance, so a flush card does not scroll',
    (value) => {
      const { ev, scrollTo } = makeEvent(
        { left: 544, right: 700 },
        trackRect,
        300
      )
      scrollFocusedCardIntoViewHorizontally(ev, padded(value, value))
      expect(scrollTo).not.toHaveBeenCalled()
    }
  )

  it('Test E: a track with no firstElementChild gives zero clearance', () => {
    const getStyle = jest.fn(twelve)
    const { ev, scrollTo } = makeEvent(
      { left: 100, right: 256 },
      trackRect,
      300,
      null
    )
    scrollFocusedCardIntoViewHorizontally(ev, getStyle)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(getStyle).not.toHaveBeenCalled()
  })

  it('Test E: a getStyle that throws is zero clearance, not a throw in a capture-phase listener', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 100, right: 256 },
      trackRect,
      300
    )
    expect(() =>
      scrollFocusedCardIntoViewHorizontally(ev, () => {
        throw new Error('no style')
      })
    ).not.toThrow()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('still scrolls a card that is genuinely outside the track by the plain overhang when clearance is zero', () => {
    const { ev, scrollTo } = makeEvent(
      { left: 60, right: 216 },
      trackRect,
      300,
      null
    )
    scrollFocusedCardIntoViewHorizontally(ev, twelve)
    expect(scrollTo).toHaveBeenCalledWith({ left: 260, behavior: 'smooth' })
  })
})

describe('measureCardPitch', () => {
  const makeTrack = (cardWidth: number) => ({
    firstElementChild: {
      firstElementChild: {
        getBoundingClientRect: () => ({ width: cardWidth })
      }
    }
  })

  it('adds the list gap (from computed style) to the measured card width', () => {
    const pitch = measureCardPitch(
      makeTrack(156) as unknown as Element,
      () => ({ columnGap: '24px' })
    )
    expect(pitch).toBe(180)
  })

  it('falls back to the default tile width + 24 for an empty track (261011-t4y)', () => {
    expect(measureCardPitch(null, () => ({ columnGap: '24px' }))).toBe(
      LIBRARY_TILE_WIDTH_DEFAULT + 24
    )
    expect(
      measureCardPitch({ firstElementChild: null } as unknown as Element)
    ).toBe(LIBRARY_TILE_WIDTH_DEFAULT + 24)
  })

  it('falls back per-measurement when only the gap is unreadable', () => {
    const pitch = measureCardPitch(
      makeTrack(200) as unknown as Element,
      () => ({ columnGap: 'normal' })
    )
    expect(pitch).toBe(224)
  })

  it('measures the second child, not a double-width hero first card (261011-ulj D-02)', () => {
    const track = {
      firstElementChild: {
        firstElementChild: {
          getBoundingClientRect: () => ({ width: 336 }),
          nextElementSibling: {
            getBoundingClientRect: () => ({ width: 156 })
          }
        }
      }
    }
    expect(
      measureCardPitch(track as unknown as Element, () => ({
        columnGap: '24px'
      }))
    ).toBe(180)
  })

  it('falls back to a lone first child when there is no sibling (261011-ulj D-02)', () => {
    const track = {
      firstElementChild: {
        firstElementChild: {
          getBoundingClientRect: () => ({ width: 156 }),
          nextElementSibling: null
        }
      }
    }
    expect(
      measureCardPitch(track as unknown as Element, () => ({
        columnGap: '24px'
      }))
    ).toBe(180)
  })
})

describe('next-frame runner (G-48-11a, WR-01)', () => {
  // A hand-built frame queue: handles are incrementing numbers, `fireAll` runs
  // the queued callbacks the way a browser frame would, and a callback fired late
  // (after cancel) is still invoked so the runner's own guard is what is tested.
  const setup = (run: () => void) => {
    const queue = new Map<number, () => void>()
    let next = 1
    const schedule = jest.fn((cb: () => void) => {
      const handle = next++
      queue.set(handle, cb)
      return handle
    })
    const cancel = jest.fn((handle: unknown) => {
      queue.delete(handle as number)
    })
    const callbacks: Array<() => void> = []
    const scheduleKeep = jest.fn((cb: () => void) => {
      callbacks.push(cb)
      return schedule(cb)
    })
    const runner = createNextFrameRunner(run, scheduleKeep, cancel)
    return {
      runner,
      schedule: scheduleKeep,
      cancel,
      pending: () => queue.size,
      fireAll: () => {
        const due = [...queue.values()]
        queue.clear()
        due.forEach((cb) => cb())
      },
      fireLate: () => callbacks.forEach((cb) => cb())
    }
  }

  it('N1: request() does not run synchronously and schedules once', () => {
    const run = jest.fn()
    const { runner, schedule } = setup(run)
    runner.request()
    expect(run).not.toHaveBeenCalled()
    expect(schedule).toHaveBeenCalledTimes(1)
  })

  it('N2: the scheduled callback runs the work exactly once', () => {
    const run = jest.fn()
    const { runner, fireAll } = setup(run)
    runner.request()
    fireAll()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('N3: several requests before the frame produce one run and one pending frame', () => {
    const run = jest.fn()
    const { runner, fireAll, pending } = setup(run)
    runner.request()
    runner.request()
    runner.request()
    expect(pending()).toBe(1)
    fireAll()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('N4: cancel() cancels the pending handle, the work never runs, and cancel is idempotent', () => {
    const run = jest.fn()
    const { runner, cancel, fireAll, fireLate, pending } = setup(run)
    runner.request()
    runner.cancel()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith(1)
    expect(pending()).toBe(0)
    fireAll()
    fireLate()
    expect(run).not.toHaveBeenCalled()
    runner.cancel()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('N4: cancel() with nothing pending is a no-op', () => {
    const run = jest.fn()
    const { runner, cancel } = setup(run)
    expect(() => runner.cancel()).not.toThrow()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('N5: after a frame has run a new request schedules again', () => {
    const run = jest.fn()
    const { runner, schedule, fireAll } = setup(run)
    runner.request()
    fireAll()
    runner.request()
    expect(schedule).toHaveBeenCalledTimes(2)
    fireAll()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('N5: a run that throws neither escapes the frame callback nor sticks the runner', () => {
    const run = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })
      .mockImplementation(() => undefined)
    const { runner, schedule, fireAll } = setup(run)
    runner.request()
    expect(() => fireAll()).not.toThrow()
    runner.request()
    expect(schedule).toHaveBeenCalledTimes(2)
    fireAll()
    expect(run).toHaveBeenCalledTimes(2)
  })

  describe('with no injected scheduler', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('N6: defers through setTimeout where requestAnimationFrame is not a function', () => {
      expect(typeof requestAnimationFrame).not.toBe('function')
      jest.useFakeTimers()
      const run = jest.fn()
      const runner = createNextFrameRunner(run)
      runner.request()
      expect(run).not.toHaveBeenCalled()
      jest.advanceTimersByTime(50)
      expect(run).toHaveBeenCalledTimes(1)
    })
  })
})
