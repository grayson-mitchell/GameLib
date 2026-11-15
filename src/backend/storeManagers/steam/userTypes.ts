import type { SteamGoOfflineAction } from 'common/types/steam'
import type { SteamCmClient } from './cm/SteamCmClient'

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

export type AuthenticatedLease =
  | { ok: true; client: SteamCmClient; release: () => void }
  | { ok: false; reason: AuthSessionRefusal }

export interface OpenAuthenticatedLease {
  client: SteamCmClient
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
export const CREDENTIAL_REFUSAL_ERESULTS: readonly number[] = Object.freeze([
  5, // InvalidPassword
  15, // AccessDenied -- the live case (gamelib.log 2026-10-10/11)
  26, // Revoked
  27, // Expired
  63 // AccountLogonDenied
])
export const CREDENTIAL_REFUSAL_NAMES: readonly string[] = Object.freeze([
  'InvalidPassword',
  'AccessDenied',
  'Revoked',
  'Expired',
  'AccountLogonDenied'
])
