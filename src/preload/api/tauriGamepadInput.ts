/**
 * Tauri renderer-side gamepad input (Phase 34.1 Plan 05, D-10).
 *
 * Electron injects synthetic input via `webContents.sendInputEvent` (`main.ts:1377`),
 * which Chromium turns into real keyboard/mouse events AND, for the four directional
 * actions, drives Chromium's own BUILT-IN spatial navigation. Tauri has no equivalent --
 * WKWebView and WebView2 do not implement Chromium's spatial navigation, so dispatching
 * an arrow `KeyboardEvent` alone would move nothing. This module is therefore a
 * re-derivation against DOM semantics, not a mechanical port (D-10's accepted cost): the
 * renderer computes every focus move and synthetic event itself instead of round-tripping
 * a native input event through a window that, under Tauri, cannot interpret it.
 *
 * `src/preload/api/misc.ts`'s Tauri-only body (Task 3) is the ONLY caller path into
 * this module; the sidecar registers nothing for the `gamepadAction` channel -- the
 * `UNPORTED_CHANNEL_MARKER` path is simply never reached because this short-circuit is
 * the only caller path.
 *
 * This module has no electron dependency and no `@tauri-apps/api` import -- it
 * is pure DOM. Every branch is TOTAL: the whole dispatch is wrapped in try/catch so a
 * failure `console.warn`s and the returned promise still resolves rather than rejects --
 * an unhandled rejection from `window.api.gamepadAction` firing every frame from the
 * Gamepad polling loop (`frontend/helpers/gamepad.ts`) would be worse than the no-op it
 * replaces (T-34.1-19).
 */
import type { GamepadActionArgs } from 'common/types'

const FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]'

const KEY_CODES: Record<string, number> = {
  Tab: 9,
  Escape: 27,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39
}

function warn(label: string, error?: unknown): void {
  if (error !== undefined) {
    console.warn(`[tauriGamepadInput] ${label}:`, error)
  } else {
    console.warn(`[tauriGamepadInput] ${label}`)
  }
}

function hasZeroArea(rect: DOMRect): boolean {
  return rect.width <= 0 || rect.height <= 0
}

/** Focusable elements, in document order, filtered to ones a user could actually reach. */
function getFocusableElements(): HTMLElement[] {
  const nodeList = document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  const result: HTMLElement[] = []
  nodeList.forEach((el) => {
    if ((el as HTMLInputElement | HTMLButtonElement).disabled) return
    if (el.getAttribute('aria-hidden') === 'true') return
    if (hasZeroArea(el.getBoundingClientRect())) return
    result.push(el)
  })
  return result
}

/** `document.activeElement`, narrowed -- `document.body` counts as "nothing focused". */
function activeElement(): HTMLElement | null {
  const el = document.activeElement
  if (!el || el === document.body) return null
  return el as HTMLElement
}

/**
 * `keyCode`/`which` are not part of the modern `KeyboardEventInit` constructor
 * dictionary (they're legacy readonly accessors on `KeyboardEvent.prototype`), so they
 * must be attached with `defineProperty` after construction -- assigning them directly
 * silently no-ops on a getter-only property.
 */
function makeKeyboardEvent(type: 'keydown' | 'keyup', key: string, keyCode: number, shiftKey: boolean): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    key,
    code: key,
    shiftKey,
    bubbles: true,
    cancelable: true
  })
  Object.defineProperty(event, 'keyCode', { value: keyCode, configurable: true })
  Object.defineProperty(event, 'which', { value: keyCode, configurable: true })
  return event
}

/**
 * Dispatches a `keydown` then a `keyup` `KeyboardEvent` on `target`, bubbling and
 * cancelable, with matching `key`/`code`/`keyCode`/`which` fields. Returns whether the
 * `keydown` was prevented -- `EventTarget.dispatchEvent()` returns `false` when a
 * cancelable event was prevented, so `defaultPrevented` is the negation of that.
 */
function dispatchKey(target: EventTarget, key: string, opts?: { shiftKey?: boolean }): boolean {
  const keyCode = KEY_CODES[key] ?? 0
  const shiftKey = opts?.shiftKey === true
  const keydownNotPrevented = target.dispatchEvent(makeKeyboardEvent('keydown', key, keyCode, shiftKey))
  target.dispatchEvent(makeKeyboardEvent('keyup', key, keyCode, shiftKey))
  return !keydownNotPrevented
}

function focusableIndex(list: HTMLElement[], el: HTMLElement | null): number {
  if (!el) return -1
  return list.indexOf(el)
}

