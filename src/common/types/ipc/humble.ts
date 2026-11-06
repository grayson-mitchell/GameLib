import type {
  ClaimAnnotation,
  HumbleAuthState,
  HumbleKey,
  HumbleSyncState,
  HumbleUserData,
  HumbleValidationReport,
  RedeemOutcome
} from '../humble'

// ts-prune-ignore-next
export interface HumbleSync {
  humbleDisconnect: () => void
}

// ts-prune-ignore-next
export interface HumbleAsync {
  humbleGetUserInfo: () => Promise<HumbleUserData | undefined>
  humbleCheckHealth: () => Promise<void>
  // Plan 05 (Phase 10): dev-only D-12 validation trigger. Wired only behind a
  // dev-flag guard in backend/main.ts (never in packaged builds, T-10-16) —
  // exercises the real adapter with the real stored cookie and returns a
  // redacted HumbleValidationReport (D-15, no cookie/gamekey values).
  humbleRunValidation: () => Promise<HumbleValidationReport>
  // Phase 11 (library.ts, Plan 02): triggers a bounded-concurrency sync
  // (D-23/D-25). Returns the overall outcome — never throws; failures are
  // fail-soft (D-31), surfaced via humbleGetSyncState instead.
  humbleSync: () => Promise<{ status: 'ok' | 'partial' | 'failed' }>
  // Returns the current display-safe key inventory from humbleLibraryStore
  // (never the generic storeGet bridge — WR-09 finding, T-11 store isolation).
  humbleGetKeys: () => Promise<HumbleKey[]>
  humbleGetSyncState: () => Promise<HumbleSyncState>
  // Phase 12 (Plan 04, D-42): "Not the same game" override for a
  // fuzzy-matched ownership row. Only ever meaningful for
  // matchConfidence === 'fuzzy' keys — the backend validates this
  // server-side (never trust renderer-only gating) and no-ops for an
  // exact-match machineName.
  humbleSetOwnershipOverride: (machineName: string) => Promise<void>
  humbleClearOwnershipOverride: (machineName: string) => Promise<void>
  // WR-04 (14-REVIEW): machineName->overriddenAt (ms) map of every recorded
  // "Not the same game" override, so the undo affordance can key off "an
  // override record exists" rather than the (cleared-by-the-override)
  // fuzzy/owned flags.
  humbleGetOwnershipOverrides: () => Promise<Record<string, number>>
  // Phase 13 (Plan 02, D-59/D-57 resolution): confirms the user completed the
  // "Open Humble" gift action for a giftable-spares key (an
  // ownedElsewhere && state === 'UNREVEALED' key). The backend re-validates
  // both conditions server-side (never trust renderer-only gating) and
  // no-ops for an ineligible machineName. No gift-link value ever crosses
  // this channel — D-57 resolved to a static deep-link GameLib never
  // possesses.
  humbleRecordGiftLinkOpened: (machineName: string) => Promise<void>
  // Returns the machineName->giftedAt (ms) map from humbleGiftedAtStore so
  // the Spares view can disable/label an already-gifted key (D-59).
  humbleGetGiftedAt: () => Promise<Record<string, number>>
  // Phase 14 (HCLAIM-04, D-77): marks a key as locally redeemed. Backend
  // re-validates eligibility server-side (never trust renderer-only gating).
  humbleMarkRedeemed: (params: {
    gamekey: string
    machineName: string
  }) => Promise<RedeemOutcome>
  // Phase 14: reverses a local-only "Mark as redeemed" action (Undo
  // affordance) — never applicable to a server-confirmed redeem.
  humbleUndoRedeemed: (params: {
    gamekey: string
    machineName: string
  }) => Promise<void>
  // Phase 14: returns the previously-revealed key value for a key that was
  // already revealed in an earlier session, or null if not yet revealed
  // (Pitfall B — REVEALED flag set but no confirmed key value stored yet).
  humbleGetRevealedKeyValue: (params: {
    gamekey: string
    machineName: string
  }) => Promise<string | null>
  // Phase 14: per-key reveal/redeem annotations, keyed by the composite
  // `gamekey:machineName` string, for the claim-flow wizard/list UI.
  humbleGetClaimAnnotations: () => Promise<Record<string, ClaimAnnotation>>
}

// ts-prune-ignore-next
export interface HumbleFrontendMessages {
  openScreen: (screen: string) => void
  // Plan 02 (Phase 10): pushed by HumbleUser.checkHealthAndFlagExpiry() on a
  // startup/401 expiry detection. MUST NOT include the session cookie
  // (Pitfall 4 / T-10-05) — HumbleAuthState is structurally cookie-free.
  humbleAuthState: (state: HumbleAuthState) => void
  // Phase 11 (library.ts, Plan 02): pushed after each sync commits fresh
  // data. Carries the display-safe HumbleKey[] only — no cookie, no raw
  // key value (C4 / T-11-01).
  humbleKeysUpdated: (keys: HumbleKey[]) => void
  // Phase 11 (library.ts, Plan 02): progressive-fill sync progress (D-26).
  // No cookie, no raw key/gamekey values — counts only.
  humbleSyncProgress: (progress: { done: number; total: number }) => void
  // Live-UAT round 2 (D-31/D-32): terminal sync-state push, emitted on EVERY
  // HumbleLibrary.sync() exit path. The single authoritative end-of-sync
  // signal — carries syncedAt/syncError/cooldownUntil so the freshness line
  // and the fail-soft banner update in-session. Display-safe by type: no
  // cookie, no key values.
  humbleSyncStateChanged: (state: HumbleSyncState) => void
}
