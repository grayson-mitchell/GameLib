/**
 * Behaviour table for the focus-row overflow arithmetic (Phase 48 Plan 04,
 * Task 1). The Frontend jest project is `testEnvironment: 'node'` -- no
 * jsdom -- so every function under test takes a plain measurement object
 * or a hand-built event stub rather than a live element.
 */
import {
  GRID_CARD_MIN_WIDTH,
  canScrollBack,
  canScrollForward,
  createStripCardWidthSync,
  gridColumnCount,
  gridColumnWidth,
  measureCardPitch,
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

  it('P1: pages exactly one grid row in the zero-slack geometry (G-48-8c)', () => {
    // Matched cards fill the content box exactly, so the track is
    // n x pitch wide with no slack, and clientWidth is an integer-rounded
    // read of it. A bare floor(clientWidth / pitch) paged n - 1 cards at about
    // half of all widths (desk sweep: 4951 mismatches with no tolerance).
    const bad: string[] = []
    for (let i = 0; 156 + i * 0.37 <= 3000; i++) {
      const c = 156 + i * 0.37
      const n = gridColumnCount(c)
      const pitch = gridColumnWidth(c) + 24
      for (const clientWidth of [Math.round(c + 24), Math.floor(c + 24)]) {
        const got = pageScrollDelta(m(clientWidth, 99999, 0), pitch)
        if (Math.abs(got - n * pitch) > 1e-6) {
          bad.push(
            `C=${c} clientWidth=${clientWidth} got ${got} want ${n * pitch}`
          )
        }
      }
    }
    expect(bad).toEqual([])
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

  it('falls back to the grid minimum + 24 for an empty track (G-48-8c)', () => {
    expect(measureCardPitch(null, () => ({ columnGap: '24px' }))).toBe(
      GRID_CARD_MIN_WIDTH + 24
    )
    expect(
      measureCardPitch({ firstElementChild: null } as unknown as Element)
    ).toBe(GRID_CARD_MIN_WIDTH + 24)
  })

  it('falls back per-measurement when only the gap is unreadable', () => {
    const pitch = measureCardPitch(
      makeTrack(200) as unknown as Element,
      () => ({ columnGap: 'normal' })
    )
    expect(pitch).toBe(224)
  })
})

describe('grid column arithmetic (G-48-8c)', () => {
  // repeat(auto-fill, minmax(156px, 1fr)) over a content box C with a 24px gap.
  it('W1: 958 wide (UAT item 4 macOS, window 1280) is 5 columns of 172.4', () => {
    expect(gridColumnCount(958, 156, 24)).toBe(5)
    expect(gridColumnWidth(958, 156, 24)).toBeCloseTo(172.4, 9)
  })

  it('W2: 198 wide (window 520) is 1 column of 198', () => {
    expect(gridColumnCount(198, 156, 24)).toBe(1)
    expect(gridColumnWidth(198, 156, 24)).toBe(198)
  })

  it('W3: narrower than the minimum, the grid overflows at its floor', () => {
    expect(gridColumnWidth(100, 156, 24)).toBe(156)
    expect(gridColumnCount(100, 156, 24)).toBe(1)
  })

  it('W4: the second column fits at exact equality, not a pixel before', () => {
    expect(gridColumnCount(336, 156, 24)).toBe(2)
    expect(gridColumnWidth(336, 156, 24)).toBe(156)
    expect(gridColumnCount(335.9, 156, 24)).toBe(1)
    expect(gridColumnWidth(335.9, 156, 24)).toBe(335.9)
  })

  it('W5: the columns fill the box exactly and one more would not fit, 156 to 4000', () => {
    const bad: string[] = []
    for (let i = 0; 156 + i * 0.37 <= 4000; i++) {
      const c = 156 + i * 0.37
      const n = gridColumnCount(c, 156, 24)
      const w = gridColumnWidth(c, 156, 24)
      if (Math.abs(n * w + (n - 1) * 24 - c) > 1e-6) bad.push(`fill C=${c}`)
      if (w < 156) bad.push(`floor C=${c}`)
      if (!((n + 1) * 156 + n * 24 > c)) bad.push(`more C=${c}`)
    }
    expect(bad).toEqual([])
  })

  it('W6: a non-finite, zero or negative width is the minimum; a bad gap is the 24px fallback', () => {
    for (const c of [NaN, Infinity, -Infinity, 0, -5]) {
      expect(gridColumnWidth(c, 156, 24)).toBe(156)
      expect(gridColumnCount(c, 156, 24)).toBe(1)
    }
    expect(gridColumnWidth(958, 156, NaN)).toBeCloseTo(172.4, 9)
    expect(gridColumnWidth(958, 156, -4)).toBeCloseTo(172.4, 9)
    expect(Number.isFinite(gridColumnWidth(NaN, NaN, NaN))).toBe(true)
  })

  it('defaults to the exported grid minimum and the 24px gap', () => {
    expect(GRID_CARD_MIN_WIDTH).toBe(156)
    expect(gridColumnWidth(958)).toBeCloseTo(172.4, 9)
  })
})

describe('strip card width sync (G-48-8c)', () => {
  const PROP = '--focus-row-card-width'

  const makeTrack = (width: number, inline = '') => {
    const store = new Map<string, string>()
    if (inline) store.set(PROP, inline)
    const setProperty = jest.fn((k: string, v: string) => {
      store.set(k, v)
    })
    return {
      getBoundingClientRect: () => ({ width }),
      firstElementChild: {},
      style: {
        getPropertyValue: (k: string) => store.get(k) ?? '',
        setProperty
      },
      setProperty
    }
  }
  const asEl = (t: unknown) => t as HTMLElement
  const style = () => ({
    paddingLeft: '12px',
    paddingRight: '12px',
    columnGap: '24px'
  })

  it('S1: writes the derived width once and returns it (982 - 2 x 12 = 958 -> 172.4)', () => {
    const sync = createStripCardWidthSync()
    const track = makeTrack(982)
    const got = sync(asEl(track), style)
    expect(track.setProperty).toHaveBeenCalledTimes(1)
    expect(track.setProperty).toHaveBeenCalledWith(PROP, '172.4px')
    expect(got).toBe(172.4)
  })

  it.each([
    ['172.4px', 172.4],
    ['172.2px', 172.2]
  ])(
    'S2: an inline value within 0.5px (%s) is not rewritten',
    (inline, want) => {
      const sync = createStripCardWidthSync()
      const track = makeTrack(982, inline)
      expect(sync(asEl(track), style)).toBe(want)
      expect(track.setProperty).not.toHaveBeenCalled()
    }
  )

  it('S2: an inline value 0.5px or more away is rewritten', () => {
    const sync = createStripCardWidthSync()
    const track = makeTrack(982, '156px')
    expect(sync(asEl(track), style)).toBe(172.4)
    expect(track.setProperty).toHaveBeenCalledWith(PROP, '172.4px')
  })

  it('S3: is total -- null track, no list, unmeasurable width, throwing getStyle', () => {
    const sync = createStripCardWidthSync()
    expect(sync(null, style)).toBeNull()

    const noList = makeTrack(982)
    noList.firstElementChild = null as unknown as Record<string, never>
    expect(sync(asEl(noList), style)).toBeNull()
    expect(noList.setProperty).not.toHaveBeenCalled()

    for (const width of [0, NaN, -10, 20]) {
      const t = makeTrack(width)
      expect(sync(asEl(t), style)).toBeNull()
      expect(t.setProperty).not.toHaveBeenCalled()
    }

    const throwing = makeTrack(982)
    expect(
      sync(asEl(throwing), () => {
        throw new Error('no style')
      })
    ).toBeNull()
    expect(throwing.setProperty).not.toHaveBeenCalled()
  })

  it('S3: an unreadable gap uses the 24px fallback', () => {
    const sync = createStripCardWidthSync()
    const track = makeTrack(982)
    expect(
      sync(asEl(track), () => ({
        paddingLeft: '12px',
        paddingRight: '12px',
        columnGap: 'normal'
      }))
    ).toBe(172.4)
  })

  it('S4: two track elements with identical geometry each get their own write', () => {
    const sync = createStripCardWidthSync()
    const first = makeTrack(982)
    const second = makeTrack(982)
    sync(asEl(first), style)
    sync(asEl(second), style)
    expect(first.setProperty).toHaveBeenCalledTimes(1)
    expect(second.setProperty).toHaveBeenCalledTimes(1)
  })
})
