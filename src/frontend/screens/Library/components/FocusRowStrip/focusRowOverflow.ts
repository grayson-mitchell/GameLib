/**
 * Overflow arithmetic for the focus-row strip (Phase 48 Plan 04).
 *
 * Everything here takes a plain `{ clientWidth, scrollWidth, scrollLeft }`
 * measurement or a real `FocusEvent`, never a `RefObject`, so the arithmetic
 * is unit-testable in the Frontend jest project (`testEnvironment: 'node'`,
 * no jsdom) with hand-built stubs.
 *
 * This module is about pixels and viewport width. It deliberately shares no
 * constant with `FOCUS_ROW_MAX_CARDS`, which is R3's display cap on cards.
 */

export interface TrackMeasurement {
  clientWidth: number
  scrollWidth: number
  scrollLeft: number
}

// Layout can be fractional. Anything under a pixel of travel is not travel a
// control can usefully offer -- a permanently-enabled control that scrolls
// nothing is worse than a disabled one.
const SUBPIXEL_EPSILON = 1

/**
 * The grid's `minmax()` floor: `Library/index.css` `.gameList` declares
 * `repeat(auto-fill, minmax(156px, 1fr))`. Mirrored here because JS cannot read
 * a stylesheet rule; `focusRowStripSource.test.ts` pins it equal to that
 * stylesheet (and to the strip's own CSS fallback), so the two cannot drift.
 * Also `measureCardPitch`'s no-measurement width.
 */
export const GRID_CARD_MIN_WIDTH = 156

// 1.5rem at the 16px root `styles/_typography.scss` sets on `:root`. The
// grid's `grid-gap` and the strip's `gap` both read 1.5rem; this is only the
// fallback when the computed gap is unreadable.
const FALLBACK_CARD_GAP = 24

// A derived width within this of the element's own inline value is not
// rewritten: a sub-pixel jitter in the measurement must not become a style
// write (and so a ResizeObserver delivery) on every frame (T-48-36).
const WIDTH_WRITE_EPSILON = 0.5

const isFiniteMeasurement = (m: TrackMeasurement): boolean =>
  Number.isFinite(m.clientWidth) &&
  Number.isFinite(m.scrollWidth) &&
  Number.isFinite(m.scrollLeft)

const maxScrollLeft = (m: TrackMeasurement): number =>
  m.scrollWidth - m.clientWidth

/**
 * One page of travel in pixels: the number of whole cards that fit at the
 * current width times the card pitch. Positive; the caller negates it for
 * the back direction. Floored to one card so a control can never be a
 * live-looking no-op, and always finite.
 *
 * A card short of fitting by under a pixel counts as visible: matched cards
 * fill the track with no slack (G-48-8c), and `clientWidth` is an
 * integer-rounded read, so a bare `floor(clientWidth / pitch)` paged one card
 * short at about half of all widths. With the tolerance a page is exactly one
 * grid row.
 */
export function pageScrollDelta(
  m: TrackMeasurement,
  cardPitch: number
): number {
  if (!Number.isFinite(cardPitch) || cardPitch <= 0) {
    return 0
  }
  if (!Number.isFinite(m.clientWidth) || m.clientWidth <= 0) {
    return cardPitch
  }
  return (
    Math.max(1, Math.floor((m.clientWidth + SUBPIXEL_EPSILON) / cardPitch)) *
    cardPitch
  )
}

export function canScrollForward(m: TrackMeasurement): boolean {
  if (!isFiniteMeasurement(m)) {
    return false
  }
  const max = maxScrollLeft(m)
  return max > SUBPIXEL_EPSILON && max - m.scrollLeft > SUBPIXEL_EPSILON
}

export function canScrollBack(m: TrackMeasurement): boolean {
  if (!isFiniteMeasurement(m)) {
    return false
  }
  return maxScrollLeft(m) > SUBPIXEL_EPSILON && m.scrollLeft > SUBPIXEL_EPSILON
}

/**
 * Card pitch (card width + inter-card gap), read from the live track rather
 * than restated: `track.firstElementChild` is the `.gameList`, whose first
 * child is a card wrapper. The gap comes from the list's computed style so
 * the CSS stays the one place the value is written.
 */
