/**
 * Library tile width (quick 261011-t4y).
 *
 * The Library's tile-size slider is the only thing that sets how wide a tile
 * is. Window width changes how many columns fit, never how wide a column is.
 * This module is the pure half: the range, the clamp, the localStorage round
 * trip, and the one place that writes `--library-tile-width` onto an element.
 * No React, so a node-environment test can exercise all of it.
 *
 * T-261011-t4y-01: every value that reaches `setProperty` first passes
 * `clampLibraryTileWidth`, so a tampered storage string can never become a
 * CSS value. Nothing here ever forwards a raw string.
 */

/**
 * Narrowest tile, in CSS px at zoom 1. Bound by the controller-mode art-fit
 * gate (`gameCardControllerGeometry.test.ts`): the art must clear the 35px
 * badge bar, `w * (275/173 - 4/3) >= 35`, so `w >= 136.6px`. 140 is the first
 * step-aligned value above that.
 */
export const LIBRARY_TILE_WIDTH_MIN = 140

/**
 * Widest tile, in CSS px at zoom 1. Bound by the strip-end clearance gate
 * (`focusRowStripSource.test.ts`): the hover ring reach `0.025w + 5.25` must
 * stay within the strip's 15px inline padding. That holds to 390px; 320 sits
 * inside the 336px supremum the gate was already proven at.
 */
export const LIBRARY_TILE_WIDTH_MAX = 320

/**
 * Slider step. `(DEFAULT - MIN)` and `(MAX - MIN)` are both multiples of it,
 * so the default and both ends are reachable exactly.
 */
export const LIBRARY_TILE_WIDTH_STEP = 4

/**
 * Default tile width. Equals the old `minmax(156px, 1fr)` floor and every
 * `var(--focus-row-card-width, 156px)` fallback, so a fresh profile tiles the
 * way the narrowest old layout did.
 */
export const LIBRARY_TILE_WIDTH_DEFAULT = 156

export const LIBRARY_TILE_WIDTH_STORAGE_KEY = 'libraryTileWidth'

/**
 * Coerces anything to a legal tile width: finite, snapped to
 * `MIN + k * STEP`, clamped to `[MIN, MAX]`. Anything that is not a finite
 * number (null, undefined, '', 'abc', NaN, Infinity) gives the default.
 */
export function clampLibraryTileWidth(value: unknown): number {
  let parsed = NaN
  if (typeof value === 'number') {
    parsed = value
  } else if (typeof value === 'string') {
    parsed = value.trim() === '' ? NaN : Number(value)
  }
  if (!Number.isFinite(parsed)) {
    return LIBRARY_TILE_WIDTH_DEFAULT
  }
  const snapped =
    LIBRARY_TILE_WIDTH_MIN +
    Math.round((parsed - LIBRARY_TILE_WIDTH_MIN) / LIBRARY_TILE_WIDTH_STEP) *
      LIBRARY_TILE_WIDTH_STEP
  return Math.min(
    LIBRARY_TILE_WIDTH_MAX,
    Math.max(LIBRARY_TILE_WIDTH_MIN, snapped)
  )
}

/** Reads the saved width. Total: a throwing or empty storage gives the default. */
export function readLibraryTileWidth(
  storage: Pick<Storage, 'getItem'>
): number {
  try {
    return clampLibraryTileWidth(
      storage.getItem(LIBRARY_TILE_WIDTH_STORAGE_KEY)
    )
  } catch {
    return LIBRARY_TILE_WIDTH_DEFAULT
  }
}

/**
 * Persists the clamped width and returns it. Total: returns the clamped value
 * even when the storage write throws.
 */
export function writeLibraryTileWidth(
  storage: Pick<Storage, 'setItem'>,
  width: unknown
): number {
  const clamped = clampLibraryTileWidth(width)
  try {
    storage.setItem(LIBRARY_TILE_WIDTH_STORAGE_KEY, String(clamped))
  } catch {
    // Storage full or blocked: the slider still works for this session.
  }
  return clamped
}

type StyleTarget = {
  style: { setProperty(name: string, value: string): void }
}

/**
 * Publishes the clamped width as `--library-tile-width` (CSS px). `.listing`
 * derives the zoom-compensated column width from it. Total: a null target or
 * a throwing `setProperty` is swallowed.
 */
export function applyLibraryTileWidth(
  target: StyleTarget | null | undefined,
  width: unknown
): void {
  if (!target) return
  const clamped = clampLibraryTileWidth(width)
  try {
    target.style.setProperty('--library-tile-width', `${clamped}px`)
  } catch {
    // A style write must never break the Library.
  }
}
