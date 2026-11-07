import type { SteamGoOfflineAction } from 'common/types/steam'
import type SteamUserLib from 'steam-user'

// ── D-02 (Phase 33-02) / Phase 54: ensureConnected canary + wrapped re-entry ─
//
// CANARY_APP_ID = 753 is the Steam client's own AppID — a minimal,
// universally-owned probe app that requires no per-user ownership check, so
// the canary getProductInfo call never fails for reasons unrelated to CM
// socket health.
//
// CANARY_TIMEOUT_MS is deliberately far below STEAM_PICS_TIMEOUT_MS (25s,
// withTimeout.ts) — a healthy CM answers a single-app getProductInfo in well
// under a second; 5s already generously covers network jitter before we
// suspect a stale socket.
//
// Phase 54 (spike 046, debug verdict 2026-10-27): a second authenticated CM
// session on the same account signs Mac Steam's Friends out. So this class
// owns EVERY authenticated logon: autoRelogin is off, client.relog() is never
// called, a post-logon drop ENDS the session, and a stale canary re-enters the
// same wrapped cold connect (withMacSteamOffline) a first connect uses.
export const CANARY_APP_ID = 753
export const CANARY_TIMEOUT_MS = 5000

// How long the last released lease keeps the session open (RESEARCH Pattern 2:
// prescreen -> install -> shim resolve -> shared redist must not thrash).
export const AUTH_SESSION_IDLE_GRACE_MS = 60000
// The authenticated connect waits this long for loggedOn/error, then logOff()s
// the attempt. The wrap cannot fire goonline while a logon is in flight, so
// this replaces the old 15 s fallback + separate 20 s grace window.
export const AUTH_LOGON_BOUND_MS = 35000
// Persona name lookup at sign-in only; bounded so Mac Steam is not held offline.
export const SIGN_IN_PERSONA_TIMEOUT_MS = 5000

export type AuthSessionReason =
  | 'user-refresh'
  | 'login'
  | 'user-install'
  | 'prescreen'
  | 'redeem'
  | 'shared-redist'
  | 'plan-retry'
  | 'original-restore'

export type AuthSessionRefusal =
  | 'shutting-down'
  | 'not-signed-in'
  | 'token-unreadable'
  | 'token-absent'
  | 'logon-rejected'
  | 'client-not-ready'
  | 'go-offline-required'

export interface AcquireAuthenticatedOpts {
  reason: AuthSessionReason
  guidedAction?: SteamGoOfflineAction
  appName?: string
  // 54-REVIEW CR-01: the install's own target, carried into the guided Go
  // Offline push so Continue replays the install the user confirmed.
  installPath?: string
  forceWindowsViaBottle?: boolean
}

export interface GuidedInstallTarget {
  installPath?: string
  forceWindowsViaBottle?: boolean
}

type SteamUserClient = InstanceType<typeof SteamUserLib>

export type AuthenticatedLease =
  | { ok: true; client: SteamUserClient; release: () => void }
  | { ok: false; reason: AuthSessionRefusal }

export interface OpenAuthenticatedLease {
  client: SteamUserClient
  release: () => void
}

// QR_LOGIN_TIMEOUT_MS is the single source of truth for the QR session's
// loginTimeout. The challenge-issued log line below interpolates this same
// constant (never a second hand-typed 120000) so the logged value cannot
// drift from the value actually set on the session.
export const QR_LOGIN_TIMEOUT_MS = 120000

// quick 261011-rj0: the EResults with which the CM refuses the CREDENTIAL
// itself, as opposed to refusing this connection (LogonSessionReplaced,
// RateLimitExceeded, ServiceUnavailable, ...). Only these mean "the stored
// refresh token is no longer good" and so only these may latch
// `credentialsMissing` -- the Library then shows the sign-in row with Sign in,
// which is the one action that fixes it. Values from
// node_modules/steam-user/enums/EResult.js; literal numbers rather than
// `SteamUserLib.EResult` so the test double (which carries no enum) and the
// runtime cannot disagree.
export const CREDENTIAL_REFUSAL_ERESULTS: ReadonlySet<number> = new Set([
  5, // InvalidPassword
  15, // AccessDenied -- the live case (gamelib.log 2026-10-10/11)
  26, // Revoked
  27, // Expired
  63 // AccountLogonDenied
])
export const CREDENTIAL_REFUSAL_NAMES: ReadonlySet<string> = new Set([
  'InvalidPassword',
  'AccessDenied',
  'Revoked',
  'Expired',
  'AccountLogonDenied'
])
