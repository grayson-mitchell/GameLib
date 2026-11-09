/**
 * Once-guarded boot module for the Phase 69 stores (D-05, D-07).
 *
 * Listeners registered here last for the life of the app: there is no
 * disposer (D-07). Tests reset stores instead of tearing listeners down.
 *
 * Must be called after `hydrateStoreSnapshot()` and `i18next.init`, before
 * `root.render` (index.tsx), so readInitial() sees the hydrated snapshot.
 *
 * The componentDidMount tail (awaited seeding, mount-time refreshLibrary,
 * frontendReady) is NOT moved here until plan 69-24 adds `runPostMountBoot()`.
 * frontendReady must keep its post-first-commit timing because the backend
 * treats it as "renderer listeners mounted".
 *
 * Never read `window.localStorage` at module scope: node-env tests must be
 * able to import this file.
 */
let initialised = false

export function initStateSubscriptions(): void {
  if (initialised) return
  initialised = true

  // (1) re-read persisted initial state into each store (readInitial)

  // (2) window.api.handle* listeners

  // (3) store.subscribe side effects (D-08)
}

/** @public Test-only: lets a test prove the once-guard. */
export function __resetInitStateSubscriptionsGuardForTests(): void {
  initialised = false
}
