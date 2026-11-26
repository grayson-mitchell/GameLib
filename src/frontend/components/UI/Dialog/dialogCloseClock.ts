/**
 * RF3 (debug session rf3-cancel-removes-shortcut): when a dialog closes.
 *
 * A dialog is the one thing that sits between a click and the page under it. The
 * moment it goes, the next click lands on whatever the page has below the spot
 * the user just pressed: the second click of a double click on "No", a bounce, a
 * tap plus a press. Uninstall's Cancel was seen once to remove a game's Steam
 * shortcut, and the one thing left that fits the evidence is exactly that second
 * click reaching the Show in Steam switch.
 *
 * `Dialog` stamps this clock when it closes; a switch row reads it. The clock is a
 * plain timestamp with no React state, so reading it never re-renders anything
 * and it works for every `Dialog` consumer without per-call-site wiring.
 */

/**
 * How long after a dialog closes a pointer click on a switch row counts as a
 * stale second click. 500 ms is the system double-click interval on macOS (the
 * default of `NSEvent.doubleClickInterval`, which is also what WebKit merges
 * clicks by), so a second half of a double click and a bounce both fall inside.
 * It matches `Dialog`'s own 500 ms transition on purpose: nothing here is
 * timed off an exit transition, because a consumer that unmounts the dialog on
 * close (DangerZone's `UninstallModal`) plays none, so the page under it is
 * hit-testable the instant No is pressed.
 */
export const STALE_CLICK_WINDOW_MS = 500

let closedAt: number | null = null

/** Called by `Dialog` when it closes or unmounts. The latest call wins. */
export function markDialogClosed(): void {
  closedAt = performance.now()
}

/** Whole ms since a dialog last closed, or null when none has this session. */
export function msSinceDialogClose(): number | null {
  if (closedAt === null) return null
  return Math.max(0, Math.round(performance.now() - closedAt))
}

/** Test seam: forgets the last close, as at the start of a session. */
export function resetDialogCloseClock(): void {
  closedAt = null
}