/**
 * WR-02 (Phase 34.1 code review): two ordering bugs, both fixed here.
 *
 * 1. `dispatchKey`'s return value (whether the synthetic keydown was
 *    `preventDefault()`ed) was DISCARDED. `moveFocusDirectionally` already honours it
 *    (`if (prevented) return`); this did not, so whenever the app handled Tab itself --
 *    a modal focus trap, a custom focus manager -- focus moved TWICE: once by the app,
 *    once by this function.
 * 2. The focusable list was captured BEFORE the dispatch, so any DOM change the app's
 *    own Tab handler made (closing a dialog, opening a menu) left `list[nextIndex]`
 *    pointing at a detached/stale element. It is now recomputed AFTER.
 */
function doTab(shift: boolean): void {
  const current = activeElement()
  if (current && dispatchKey(current, 'Tab', { shiftKey: shift })) {
    // The app handled Tab itself -- do not move focus a second time.
    return
  }

  const list = getFocusableElements()
  if (list.length === 0) return

  const currentIndex = focusableIndex(list, current)
  let nextIndex: number
  if (currentIndex === -1) {
    nextIndex = shift ? list.length - 1 : 0
  } else {
    const delta = shift ? -1 : 1
    nextIndex = (((currentIndex + delta) % list.length) + list.length) % list.length
  }
  list[nextIndex]?.focus()
}

function doEsc(): void {
  const target: EventTarget = activeElement() ?? document
  dispatchKey(target, 'Escape')
}

function doBack(): void {
  // Electron used `mainWindow.webContents.goBack()`. For a hash/BrowserRouter SPA the
  // browser's own session-history stack is the same one Electron's webContents was
  // walking, so `window.history.back()` is the faithful Tauri equivalent.
  window.history.back()
}

function dispatchPointerSequence(target: Element, clientX: number, clientY: number, button: 0 | 2): void {
  const base: MouseEventInit = { bubbles: true, cancelable: true, clientX, clientY, button }
  // jsdom -- and, more importantly, some real webview test surfaces -- has no
  // `PointerEvent` global by default, so every step here is a `MouseEvent`, including
  // the ones named for pointer semantics (`pointerdown`/`pointerup`).
  if (button === 0) {
    target.dispatchEvent(new MouseEvent('pointerdown', base))
    target.dispatchEvent(new MouseEvent('mousedown', base))
    target.dispatchEvent(new MouseEvent('mouseup', base))
    target.dispatchEvent(new MouseEvent('pointerup', base))
    target.dispatchEvent(new MouseEvent('click', base))
  } else {
    target.dispatchEvent(new MouseEvent('mousedown', base))
    target.dispatchEvent(new MouseEvent('mouseup', base))
    target.dispatchEvent(new MouseEvent('contextmenu', base))
  }
}

function doClick(metadata: { x: number; y: number } | undefined, button: 0 | 2, actionName: string): void {
  if (!metadata) {
    warn(`${actionName} requires metadata but none was provided`)
    return
  }
  const target = document.elementFromPoint(metadata.x, metadata.y)
  if (!target) return
  dispatchPointerSequence(target, metadata.x, metadata.y, button)
}

function isScrollable(el: Element): boolean {
  if (el.scrollHeight <= el.clientHeight) return false
  const overflowY = getComputedStyle(el).overflowY
  if (overflowY === 'visible' || overflowY === 'hidden') return false
  return true
}

function findScrollableAncestor(start: Element | null): Element {
  let el: Element | null = start
  while (el) {
    if (isScrollable(el)) return el
    el = el.parentElement
  }
  return document.scrollingElement ?? document.documentElement
}

/**
 * Electron's `mouseWheel` `deltaY` convention is inverted from `scrollTop`: a POSITIVE
 * `deltaY` scrolls content UP (wheel rolled away from the user), so `rightStickUp`
 * DECREASES `scrollTop` and `rightStickDown` INCREASES it. Getting this backwards is
 * the single most likely regression in this function -- pinned by test.
 */
function doScroll(delta: number): void {
  const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
  const target = findScrollableAncestor(center)

  if (typeof target.scrollBy === 'function') {
    target.scrollBy({ top: delta })
  } else {
    target.scrollTop += delta
  }
}

type Direction = 'Up' | 'Down' | 'Left' | 'Right'

interface RectLike {
  top: number
  left: number
  right: number
  bottom: number
}

/**
 * WR-03 (Phase 34.1 code review): the "nothing is focused yet" origin.
 *
 * This used to be a zero rect at (0,0) for every direction. `isInDirection` then
 * required `rect.bottom <= 0` for `Up` and `rect.right <= 0` for `Left` -- which NO
 * on-screen element can satisfy, because viewport coordinates are >= 0. So `padUp` /
 * `padLeft` / `leftStickUp` / `leftStickLeft` were permanent no-ops until something was
 * focused, while `Down` / `Right` worked. For a gamepad-only user -- the sole consumer
 * of this module -- that is a dead input on half the d-pad at every screen entry.
 *
 * The fix seeds a degenerate rect on the viewport edge OPPOSITE the movement direction,
 * so "move Up with nothing focused" behaves as if the cursor were just below the
 * viewport: every element is legitimately "above" it, and `directionScore`'s
 * facing-edge term then naturally picks the BOTTOM-most one (with the perpendicular
 * centre-offset term still breaking ties toward the middle of the screen). Each
 * direction is the mirror image of its opposite, so entry from any edge is symmetric.
 */
