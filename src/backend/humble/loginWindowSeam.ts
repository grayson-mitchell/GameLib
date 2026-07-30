/**
 * Dual-build login-window seam (Phase 34.4.1 Plan 02, D-01/D-02, REQ-34.4.1-02/REQ-34.4.1-13).
 *
 * `humble/user.ts` (`watchForLogin()`/`getLiveCsrfToken()`/`notifyLoginNavigated()`) is compiled
 * into BOTH the Electron main process and the Tauri Node sidecar. Under Electron it keeps calling
 * `session.fromPartition(HUMBLE_LOGIN_PARTITION)` completely untouched. Under Tauri there is no
 * `session.fromPartition()` shape at all (`tauri-login-webview-cookies.md` § "Requirements" #7) --
 * jar access requires a live `Webview` handle reached only via a `rustInvoke` round-trip.
 *
 * This module is the seam that reconciles the two: a plain interface + a module-scoped holder +
 * a pure classifier, with NOTHING platform-specific in it. `user.ts` must never import sidecar RPC
 * directly -- `backend/sidecar/sidecarRpc` runs a Node `readline`/stdio loop that does not exist in
 * the Electron main process, so importing it from a dual-build file would break Electron's build
 * (or silently pull sidecar transport machinery into a process that has no Rust counterpart to talk
 * to). Instead, `backend/sidecar/humbleLoginFlowRegistration.ts` (Tauri-only, imported from the
 * sidecar's own curated module graph) constructs a `rustInvoke`-backed implementation and installs
 * it here via `setLoginWindowSeam()` at sidecar startup. The Electron build never calls
 * `setLoginWindowSeam()` at all, so `getLoginWindowSeam()` always returns `null` there and
 * `user.ts`'s existing `session.fromPartition` path is exercised exactly as before -- additive and
 * reversible, per the phase's own invariant.
 *
 * Constraints that keep this file safe to import from BOTH builds: it imports nothing from
 * `'electron'` and nothing from `backend/sidecar` -- it is pure types, a module-level holder, and a
 * pure function.
 */

/** A single cookie read back from the login window's jar. */
export interface LoginWindowCookie {
  name: string
  domain: string | null
  value: string
}

/**
 * The result of a cookie-jar read. `total` is the UNFILTERED jar size -- the liveness proof that
 * distinguishes a genuinely empty jar from a silently dead cookie API (see `classifyCookieRead`
 * below). `matched` is the subset that passed the caller's domain-suffix + name filter.
 */
export interface LoginWindowCookieRead {
  total: number
  matched: LoginWindowCookie[]
}

/**
 * A single relayed main-frame navigation event. Sourced from Rust's `on_page_load` hook only --
 * NEVER `on_navigation`, which also fires for third-party subframes (spike 013: 5 of 8 events on
 * Humble's real login page were iframes) and would let an ad frame re-arm a login watch's deadline
 * indefinitely.
 */
export interface LoginWindowNavEvent {
  event: 'started' | 'finished'
  url: string
}

/**
 * The reveal POST's response, carried back from the hidden reveal window (Phase 34.4.1 Plan
 * 04, D-07). `status` is the raw HTTP status the page's own `fetch()` observed -- a non-2xx
 * value (e.g. a Cloudflare 403) is a normal, DECLARED outcome, never an error thrown by
 * `revealPost` itself (see the interface method's own doc comment below). `body` is the raw
 * response text, fed through the SAME `RevealResponseSchema`/`coerceJsonBody` path
 * `humblePostRequest`'s Electron transport already uses -- this seam changes the transport
 * only, never the response contract.
 */
export interface LoginWindowRevealPostResult {
  status: number
  body: string
}

