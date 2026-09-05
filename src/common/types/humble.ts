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
 * The 5-state classification model (D-30, Phase 11; realigned by the Phase
 * 14 gap closure, 14-07). Precedence, in order: expiration in the past beats
 * everything → UNREDEEMABLE (D-30, unchanged); a LOCAL "Mark as redeemed"
 * mark (`isLocallyRedeemed`) → REDEEMED — this is the ONLY source of
 * REDEEMED, always undoable; a present raw redeemed-key value (source field
 * kept out of this file — see classify.ts) OR the locally-persisted REVEALED
 * flag → REVEALED (Humble's reveal endpoint is `/humbler/redeemkey` — a
 * populated key value means revealed, not Steam-activated); otherwise →
 * UNREVEALED.
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
  /**
   * Steam AppID carried directly by the order-detail API's `steam_app_id`
   * field, captured only for `platform === 'steam'` tpks (Phase 12,
   * classify.ts). Optional — absent for non-Steam keys, and absent on
   * pre-Phase-12 cached rows until the HUMBLE_CLASSIFIER_VERSION bump
   * triggers a one-time backfill re-fetch.
   */
  steamAppId?: string
  /**
   * Ownership-overlay flag (Phase 12, spec §2.3): true when this key's game
   * is already owned on another platform (Steam first). Orthogonal to
   * `state` — it NEVER influences classification precedence and is NEVER
   * read by classify.ts; computed and filled in by dedup.ts (later plan).
   */
  ownedElsewhere: boolean
  /**
   * D-41 provenance for the ownership match: 'exact' AppID match, 'fuzzy'
   * name-similarity match, or 'none' when not owned (or not yet computed).
   * Lets Phase 14's C2 guard treat fuzzy matches more gently than exact ones.
   */
  matchConfidence: 'exact' | 'fuzzy' | 'none'
}

/**
 * `humbleLibraryStore` value shape, keyed by gamekey. `allTerminal` is true
 * iff every key in this order is REDEEMED or UNREDEEMABLE (never true for an
 * UNPICKED pseudo-entry) — read by the D-24 skip-terminal sync partitioning
 * (Plan 02) to freeze fully-terminal orders instead of re-fetching them.
 * `keys` rows now also carry the Phase 12 ownership-overlay fields
 * (steamAppId/ownedElsewhere/matchConfidence) — no change to this
 * `allTerminal` semantic.
 */
export interface HumbleOrderCacheEntry {
  gamekey: string
  keys: HumbleKey[]
  allTerminal: boolean
  /**
   * Server-terminality freeze predicate (14-08 gap closure, Fix 2) — OPTIONAL,
   * not required. (a) Absent on pre-v6 persisted cache entries (the field did
   * not exist before the 14-08 classifier bump); `partitionGamekeys` falls
   * back to `allTerminal` for those until their next re-fetch backfills it.
   * (b) All three write sites (classifyOrder, patchCachedState,
   * fetchAndCommitOrder) ALWAYS populate it going forward. (c) Distinct from
   * `allTerminal` (user-journey terminal — REDEEMED/UNREDEEMABLE only, D-24's
   * original meaning, preserved unchanged): `freezeEligible` also treats a
   * VALUE-BACKED REVEALED key with no pending future expiration as
   * frozen-safe, since REVEALED is server-final (Humble never un-populates
   * or changes a redeemed_key_val) — restoring the D-24 freeze benefit for
   * those orders and cutting the standing Cloudflare/WAF re-fetch exposure.
   * A REVEALED key with a live future expiration is deliberately NOT
   * freeze-eligible, so it keeps re-fetching until retroactive expiry can
   * reclassify it UNREDEEMABLE (no standalone recompute exists). Likewise
   * (CR-01, 14-08 re-review) a flag-only REVEALED key — local write-ahead
   * reveal flag with NO present key value (the D-78 ambiguous /
   * rejected_by_server outcomes) — is NOT freeze-eligible: it depends on
   * every-sync re-fetch for its "unconfirmed — sync to check"
   * reconciliation and the D-66 website-reveal value pickup (see
   * classify.ts's isFreezeEligible).
   */
  freezeEligible?: boolean
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

/**
 * Result of a guided-claim-flow "Reveal key" action (HCLAIM-01/02, Phase 14).
 * Discriminated on `status`, mirroring AdapterResult's status-literal
 * convention — never a boolean flag. `revealed` carries the redeemed key
 * value (kept off HumbleKey itself — C4/T-14-02, see PITFALLS.md B); `cooldown`
 * carries the throttle deadline so the UI can show a countdown instead of a
 * bare disabled state.
 */
export type RevealOutcome =
  | { status: 'revealed'; key: string }
  | { status: 'owned_blocked' } // C2 guard: key's game is already owned elsewhere
  | { status: 'failed' }
  | { status: 'ambiguous' }
  // WR-06 (14-REVIEW): a well-formed {success:false} response is a
  // definitive SERVER denial (e.g. already redeemed / expired) — distinct
  // from 'failed' ("nothing was used up") because the request WAS processed
  // by Humble; the truthful local state is "unconfirmed — sync to check".
  | { status: 'rejected_by_server' }
  | { status: 'ineligible' } // e.g. UNPICKED/UNREDEEMABLE — reveal not applicable
  | { status: 'cooldown'; retryAtMs: number }

/**
 * Result of a guided-claim-flow "Mark as redeemed" action (HCLAIM-04, D-77;
 * realigned by the Phase 14 gap closure, 14-07). `ok` records the local
 * redeem mark, which is the SOLE source of the REDEEMED state and is always
 * undoable; `ineligible` covers a key that is not in a state where local
 * redemption applies (i.e. it is not currently REVEALED).
 */
export type RedeemOutcome = { status: 'ok' } | { status: 'ineligible' }

/**
 * Per-key row annotation for the guided claim flow (Phase 14 IPC). The
 * caller (renderer) keys the returned map by the composite
 * `gamekey:machineName` string (Pattern 3 composite-key discipline).
 * `keyindexResolved` lets the renderer proactively show the Pitfall C
 * disabled "Sync to enable claiming" state for pre-Phase-14 cached rows that
 * have not yet been backfilled with a keyindex (HUMBLE_CLASSIFIER_VERSION
 * bump to 4 forces the one-time backfill).
 */
export interface ClaimAnnotation {
  revealedAt?: number
  redeemedAt?: number
  keyindexResolved: boolean
}