function viewportOriginFor(direction: Direction): RectLike {
  // The preload jest project runs on `testEnvironment: 'node'` with a hand-built
  // `window` stub, so these can legitimately be absent -- fall back to 0, which
  // degrades to the previous behaviour rather than producing NaN scores.
  const width = typeof window !== 'undefined' ? (window.innerWidth ?? 0) : 0
  const height = typeof window !== 'undefined' ? (window.innerHeight ?? 0) : 0
  switch (direction) {
    case 'Up':
      // Just BELOW the viewport: everything on screen is above it.
      return { top: height, bottom: height, left: 0, right: width }
    case 'Down':
      // Just ABOVE the viewport.
      return { top: 0, bottom: 0, left: 0, right: width }
    case 'Left':
      // Just RIGHT of the viewport.
      return { top: 0, bottom: height, left: width, right: width }
    case 'Right':
      // Just LEFT of the viewport.
      return { top: 0, bottom: height, left: 0, right: 0 }
  }
}

function isInDirection(direction: Direction, origin: RectLike, rect: RectLike): boolean {
  switch (direction) {
    case 'Up':
      return rect.bottom <= origin.top
    case 'Down':
      return rect.top >= origin.bottom
    case 'Left':
      return rect.right <= origin.left
    case 'Right':
      return rect.left >= origin.right
  }
}

/**
 * `primary` is the gap between the facing edges along the movement axis; `secondary` is
 * the centre-to-centre offset on the perpendicular axis, weighted `2x`. Weighting the
 * perpendicular offset higher is what keeps the move in the intended column/row instead
 * of skipping diagonally to a nearer-but-off-axis candidate.
 */
function directionScore(direction: Direction, origin: RectLike, rect: RectLike): number {
  const originCenterX = (origin.left + origin.right) / 2
  const originCenterY = (origin.top + origin.bottom) / 2
  const rectCenterX = (rect.left + rect.right) / 2
  const rectCenterY = (rect.top + rect.bottom) / 2

  let primary: number
  let secondary: number
  switch (direction) {
    case 'Up':
      primary = origin.top - rect.bottom
      secondary = Math.abs(rectCenterX - originCenterX)
      break
    case 'Down':
      primary = rect.top - origin.bottom
      secondary = Math.abs(rectCenterX - originCenterX)
      break
    case 'Left':
      primary = origin.left - rect.right
      secondary = Math.abs(rectCenterY - originCenterY)
      break
    case 'Right':
      primary = rect.left - origin.right
      secondary = Math.abs(rectCenterY - originCenterY)
      break
  }
  return primary + 2 * secondary
}

const ARROW_KEYS: Record<Direction, 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'> = {
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight'
}

function bestInDirection(direction: Direction, origin: RectLike, candidates: HTMLElement[]): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect()
    if (!isInDirection(direction, origin, rect)) continue
    const score = directionScore(direction, origin, rect)
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

function isDocumentScroller(el: Element): boolean {
  return el === document.scrollingElement || el === document.documentElement || el === document.body
}

/**
 * quick 261031-lrx: can `container` still scroll in `direction`? The 1px slack allows for
 * sub-pixel scroll positions. Horizontal reveal is deliberately out of scope: the library
 * grid scrolls only vertically, and Left from the leftmost tile must keep reaching the
 * left panel through the whole-document fallback.
 */
function canScrollToward(container: Element, direction: Direction): boolean {
  if (direction === 'Down') return container.scrollTop < container.scrollHeight - container.clientHeight - 1
  if (direction === 'Up') return container.scrollTop > 0
  return false
}

function scrollContainerBy(container: Element, top: number): void {
  if (typeof container.scrollBy === 'function') {
    container.scrollBy({ top })
  } else {
    container.scrollTop += top
  }
}

/**
 * Resolves on whichever comes first of requestAnimationFrame or a 16ms timeout. The
 * timeout matters twice: the preload test env is node (no rAF), and a hidden or occluded
 * WKWebView may throttle rAF indefinitely -- the promise must never hang.
 */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      resolve()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => finish())
    setTimeout(finish, 16)
  })
}

/**
 * quick 261031-lrx: how long to wait for lazily rendered cards after scrolling a
 * container. Bounded so a grid that never renders anything cannot pin the promise.
 */
const REVEAL_TIMEOUT_MS = 250