/**
 * One storage-clear category's outcome (Phase 34.4.1 Plan 15, F-6 BLOCKING, D-08/Pitfall 3,
 * T-34.4.1-67). Either a count of items cleared, or the literal string `'unsupported'` when the
 * engine does not expose that category's API (`indexedDB.databases()` in particular is not
 * universally available). An `'unsupported'` category must NEVER be coerced to `0` -- the two
 * are structurally indistinguishable to a caller that ignores this discriminator, exactly the
 * `navigator-clipboard-noops-under-tauri` failure shape (an API that resolves without acting)
 * applied to storage. This mirrors `classifyCookieRead`'s own SUPPORTED_BUT_EMPTY-vs-UNDECIDABLE
 * discriminator role.
 */
export type StorageClearCategoryResult = number | 'unsupported'

/**
 * Per-category outcome of a `clearStorage()` call (Phase 34.4.1 Plan 15, F-6 BLOCKING,
 * REQ-34.4.1-06/REQ-34.4.1-GAP-03). Plan 16 reads this shape to decide whether the corresponding
 * `wipeSteps` entry succeeded, partially succeeded (some categories unsupported), or failed
 * structurally (the seam call itself rejected).
 */
export interface LoginWindowStorageClearResult {
  localStorage: StorageClearCategoryResult
  sessionStorage: StorageClearCategoryResult
  indexedDB: StorageClearCategoryResult
  caches: StorageClearCategoryResult
  serviceWorkers: StorageClearCategoryResult
}

/**
 * The platform-agnostic operations `humble/user.ts`'s login watch needs from a login window. One
 * runtime implementation exists per build: Electron's untouched `session.fromPartition` path needs
 * no implementation of this interface at all (the holder stays `null`); the Tauri sidecar installs
 * a `rustInvoke`-backed implementation (`createRustLoginWindowSeam()` in
 * `backend/sidecar/humbleLoginFlowRegistration.ts`).
 */
export interface LoginWindowSeam {
  /** Opens a login window on `url`. Resolves the window's generated label. */
  open(url: string, options: { visible: boolean; userAgent: string }): Promise<string>
  /** Reads the login window's cookie jar, filtered by `host` (domain-suffix match) and `names`. */
  cookies(label: string, host: string, names: string[]): Promise<LoginWindowCookieRead>
  /** Drains the login window's queued main-frame navigation events. */
  takeEvents(label: string): Promise<LoginWindowNavEvent[]>
  /** Closes the login window. Resolves whether a window with that label existed. */
  close(label: string): Promise<boolean>
  /** Domain-scoped cookie clear (never a blanket wipe -- see `RUST_HUMBLE_LOGIN_CLEAR_COOKIES`). */
  clearCookies(label: string, domain: string): Promise<number>
  /**
   * Issues the Humble reveal-key POST from a hidden, on-demand child window's own JS `fetch()`
   * (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) -- `humblePostRequest`'s (`humble/adapter.ts`)
   * ONLY Tauri transport branch. Resolves `{status, body}` for ANY completed HTTP response,
   * including a non-2xx one (a 403 is a normal, declared outcome under D-07 -- the caller maps
   * it exactly as it already maps the Electron `net.request` path's non-2xx responses). Rejects
   * ONLY on a structural failure: no window could be built, the injected script itself errored,
   * or the reveal timed out -- never on the HTTP status of the reveal response itself.
   */
  revealPost(input: {
    originUrl: string
    path: string
    body: string
    csrfToken?: string
    userAgent: string
  }): Promise<LoginWindowRevealPostResult>
  /**
   * Origin-scoped storage clear (Phase 34.4.1 Plan 15, F-6 BLOCKING, D-08/Pitfall 3,
   * T-34.4.1-66/-67/-70). Clears `localStorage`, `sessionStorage`, IndexedDB, Cache Storage and
   * service-worker registrations for `originUrl`'s OWN origin only -- same-origin policy makes
   * any other origin structurally unreachable, so this is scoped by construction rather than by
   * a filter that could be got wrong (the same discipline `clearCookies` achieves via its own
   * domain-suffix filter). Resolves the per-category report for ANY completed run, including one
   * where several categories are `'unsupported'` -- never coerced to `0`. Rejects ONLY on a
   * structural failure: no window could be built, the injected script itself errored, or the
   * clear timed out.
   *
   * Unlike `open`/`cookies`/`takeEvents`/`close` above, this method's rejection is NOT swallowed
   * here -- plan 16's guarded `wipeSteps` entry owns that swallow; a seam method that faked
   * success here would recreate F-6's exact failure mode one layer down.
   *
   * Origin-vs-domain limitation (T-34.4.1-70): cookies clear by DOMAIN suffix (`clearCookies`
   * above), but web storage is scoped per ORIGIN (scheme+host+port). `HUMBLE_BASE_URL` is the
   * `www.` origin, so this clears `https://www.humblebundle.com`'s storage but NOT a
   * hypothetical bare `https://humblebundle.com` origin's storage -- see this plan's SUMMARY for
   * the decision record.
   *
   * NOT yet called anywhere in this plan -- F-6 is not closed here. Plan 16 wires this into the
   * two disconnect paths.
   */
  clearStorage(
    originUrl: string,
    userAgent: string
  ): Promise<LoginWindowStorageClearResult>
}