export function measureCardPitch(
  track: Element | null,
  getStyle: (el: Element) => { columnGap: string } = (el) =>
    typeof getComputedStyle === 'function'
      ? getComputedStyle(el)
      : { columnGap: '' }
): number {
  const list = track?.firstElementChild ?? null
  const card = list?.firstElementChild ?? null
  const measured = card ? card.getBoundingClientRect().width : NaN
  const gap = list ? parseFloat(getStyle(list).columnGap) : NaN
  return (
    (Number.isFinite(measured) && measured > 0
      ? measured
      : GRID_CARD_MIN_WIDTH) + (Number.isFinite(gap) ? gap : FALLBACK_CARD_GAP)
  )
}

const sanitiseMin = (minWidth: number): number =>
  Number.isFinite(minWidth) && minWidth > 0 ? minWidth : GRID_CARD_MIN_WIDTH

const sanitiseGap = (gap: number): number =>
  Number.isFinite(gap) && gap >= 0 ? gap : FALLBACK_CARD_GAP

/**
 * Column count of `repeat(auto-fill, minmax(minWidth, 1fr))` over a content
 * box of `contentWidth` with `gap` between columns: the largest n with
 * `n x minWidth + (n - 1) x gap <= contentWidth`, at least 1. No epsilon:
 * CSS Grid decides the repetition count at exact equality, and an epsilon
 * would disagree with the browser across a whole 1px band instead of at a
 * single point. A non-finite or non-positive width is one column.
 */
export function gridColumnCount(
  contentWidth: number,
  minWidth: number = GRID_CARD_MIN_WIDTH,
  gap: number = FALLBACK_CARD_GAP
): number {
  const min = sanitiseMin(minWidth)
  const g = sanitiseGap(gap)
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) {
    return 1
  }
  return Math.max(1, Math.floor((contentWidth + g) / (min + g)))
}

/**
 * Width of one grid column over `contentWidth`: the `1fr` share left after the
 * gaps, never under the minimum (a box narrower than the minimum overflows at
 * the floor, as the grid does). Always finite.
 */
export function gridColumnWidth(
  contentWidth: number,
  minWidth: number = GRID_CARD_MIN_WIDTH,
  gap: number = FALLBACK_CARD_GAP
): number {
  const min = sanitiseMin(minWidth)
  const g = sanitiseGap(gap)
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) {
    return min
  }
  const n = gridColumnCount(contentWidth, min, g)
  return Math.max(min, (contentWidth - (n - 1) * g) / n)
}

interface StripWidthStyle {
  paddingLeft: string
  paddingRight: string
  columnGap: string
}

/**
 * G-48-8c, and the operator's 2026-10-07 ruling "match the grid" that amends
 * D-01: a focus-row strip card is the width one grid column takes. Returns a
 * `syncCardWidth(track, getStyle?)` that derives that width and writes it as
 * the inline `--focus-row-card-width` on `.focusRowTrack`, which the stylesheet
 * consumes as the card's flex basis (156px, the grid's floor, until the first
 * write and whenever measurement is impossible).
 *
 * It DERIVES the width by the grid's own arithmetic rather than reading the
 * rendered grid:
 *  1. Same input, so identical by construction. `.focusRowStrip` and the
 *     grid's `.gameList` are both direct children of `.listing` and both pad
 *     inline by `--space-md-fixed`; the viewport bleeds out by exactly the
 *     list's padding, so the content box C below is the grid's content box.
 *  2. Reading the grid would tie the strip to grid state. The grid is not
 *     mounted for a zero-result filter, during a refresh, or in list layout,
 *     and SPEC R4 makes the focus row independent of filter state.
 *  3. It is provable at the desk: a pure function plus a stubbed element.
 *
 * C is the track's border-box width (a fractional `getBoundingClientRect`, not
 * the integer-rounded `clientWidth`) less the list's two inline paddings.
 * Total: no track, no list, an unmeasurable width or a throwing `getStyle` is
 * `null` with no write and no throw (T-48-37). A derived width within
 * `WIDTH_WRITE_EPSILON` of the element's own inline value is not rewritten
 * (T-48-36); the comparison is against each element's own value, so a
 * remounted track is never left on the fallback.
 *
 * The property name is a string literal at the `setProperty` call on purpose:
 * `cssTokenSweep` only counts a custom property as declared when it sees
 * `setProperty('--name'`, and would otherwise report the CSS's
 * `var(--focus-row-card-width, ...)` as undefined.
 */
