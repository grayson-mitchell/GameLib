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
