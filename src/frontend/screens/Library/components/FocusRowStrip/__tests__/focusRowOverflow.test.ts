/**
 * Behaviour table for the focus-row overflow arithmetic (Phase 48 Plan 04,
 * Task 1). The Frontend jest project is `testEnvironment: 'node'` -- no
 * jsdom -- so every function under test takes a plain measurement object
 * or a hand-built event stub rather than a live element.
 */
import {
  canScrollBack,
  canScrollForward,
  pageScrollDelta,
  scrollFocusedCardIntoViewHorizontally
} from '../focusRowOverflow'

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
