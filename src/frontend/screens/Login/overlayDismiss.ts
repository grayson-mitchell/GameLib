/**
 * Binds a login overlay's `dismiss` to the mount it was rendered for.
 *
 * SteamLogin calls `dismiss()` when an awaited IPC call (or a poll already
 * waiting on one) resolves -- which can be after its dialog was closed and it
 * unmounted. Unbound, that late call dismissed whichever overlay was open by
 * then: it cleared `openOverlay` under a live Humble sign-in (so the screen
 * stopped being inert) and, after the exit delay, unmounted HumbleLogin,
 * whose cleanup cancels the Humble sign-in. A Steam -> Steam reopen was
 * likewise closed by the previous mount.
 *
 * `currentKey` is read when the returned function is CALLED, not when it is
 * bound: the binding is made at render time, the stale call arrives later.
 *
 * Pure so it can be unit-tested without a DOM: the frontend jest project runs
 * `testEnvironment: 'node'` with no jsdom (see `src/frontend/jest.config.js`).
 */
export function bindOverlayDismiss(
  mountKey: number,
  currentKey: { readonly current: number },
  dismiss: () => void
): () => void {
  return () => {
    if (mountKey !== currentKey.current) return
    dismiss()
  }
}
