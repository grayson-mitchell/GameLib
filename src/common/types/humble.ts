// Humble domain contracts (Phase 10 scaffold).
//
// Scope note: HumbleKey/HumbleOrder library types are Phase 11 scope and are
// intentionally NOT defined here.

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
