/**
 * Store-embed seam (Phase 40 Plan 05, D-01/D-17/D-18/D-21/D-22/D-25/D-29, REQ-40-02/REQ-40-05).
 *
 * Renderer chrome (`40-07`) and host (`40-08`) code need platform access to the Rust-owned
 * store-embed child webview — open/re-point it, move it, hide/show/close it, read its
 * navigation state and (once `40-07` lands) drive it back/forward/reload/to-a-new-url. There is
 * one shipped build — the Tauri Node sidecar — so a `rustInvoke`-backed implementation is
 * constructed once, at sidecar startup, and installed here.
 *
 * This module is the seam: a plain interface + a module-scoped holder, with NOTHING
 * platform-specific in it, mirroring `src/backend/humble/loginWindowSeam.ts` exactly.
 * `storeEmbedFlowRegistration.ts` (imported from the sidecar's own curated module graph)
 * constructs the `rustInvoke`-backed implementation and installs it here via
 * `setStoreEmbedSeam()` — the ONLY call site (T-40-05-seam) — unconditionally at sidecar
 * startup, before any IPC handler can be reached.
 *
 * Constraints that keep this file safe to import broadly: it imports nothing from `'electron'`
 * and nothing from `backend/sidecar` — it is pure types and a module-level holder.
 */

/**
 * The store embed's screen rect, in LOGICAL px (D-18, spike 017). The TypeScript layer that
 * carries this value end to end — preload binder, IPC arm, this seam's Rust-backed
 * implementation — is a COURIER, never a participant: no rounding, no clamping, no default, no
 * fallback rect. Spike 017 proved two geometry writers silently last-write-wins with no error;
 * a substituted rect here would be a second writer wearing a disguise. A missing or non-finite
 * field must throw, never be coerced to a plausible value.
 */
export interface StoreEmbedBounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Pushed navigation state (D-22's inversion): `canGoBack`/`canGoForward` are FIELDS the Rust
 * history stack reports, never something the renderer can synchronously ask for — there is no
 * `canGoBack()` equivalent, by design. `40-EMBED-API-VERIFICATION.md` Q1/Q2 confirmed no native
 * back/forward/history API exists on `tauri::webview::Webview` or `wry::WebView`, so this shape
 * is fed by a Rust-side history stack driven by `on_page_load` + `navigate()` (plan `40-07`),
 * NOT a wrapper around a native browser history object.
 */
export interface StoreEmbedNavEvent {
  url: string
  host: string
  canGoBack: boolean
  canGoForward: boolean
}

/**
 * The platform-agnostic operations the store-embed chrome (`40-07`) and host (`40-08`) need.
 * One runtime implementation exists per build: the Tauri sidecar installs a `rustInvoke`-backed
 * implementation (`createRustStoreEmbedSeam()` in
 * `backend/sidecar/storeEmbedFlowRegistration.ts`).
 */
export interface StoreEmbedSeam {
  /**
   * Opens the store embed on `url` at `bounds`, or re-points an existing embed rather than
   * failing if one is already open (D-01 idempotency, matching the shipped Rust arm).
   * `storeKey` identifies which store the caller is opening (e.g. `'steam'`) for the caller's
   * own bookkeeping — the Rust arm this calls takes no such argument (`40-02-SUMMARY.md`), so
   * it is not forwarded over the wire.
   */
  open(url: string, bounds: StoreEmbedBounds, storeKey: string): Promise<void>
  /**
   * Fire-and-forget re-bound (D-29): fires on every `ResizeObserver` tick and must not
   * accumulate promises. Logical px, courier-only — see `StoreEmbedBounds`'s own doc comment.
   */
  setBounds(bounds: StoreEmbedBounds): void
  /** Hides the embed without destroying it (D-21: history/state survive a hide). */
  hide(): Promise<void>
  /** Re-shows a previously hidden embed. */
  show(): Promise<void>
  /** Closes the embed and clears its Rust-side history (D-21: teardown only, never a route-leave hide). */
  close(): Promise<void>
  /**
   * Drains queued navigation state (D-22). Poll-shaped, mirroring
   * `LoginWindowSeam.takeEvents()` — the renderer calls this to receive the current
   * URL/host/back-forward-availability as pushed state, never as a synchronous query.
   *
   * NOT YET IMPLEMENTED: no Rust arm exists yet (plan `40-07` owns it, D-25). Throws a
   * declared-unimplemented Error until then.
   */
  takeNavEvents(): Promise<StoreEmbedNavEvent[]>
  /**
   * NOT YET IMPLEMENTED: plan `40-02` deliberately did not add this arm; plan `40-07` adds it
   * against the D-25 verdict (no native back/forward API exists). Throws a
   * declared-unimplemented Error until then — never a no-op, never a plausible default.
   */
  back(): Promise<void>
  /** NOT YET IMPLEMENTED — see `back()`'s doc comment. Throws a declared-unimplemented Error until `40-07` lands. */
  forward(): Promise<void>
  /** NOT YET IMPLEMENTED — see `back()`'s doc comment. Throws a declared-unimplemented Error until `40-07` lands. */
  reload(): Promise<void>
  /** NOT YET IMPLEMENTED — see `back()`'s doc comment. Throws a declared-unimplemented Error until `40-07` lands. */
  navigate(url: string): Promise<void>
}

// Module-scoped holder. `null` before registerStoreEmbedFlows() runs at sidecar startup, and
// whenever a test explicitly clears it via setStoreEmbedSeam(null).
let installed: StoreEmbedSeam | null = null

/**
 * Installs (or clears, via `null`) the active store-embed seam implementation.
 *
 * `registerStoreEmbedFlows()` (`src/backend/sidecar/storeEmbedFlowRegistration.ts`) is the
 * EXACTLY ONE production call site (mirrors `setLoginWindowSeam()`'s own discipline) — a second
 * call site would make "which implementation is installed" untraceable from one file.
 */
export function setStoreEmbedSeam(seam: StoreEmbedSeam | null): void {
  installed = seam
}

/** Returns the active store-embed seam implementation, or `null` if none is installed. */
export function getStoreEmbedSeam(): StoreEmbedSeam | null {
  return installed
}
