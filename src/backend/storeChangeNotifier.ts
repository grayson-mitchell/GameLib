/**
 * Sidecar-write -> renderer store-change notification seam.
 *
 * WHY THIS MODULE EXISTS
 *
 * Phase 29 D-06 gave the renderer a `STORE_CHANGED_CHANNEL` listener
 * (`preload/tauriTransport.ts`) that patches its in-memory snapshot whenever the sidecar
 * reports a store write, so the renderer's synchronous snapshot cannot diverge from disk.
 * Its only emit site is inside `sidecar/storeWriteHandlers.ts`'s `applyStoreWrite()` —
 * which handles the `storeSet`/`storeDelete` RPC frames the RENDERER sends.
 *
 * The sidecar's OWN writes never pass through that function. `GOGLibraryManager` calling
 * `gogLibraryStore.set('games', …)` goes `cache.ts` -> `electron-store` -> disk, emitting
 * nothing. `storeWriteHandlers.ts`'s own header predicted exactly this ("any future
 * sidecar-side write that bypasses this function will make the renderer's snapshot
 * silently diverge from what is actually on disk"), and every backend store manager is
 * such a bypass.
 *
 * Live-confirmed consequence (.planning/debug/gog-login-ui-never-updates.md): after a GOG
 * login the sidecar persisted 7 titles to `store_cache/gog_library.json` while the
 * renderer's snapshot kept the pre-login value for the rest of the session — Library
 * rendered nothing, `refresh()` looped on "No cache found" forever, and no error was
 * logged anywhere because both snapshot read paths fail closed. A restart fixed it
 * (boot re-hydrates), which is what isolated the defect.
 *
 * WHY IT IS AN INJECTED FUNCTION RATHER THAN A DIRECT CALL
 *
 * `src/backend/cache.ts` and `src/backend/electron_store.ts` are imported by every store
 * module in the backend and MUST NOT reach the IPC layer. `sidecar/storeRegistration.ts`
 * warns that importing `sendFrontendMessage` drags in Electron's `app` and the logger,
 * and `electronReachLedger.test.ts` pins the electron-importing module count. So the
 * store classes call `notifyStoreChanged()` here — a module with no runtime imports at
 * all — and the sidecar installs the real implementation at registration time
 * (`registerStoreWriteHandlers()`).
 *
 * Under Electron no notifier is ever installed, so `notifyStoreChanged()` is an
 * unconditional no-op and the Electron write paths are byte-for-byte unchanged. That
 * matters for upstream mergeability: the renderer under Electron reads electron-store
 * synchronously through IPC and has no snapshot to invalidate.
 *
 * SINGLE-PUSH-SITE INVARIANT
 *
 * `storeWriteHandlers.ts`'s header forbids a second
 * `pushFrontendMessage(STORE_CHANGED_CHANNEL, …)` call site anywhere in the tree. This
 * module does NOT add one — it holds a function reference that the sidecar points at that
 * one existing site. Keep it that way: wire new producers through
 * `setStoreChangeNotifier`, never by calling `pushFrontendMessage` directly.
 */

import type { StoreChangedPayload } from 'common/types/sidecarTransport'

type StoreChangeNotifier = (payload: StoreChangedPayload) => void

let notifier: StoreChangeNotifier | null = null

/**
 * Re-entrancy depth for `withStoreChangeSuppressed`. A counter, not a boolean, so nested
 * suppressed sections cannot have an inner one re-enable notification for the outer.
 */
let suppressDepth = 0

/**
 * Runs `fn` with store-change notification suppressed.
 *
 * Exists because `applyStoreWrite` (the renderer-driven write handler) performs its write
 * THROUGH these same store classes and then pushes the change itself, with a richer
 * payload than the class can produce — it knows whether the frame was a `set` or a
 * `delete` and emits an explicit `deleted` flag either way. Without suppression a single
 * renderer-driven write emits TWO frames: the class's and the handler's. Harmless to
 * correctness (the renderer applies the same patch twice) but wasteful on every settings
 * change, and it made the two producers indistinguishable to anything inspecting the
 * wire — `skeletonFlows.test.ts` caught exactly that.
 *
 * The division of responsibility this establishes: **whoever initiates a write owns its
 * notification.** `applyStoreWrite` owns renderer-driven writes; the store classes own
 * everything the sidecar initiates itself. `applyStoreWrite` must keep its own push
 * rather than delegating, because its cache-store branch can resolve a RAW `electron-store`
 * instance that has no notification hook at all.
 */
export function withStoreChangeSuppressed<T>(fn: () => T): T {
  suppressDepth++
  try {
    return fn()
  } finally {
    suppressDepth--
  }
}

/**
 * Installs (or clears, with `null`) the sidecar's push implementation. Called once by
 * `registerStoreWriteHandlers()`; tests use it to capture emissions and MUST clear it
 * again in teardown, since this is module-level state shared across suites.
 */
export function setStoreChangeNotifier(fn: StoreChangeNotifier | null): void {
  notifier = fn
}

/** Test/diagnostic helper — whether a real notifier is currently installed. */
export function hasStoreChangeNotifier(): boolean {
  return notifier !== null
}

/**
 * Announces a sidecar-side store change to the renderer. No-op when no notifier is
 * installed (Electron, and any unit test that has not opted in).
 *
 * A throw here must never propagate: this is called from inside store `set`/`delete`
 * paths, and a failed NOTIFICATION must not fail the WRITE that already succeeded. The
 * write is the source of truth; the push is best-effort cache maintenance, and a dropped
 * push degrades to exactly the pre-fix behaviour (a stale snapshot until restart) rather
 * than to data loss.
 */
export function notifyStoreChanged(payload: StoreChangedPayload): void {
  if (!notifier || suppressDepth > 0) return
  try {
    notifier(payload)
  } catch {
    // Intentionally swallowed — see the doc comment above. No logger import here either
    // (same electron-reach constraint that shaped this whole module).
  }
}

/**
 * Announces that a store changed in a way that cannot be described key-by-key — a
 * `clear()`, or a `CacheStore.commit()` flushing an in-memory map wholesale. The renderer
 * responds by dropping the store from `hydrated` and re-fetching it, rather than trying to
 * patch individual keys.
 *
 * Needed because `StoreChangedPayload` is per-key by construction: emitting one push per
 * key for a bulk write would be both chatty and wrong (it cannot express REMOVALS, so a
 * cleared store would keep its stale keys in the renderer snapshot forever — the precise
 * failure WR-07 already fixed for `hydrateStore`).
 */
export function notifyStoreInvalidated(storeName: string): void {
  notifyStoreChanged({ store: storeName, key: '', invalidated: true })
}
