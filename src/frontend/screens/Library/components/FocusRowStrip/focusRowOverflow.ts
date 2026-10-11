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

import { LIBRARY_TILE_WIDTH_DEFAULT } from '../../libraryTileSize'

export interface TrackMeasurement {
  clientWidth: number
  scrollWidth: number
  scrollLeft: number
}

// Layout can be fractional. Anything under a pixel of travel is not travel a
// control can usefully offer -- a permanently-enabled control that scrolls
// nothing is worse than a disabled one.
const SUBPIXEL_EPSILON = 1

// 1.5rem at the 16px root `styles/_typography.scss` sets on `:root`. The
// grid's `grid-gap` and the strip's `gap` both read 1.5rem; this is only the
// fallback when the computed gap is unreadable.
const FALLBACK_CARD_GAP = 24

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
 * Tiles are fixed-width, so a page is the whole cards that fit the track. The
 * track is the viewport box, which bleeds 15px out each side (index.css), so
 * its `clientWidth` is the grid's content width C plus 30px, i.e. `n x pitch
 * + 6` for the `n` columns the grid fits (`n x pitch = C + 24`): 6px of slack
 * wider than the grid's content box, so a bare `floor(clientWidth / pitch)`
 * returns the grid's column count or one more. The `SUBPIXEL_EPSILON`
 * tolerance is kept as a defence for the zero-slack case (`clientWidth = n x
 * pitch` read back integer-rounded, which a bare floor pages one card short at
 * about half of all widths): a card short of fitting by under a pixel counts
 * as visible.
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
      : LIBRARY_TILE_WIDTH_DEFAULT) +
    (Number.isFinite(gap) ? gap : FALLBACK_CARD_GAP)
  )
}

/**
 * G-48-11a, 48-REVIEW.md WR-01. Runs `run` on the next animation frame, never
 * synchronously, at most once per frame, cancellable.
 *
 * Its work is a deferred re-measure. The strip's `ResizeObserver` callback only
 * reads and requests; the state update that follows runs in the frame instead
 * of inside the delivery that reported the size, so the browser has no
 * undelivered notifications to report as `ResizeObserver loop completed with
 * undelivered notifications` (27 and 25 in two live launches of UAT item 11's
 * resize sweep).
 *
 * Total: a throwing `run` neither escapes the frame callback nor leaves the
 * runner stuck, and `cancel` is idempotent. A frame callback that fires after
 * `cancel` (a stub or a browser that ignores the cancel) does nothing. Without
 * `requestAnimationFrame` (the `node` jest project) it falls back to
 * `setTimeout(cb, 0)`.
 */
export function createNextFrameRunner(
  run: () => void,
  schedule: (cb: () => void) => unknown = defaultSchedule,
  cancel: (handle: unknown) => void = defaultCancel
): { request: () => void; cancel: () => void } {
  let pending = false
  let handle: unknown
  // Each scheduled frame owns a ticket; only the current ticket may run.
  let ticket = 0

  return {
    request() {
      if (pending) {
        return
      }
      pending = true
      const mine = ++ticket
      handle = schedule(() => {
        if (!pending || mine !== ticket) {
          return
        }
        pending = false
        handle = undefined
        try {
          run()
        } catch {
          // a failed re-measure must not break the next one
        }
      })
    },
    cancel() {
      if (!pending) {
        return
      }
      pending = false
      ticket++
      const h = handle
      handle = undefined
      try {
        cancel(h)
      } catch {
        // nothing left to cancel
      }
    }
  }
}

const defaultSchedule = (cb: () => void): unknown =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(() => cb())
    : setTimeout(cb, 0)

const defaultCancel = (handle: unknown): void => {
  if (typeof requestAnimationFrame === 'function') {
    cancelAnimationFrame(handle as number)
  } else {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
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