export function createStripCardWidthSync() {
  return function syncCardWidth(
    track: HTMLElement | null,
    getStyle: (el: Element) => StripWidthStyle = (el) =>
      typeof getComputedStyle === 'function'
        ? getComputedStyle(el)
        : { paddingLeft: '', paddingRight: '', columnGap: '' }
  ): number | null {
    try {
      const list = track?.firstElementChild ?? null
      if (!track || !list) {
        return null
      }
      const style = getStyle(list)
      const content =
        track.getBoundingClientRect().width -
        clearanceFrom(style.paddingLeft) -
        clearanceFrom(style.paddingRight)
      if (!Number.isFinite(content) || content <= 0) {
        return null
      }
      const width = gridColumnWidth(
        content,
        GRID_CARD_MIN_WIDTH,
        parseFloat(style.columnGap)
      )
      const inline = parseFloat(
        track.style.getPropertyValue('--focus-row-card-width')
      )
      if (
        Number.isFinite(inline) &&
        Math.abs(inline - width) < WIDTH_WRITE_EPSILON
      ) {
        return inline
      }
      const rounded = Number(width.toFixed(3))
      track.style.setProperty('--focus-row-card-width', `${rounded}px`)
      return rounded
    } catch {
      return null
    }
  }
}

/**
 * Horizontal analogue of `GamesList`'s vertical `scrollCardIntoView`, and
 * net-new rather than a parameterisation of it: that one is wired to
 * `main.content`'s `scrollTop`.
 *
 * The container is resolved AT CALL TIME from the event target, and the
 * handler returns silently when there is none, so a focus event from
 * anywhere else is a no-op rather than a throw in a capture-phase listener.
 * Both destinations are `track.scrollLeft + (card edge - track edge)`, both
 * measured from `getBoundingClientRect()` -- never an `offsetParent` offset,
 * which would turn a silent no-op into a silent wrong-offset scroll.
 *
 * The card is brought in to sit INSIDE the track by the list's inline padding,
 * not flush with the edge, so its 3px focus ring at +2px offset (scaled 1.05,
 * about 9px past the unscaled edge) is not cut by the track's clip. That
 * clearance is read from the list's computed `paddingLeft` / `paddingRight` at
 * call time, never restated here, so the CSS stays the one place it is
 * written (the same rule `measureCardPitch` follows for the gap). No list, an
 * unreadable padding or a non-finite value is zero clearance, which is the
 * flush behaviour this handler had before. The destinations are not clamped:
 * an RTL track can have a negative `scrollLeft`, and the browser clamps.
 */
export function scrollFocusedCardIntoViewHorizontally(
  ev: FocusEvent,
  getStyle: (el: Element) => { paddingLeft: string; paddingRight: string } = (
    el
  ) =>
    typeof getComputedStyle === 'function'
      ? getComputedStyle(el)
      : { paddingLeft: '', paddingRight: '' }
): void {
  const target = ev.target as HTMLElement | null
  if (!target || typeof target.closest !== 'function') {
    return
  }
  const track = target.closest<HTMLElement>('.focusRowTrack')
  if (!track) {
    return
  }

  const rect = target.getBoundingClientRect()
  const trackRect = track.getBoundingClientRect()
  const { left: clearLeft, right: clearRight } = readEdgeClearance(
    track.firstElementChild,
    getStyle
  )

  const minLeft = trackRect.left + clearLeft
  const maxRight = trackRect.right - clearRight

  if (rect.left < minLeft) {
    track.scrollTo({
      left: track.scrollLeft + (rect.left - minLeft),
      behavior: 'smooth'
    })
  } else if (rect.right > maxRight) {
    track.scrollTo({
      left: track.scrollLeft + (rect.right - maxRight),
      behavior: 'smooth'
    })
  }
}

/**
 * Inline padding of the track's list, as the room a focused card keeps from
 * each track edge. Total: any failure is zero clearance.
 */
function readEdgeClearance(
  list: Element | null,
  getStyle: (el: Element) => { paddingLeft: string; paddingRight: string }
): { left: number; right: number } {
  if (!list) {
    return { left: 0, right: 0 }
  }
  try {
    const style = getStyle(list)
    return {
      left: clearanceFrom(style.paddingLeft),
      right: clearanceFrom(style.paddingRight)
    }
  } catch {
    return { left: 0, right: 0 }
  }
}

const clearanceFrom = (value: string): number => {
  const px = parseFloat(value)
  return Number.isFinite(px) && px >= 0 ? px : 0
}
