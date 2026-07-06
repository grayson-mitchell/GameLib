// Humble domain contracts (Phase 10 scaffold, extended in Phase 11).

/**
 * Discriminated-union result shape returned by every Humble adapter call
 * (src/backend/humble/adapter.ts). This is the single C5 wall: callers never
 * see a blind cast of an untrusted Humble response, and never see a raw
 * axios/HTTP error either — every outcome is one of these four typed states.
 */
export type AdapterResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'session_expired' } // Humble responded 401 — reconnect required
  | { status: 'access_denied' } // Humble responded 403 — silent C5 backoff, NOT a re-login trigger
  | { status: 'schema_error'; raw: unknown } // response shape drifted from what zod expects

/**
 * Account identity as surfaced by the Humble adapter's account-identity call.
 * Per D-02, the only identifier shown on the Manage Accounts tile.
 */
export interface HumbleUserData {
  username: string
}

/**
 * The ONLY Humble auth shape ever pushed to the renderer (via IPC / the
 * `humbleAuthState` frontend message in later plans). MUST NOT include the
 * session cookie — see PITFALLS.md C4 / threat T-10-01.
 */
export interface HumbleAuthState {
  isLoggedIn: boolean
  username?: string
  expired?: boolean
}

/**
 * Redacted per-endpoint result recorded by the D-12/D-13 live validation gate
 * (src/backend/humble/validation.ts). NEVER carries a cookie value or a raw
 * gamekey/key value (D-15 / T-10-15) — only status + schema-parse outcome.
 */
export interface HumbleValidationEndpointResult {
  path: string
  status:
    | 'ok'
    | 'session_expired'
    | 'access_denied'
    | 'schema_error'
    | 'not_attempted'
  schemaValid: boolean
  /**
   * D-13 revised: true for the account-identifier endpoint only. Advisory
   * results are recorded in the report but can NEVER affect the overall
   * pass/fail verdict (D-02 generic-"Connected" fallback).
   */
  advisory?: boolean
}

/**
 * Redacted structured report returned by `runHumbleValidation()` (D-12/D-15).
 * The dev-only trigger surfaces this to the human checkpoint, who transcribes
 * it (still redacted) into `10-VALIDATION.md`. This shape is pushed over IPC
 * to the renderer — it MUST NEVER include the session cookie or a raw
 * gamekey/key value; `gamekeyCount` and `steamAppIdPresent` are booleans/counts
 * only, never the underlying values (D-13 point 3, T-10-15).
 */
export interface HumbleValidationReport {
  transport: 'axios' | 'session-fetch'
  timestamp: string
  overall: 'pass' | 'fail'
  endpoints: HumbleValidationEndpointResult[]
  gamekeyCount: number
  steamAppIdPresent: boolean
}

/**
 * The 5-state classification model (D-30, Phase 11). Precedence, in order:
 * expiration in the past beats everything → UNREDEEMABLE; a present raw
 * redeemed-key value (source field kept out of this file — see classify.ts)
 * beats the local flag → REDEEMED; the locally-persisted REVEALED flag beats
 * the default → REVEALED; otherwise → UNREVEALED.
 * UNPICKED is structurally distinct — it represents an un-picked Humble
 * Choice month pseudo-entry (D-27), not a classified tpk.
 */
export type HumbleKeyState =
  | 'UNPICKED'
  | 'UNREVEALED'
  | 'REVEALED'
  | 'REDEEMED'
  | 'UNREDEEMABLE'

/**
 * Display-safe, per-row shape rendered on the Phase 11 Humble Keys page
 * (D-19/D-21/D-22). Deliberately has NO raw key-value field — only the
 * derived state is ever exposed (C4 / T-11-01); the raw redeemed-key value
 * from the Humble API must never reach this type or the renderer.
 */
export interface HumbleKey {
  gamekey: string
  /** Stable per-tpk identity (machine_name) — used as the REVEALED-flag key
   * and for de-duplication. */
  machineName: string
  state: HumbleKeyState
  title: string
  /** Platform label derived from key_type (D-28) — Steam, GOG, Epic, etc. */
  platform: string
  expiration: string | null
  /** Bundle/order label shown as a secondary line per row (D-21). */
  origin: string
}

/**
 * `humbleLibraryStore` value shape, keyed by gamekey. `allTerminal` is true
 * iff every key in this order is REDEEMED or UNREDEEMABLE (never true for an
 * UNPICKED pseudo-entry) — read by the D-24 skip-terminal sync partitioning
 * (Plan 02) to freeze fully-terminal orders instead of re-fetching them.
 */
export interface HumbleOrderCacheEntry {
  gamekey: string
  keys: HumbleKey[]
  allTerminal: boolean
}

/**
 * `humbleSyncStore` value shape (D-31/D-32). `syncError` distinguishes a
 * clean sync ('none') from the two fail-soft causes: a network/timeout/5xx
 * throw caught in Plan 02's library.ts ('network'), and an access_denied/429
 * abort ('denied') — the latter also sets `cooldownUntil` (D-33) so even a
 * manual refresh is gated until the cooldown elapses. 'partial' covers a
 * mid-sync abort that still committed some orders (D-34).
 */
export interface HumbleSyncState {
  syncedAt: number | null
  syncError: 'none' | 'denied' | 'network' | 'partial'
  cooldownUntil?: number
  /**
   * Version stamp of the classification logic that produced the cached
   * library entries (live-UAT round 6). Absent on pre-versioning caches
   * (read as 1). When it differs from HUMBLE_CLASSIFIER_VERSION at sync
   * start, the D-24 frozen-order skip is bypassed once so classifier fixes
   * reach every cached row; stamped to the current version only after a
   * clean full pass (a partial sync keeps the old version so the next sync
   * retries the full re-classification).
   */
  classifierVersion?: number
}
