import type { WineInstallation } from '../types'

export interface SteamCredentials {
  refreshToken: string // encrypted via safeStorage; decrypted before use
}

export interface SteamUserData {
  username: string // persona name from steam-user after loggedOn
  steamId?: string // SteamID64 — optional, used for display
}

// Phase 26 (26-01): SteamUser.redeemKey()'s discriminated result shape. Every
// EPurchaseResult value (8) classifies into exactly one of these 4 outcome
// buckets (SPEC REQ5). `store` is a hidden, store-aware-ready parameter
// (REQ-26-06/D-05) — defaulted to 'steam' by callers, only 'steam' is wired
// today, no visible store selector exists yet.
export type RedeemKeyOutcome =
  | 'success'
  | 'already-owned'
  | 'invalid'
  | 'rate-limited'
  | 'error'

export interface RedeemKeyResult {
  store: 'steam'
  outcome: RedeemKeyOutcome
  packageList?: Record<string, string> // packageID -> display name, from redeemKey()
  message?: string // present on 'error' (e.g. 'not-connected')
}

// Phase 17 (17-02): dedicated Steam CrossOver bottle settings, persisted in
// its own `steamBottleConfigStore` — NOT a phantom GameConfig entry (see
// RESEARCH.md "Alternatives Considered"). Shared by
// src/backend/storeManagers/steam/electronStores.ts and the StoreStructure
// map below.
// NOTE: must stay a `type` alias (not `interface`) — TypeScript only permits
// implicit index-signature assignability (required by StoreStructure's
// `Record<string, unknown>` bound) for type-literal aliases, not interfaces.
export type SteamBottleConfig = {
  bottleName: string
  wineVersion?: WineInstallation
  wineCrossoverBottle?: string
  provisioned: boolean
  // WR-02 (17-17): the former `loggedIn` field was removed — bottled-Steam auth
  // is opaque (D-04), so no backend point could ever truthfully write it; it
  // always reported false. Leaving a dead always-false signal only invited a
  // future consumer to trust it. steamBottleStatus surfaces provisioned +
  // bottleName only.
}

// D-17 (34.13-01): the return shape of the `isSteamBottleEligible` IPC
// channel, registered by 34.13-07 in BOTH `main.ts` and
// `steamAuthFlowRegistration.ts`. `wineVersion` / `bottleName` are shaped
// after `getSteamBottleSettings()`'s own fields and exist so ONE round-trip
// also closes D-15's exposure half — `SteamBottleSetup.tsx` (34.13-09) reads
// the persisted `wineVersion` from here instead of re-deriving it via
// `resolveSteamBottleEngine`. The `AsyncIPCFunctions` signature for the
// channel is 34.13-07's edit to `src/common/types/ipc.ts`, not this plan's.
export interface SteamBottleEligibilityVerdict {
  eligible: boolean
  /** D-03 (34.14): the backend's `steamMetadataStore` read of
   * `is_windows_native === true`, captured AFTER `checkBottleEligibility()`
   * has already awaited `ensurePlatformsCaptured()`. MEANINGLESS on its own:
   * this field must never be read without `platformsCaptured === true` also
   * holding — see D-03's single-seam obligation, discharged by read order
   * inside `resolveSteamSectionGating`. */
  hasWindowsDepot: boolean
  /** D-03 (34.14): whether the appdetails fetch actually landed. `false`
   * covers offline, an errored fetch, AND the `METADATA_FETCH_TIMEOUT_MS`
   * expiry — `ensurePlatformsCaptured()` returns unconditionally at its
   * deadline, so without this field a timed-out probe is indistinguishable
   * from a confirmed absent Windows depot, which is the exact defect Phase
   * 34.14 exists to end. */
  platformsCaptured: boolean
  wineVersion?: WineInstallation
  bottleName?: string
}
