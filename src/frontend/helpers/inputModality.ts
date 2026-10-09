/**
 * Keyboard-mode tracking for the Library focus ring (Phase 48 plan 16, gap
 * G-48-12a, review finding WR-02).
 *
 * `installKeyboardNavTracking` keeps ONE class on `<body>`,
 * `KEYBOARD_NAV_CLASS`, set while the keyboard is the active input and cleared
 * the moment a real pointer takes over. `GameCard/index.css` scopes its
 * stale-focus suppression off that class:
 *
 *   body:not(.controllerLayout):not(.keyboardNav) .listing:hover
 *     .gameCard:focus-within:not(:hover)
 *
 * Why this exists. That suppression returns a focused-but-not-hovered card to
 * rest whenever the pointer is anywhere over `.listing`, so that a card left
 * focused by a click or a gamepad does not wear a second ring beside the
 * hovered one. `body:not(.controllerLayout)` is also the state a KEYBOARD user
 * is in, so a Tab-focused card lost its ring whenever the pointer merely
 * rested over the library. Measured live 2026-10-09 (48-15 B11): 0 of 40
 * captures ringed with the pointer in the listing, 40 of 40 with it in the
 * sidebar.
 *
 * Entry and exit.
 * - Entry is a TRUSTED Tab keydown. Untrusted key events are ignored on
 *   purpose: `src/preload/api/tauriGamepadInput.ts` dispatches synthetic
 *   KeyboardEvents for gamepad navigation, and controller mode already owns
 *   that path through `body.controllerLayout`. Tab is the only entry key;
 *   arrow keys move the caret in the search box and do not move focus between
 *   cards under Tauri.
 * - Exit is a pointer press, or a `mousemove` whose `screenX`/`screenY`
 *   differ from the previous recorded move (the first move counts as real).
 *   A move at the SAME coordinates is ignored: WebKit and Chromium dispatch a
 *   synthetic `mousemove` to refresh hover after content scrolls under a
 *   stationary pointer, and a Tab that scrolls the page must not end keyboard
 *   mode.
 *
 * While the class is set, a hovered card that does not hold focus returns to
 * rest (a separate rule in the stylesheet), so exactly one tile rings.
 *
 * This reads only `event.key` (for equality with Tab), `event.isTrusted` and
 * the pointer's screen coordinates. It stores no key, logs nothing and sends
 * nothing over IPC. Every listener is capture + passive, so it cannot
 * `preventDefault` and sees the event before any handler can stop it. Every
 * handler body is wrapped, so a failure here can never break input handling.
 */

export const KEYBOARD_NAV_CLASS = 'keyboardNav'

type Listener = (event: Event) => void

export interface ModalityTarget {
  addEventListener(
    type: string,
    listener: Listener,
    options?: AddEventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: Listener,
    options?: EventListenerOptions
  ): void
}

export interface ModalityBody {
  classList: { add(token: string): void; remove(token: string): void }
}

const LISTENER_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: true
}

/**
 * Returns a disposer that removes every listener this call added. Total: it
 * never throws, and if registration fails part way it removes whatever it had
 * added and returns a no-op, so it never leaves a listener half-installed.
 */
export function installKeyboardNavTracking(
  target: ModalityTarget = window,
  getBody: () => ModalityBody | null = () => document.body ?? null
): () => void {
  let lastScreenX: number | undefined
  let lastScreenY: number | undefined

  const setMode = (on: boolean) => {
    try {
      const body = getBody()
      if (!body) return
      if (on) body.classList.add(KEYBOARD_NAV_CLASS)
      else body.classList.remove(KEYBOARD_NAV_CLASS)
    } catch {
      // never let a class toggle break input handling
    }
  }

  const onKeyDown: Listener = (event) => {
    try {
      const key = event as KeyboardEvent
      if (key.isTrusted && key.key === 'Tab') setMode(true)
    } catch {
      // swallowed on purpose
    }
  }

  const onMouseMove: Listener = (event) => {
    try {
      const move = event as MouseEvent
      const moved =
        lastScreenX === undefined ||
        move.screenX !== lastScreenX ||
        move.screenY !== lastScreenY
      lastScreenX = move.screenX
      lastScreenY = move.screenY
      if (moved) setMode(false)
    } catch {
      // swallowed on purpose
    }
  }

  const onPointerDown: Listener = () => setMode(false)

  const handlers: Array<[string, Listener]> = [
    ['keydown', onKeyDown],
    ['mousemove', onMouseMove],
    ['pointerdown', onPointerDown]
  ]
  const added: Array<[string, Listener]> = []

  const remove = () => {
    for (const [type, listener] of added.splice(0)) {
      try {
        target.removeEventListener(type, listener, { capture: true })
      } catch {
        // swallowed on purpose
      }
    }
  }

  try {
    for (const [type, listener] of handlers) {
      target.addEventListener(type, listener, LISTENER_OPTIONS)
      added.push([type, listener])
    }
  } catch {
    remove()
    return () => undefined
  }

  return remove
}