// Module-scoped holder. `null` in the Electron build (nothing ever calls setLoginWindowSeam there)
// and in the Tauri sidecar BEFORE registerHumbleLoginFlows() runs at startup.
let installed: LoginWindowSeam | null = null

/** Installs (or clears, via `null`) the active login-window seam implementation. */
export function setLoginWindowSeam(seam: LoginWindowSeam | null): void {
  installed = seam
}

/** Returns the active login-window seam implementation, or `null` if none is installed. */
export function getLoginWindowSeam(): LoginWindowSeam | null {
  return installed
}

/**
 * The four possible verdicts a cookie-jar read can produce. Mirrors the truth table in
 * `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md` §
 * "Liveness proof before any poll".
 */
export type CookieReadVerdict =
  | 'SUPPORTED_NONEMPTY'
  | 'SUPPORTED_BUT_EMPTY'
  | 'UNSUPPORTED_OR_ERROR'
  | 'UNDECIDABLE'

/**
 * Classifies a single cookie-jar read (REQ-34.4.1-13). This IS the
 * `navigator-clipboard-noops-under-tauri` mitigation applied to the login-window cookie API:
 * WKWebView resolved a clipboard write WITHOUT writing, so every "success" path still ran and
 * looked healthy -- the failure was silent. The same shape is possible here: Humble hands **33
 * cookies to an ANONYMOUS visitor** (spike 014a), so a first read of zero on a real login page
 * means the cookie API did nothing at all -- never "not logged in yet". Every caller polling this
 * API must classify each read through this function and must NEVER poll on the 'UNDECIDABLE'
 * verdict, which is indistinguishable from a dead channel by construction.
 *
 * Truth table:
 *   - `total === null`                     -> 'UNSUPPORTED_OR_ERROR'  (the read itself threw)
 *   - `total > 0`                          -> 'SUPPORTED_NONEMPTY'   (cookies returned; API live)
 *   - `total === 0 && everProvedLive`      -> 'SUPPORTED_BUT_EMPTY'  (zero, but the channel proved
 *                                              itself earlier -> a real "not logged in yet")
 *   - `total === 0 && !everProvedLive`     -> 'UNDECIDABLE'          (zero and never proven --
 *                                              empty and no-op are indistinguishable; NEVER poll)
 *
 * Pure by design (REQ-34.4.1-13): takes only `{ total, everProvedLive }` and returns a verdict --
 * no platform branch, no I/O, no seam access. This is the cheap Linux/Windows safe-degradation
 * proof D-09's rejected option asked for: the classifier's correctness can be proven once, on any
 * platform, independent of whatever Rust cookie API each platform's wry backend actually has.
 */
export function classifyCookieRead(input: {
  total: number | null
  everProvedLive: boolean
}): CookieReadVerdict {
  if (input.total === null) {
    return 'UNSUPPORTED_OR_ERROR'
  }
  if (input.total > 0) {
    return 'SUPPORTED_NONEMPTY'
  }
  return input.everProvedLive ? 'SUPPORTED_BUT_EMPTY' : 'UNDECIDABLE'
}