/**
 * Chromium's built-in spatial navigation -- which is what made Electron's synthetic
 * `keyDown` with keyCode `Up`/`Down`/`Left`/`Right` actually move focus -- does not
 * exist in WKWebView or WebView2 (D-10's accepted re-derivation cost). This computes
 * the nearest-in-direction focusable element from `getBoundingClientRect()` geometry
 * instead: candidates strictly on the requested side of the currently focused element
 * are scored by facing-edge distance plus double the perpendicular centre offset, and
 * the lowest-scoring candidate is focused. Electron's spatial navigation does not wrap
 * at the edges, so neither does this -- if there are no candidates, focus is left
 * unchanged.
 *
 * quick 261031-lrx (todo 2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel.md):
 * the search is container-first. GameCard renders a non-focusable placeholder until
 * cardVisibility.ts's IntersectionObserver fires, and IntersectionObserver clips targets
 * by intermediate overflow scroll containers before applying rootMargin, so rows below the
 * grid's scroll container never render. A whole-document search then found nothing below
 * the bottom tile and escaped to the left panel. Now: (1) prefer candidates inside the
 * focused element's scroll container; (2) if none and the container can scroll toward
 * `direction`, scroll it one tile and poll briefly for the newly rendered tile; (3) only
 * when the container cannot scroll further, fall back to the whole document. With only the
 * document scroller above the focused element, behaviour is unchanged.
 */
async function moveFocusDirectionally(direction: Direction): Promise<void> {
  const current = activeElement()
  if (current) {
    const prevented = dispatchKey(current, ARROW_KEYS[direction])
    if (prevented) return
  }

  // WR-03: with nothing focused, seed from the viewport edge opposite `direction`
  // rather than a zero rect at (0,0) -- see `viewportOriginFor`.
  const origin = current ? current.getBoundingClientRect() : viewportOriginFor(direction)
  const all = getFocusableElements().filter((el) => el !== current)

  if (!current) {
    bestInDirection(direction, origin, all)?.focus()
    return
  }

  // Start from the parent so a scrollable focused element is never its own container.
  const container = findScrollableAncestor(current.parentElement)
  if (isDocumentScroller(container)) {
    bestInDirection(direction, origin, all)?.focus()
    return
  }

  const inside = all.filter((el) => container.contains(el))
  const inContainer = bestInDirection(direction, origin, inside)
  if (inContainer) {
    inContainer.focus()
    return
  }

  if (canScrollToward(container, direction)) {
    const height = current.getBoundingClientRect().height
    const step = height > 0 ? height : 1
    scrollContainerBy(container, direction === 'Down' ? step : -step)

    const deadline = Date.now() + REVEAL_TIMEOUT_MS
    while (Date.now() < deadline) {
      await nextFrame()
      // An overlapping press (gamepad.ts does not await) or the app moved focus: do not steal it.
      if (activeElement() !== current) return
      // The scroll moved the origin, and cards render lazily -- recompute both.
      const freshOrigin = current.getBoundingClientRect()
      const fresh = getFocusableElements().filter((el) => el !== current && container.contains(el))
      const revealed = bestInDirection(direction, freshOrigin, fresh)
      if (revealed) {
        revealed.focus()
        return
      }
    }
    // Nothing rendered in time; the grid still scrolled one step and the next press continues.
    return
  }

  // The container cannot scroll further: today's whole-document search keeps controls
  // below a scrollable list reachable.
  bestInDirection(direction, origin, all)?.focus()
}

export async function tauriGamepadAction(args: GamepadActionArgs): Promise<void> {
  try {
    switch (args.action) {
      case 'tab':
        doTab(false)
        break
      case 'shiftTab':
        doTab(true)
        break
      case 'esc':
        doEsc()
        break
      case 'back':
        doBack()
        break
      case 'leftClick':
        doClick(args.metadata, 0, 'leftClick')
        break
      case 'rightClick':
        doClick(args.metadata, 2, 'rightClick')
        break
      case 'rightStickUp':
        doScroll(-50)
        break
      case 'rightStickDown':
        doScroll(50)
        break
      case 'padUp':
      case 'padDown':
      case 'padLeft':
      case 'padRight':
      case 'leftStickUp':
      case 'leftStickDown':
      case 'leftStickLeft':
      case 'leftStickRight': {
        const direction = args.action.replace(/pad|leftStick/, '') as 'Up' | 'Down' | 'Left' | 'Right'
        await moveFocusDirectionally(direction)
        break
      }
      default:
        // `rightStickLeft`/`rightStickRight`/`mainAction`/`altAction`/`keyboardClick`/
        // `guide` -- Electron's own switch (`main.ts:1395-1497`) has no case for these
        // either (silent no-op); `mainAction`/`keyboardClick` are handled entirely in
        // `gamepad.ts` and never reach this function at all (see module docstring).
        warn(`unhandled gamepad action "${args.action}"`)
    }
  } catch (error) {
    warn('tauriGamepadAction failed', error)
  }
}
