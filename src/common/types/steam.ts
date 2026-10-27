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
  /** D-12 (34.15): the backend's `steamMetadataStore` read of
   * `is_mac_native === true`, captured on the SAME round trip and after the
   * SAME `ensurePlatformsCaptured()` await as `hasWindowsDepot` above.
   * MEANINGLESS on its own, exactly like `hasWindowsDepot`: it must never be
   * read without `platformsCaptured === true` also holding.
   *
   * It exists because `library.ts:785` collapses `is_mac_native ?? false` at
   * the `GameInfo`-build boundary, so the renderer's seed cannot distinguish
   * "no mac build" from "never captured". The Windows field is deliberately
   * NOT collapsed there; the mac one is. This verdict field is how the mac
   * question reaches the renderer un-collapsed. */
  hasMacDepot: boolean
  /** D-03 (34.14): whether the appdetails fetch actually landed. `false`
   * covers offline, an errored fetch, AND the `METADATA_FETCH_TIMEOUT_MS`
   * expiry — `ensurePlatformsCaptured()` returns unconditionally at its
   * deadline, so without this field a timed-out probe is indistinguishable
   * from a confirmed absent Windows depot, which is the exact defect Phase
   * 34.14 exists to end. */
  platformsCaptured: boolean
  wineVersion?: WineInstallation
  bottleName?: string
  /** D-51-09: the composed bridge-vs-bottle route verdict for this game,
   * carried on the SAME round trip as the rest of this interface so the
   * install dialog's wine section can render the route line ("Native Steam
   * bridge" / "Bottled Steam client") without a second IPC call. Produced by
   * 51-07's pure resolver (seed ∪ persisted verdict ∖ known-bad ∖
   * forced-bottle) and populated here by 51-09's backend read. Optional and
   * absent on every pre-Phase-51 caller — existing producers of
   * `SteamBottleEligibilityVerdict` compile unchanged. */
  bridgeRoute?: SteamBridgeRouteVerdict
}

/** D-51-08: the closed taxonomy of reasons a title sits on the bundled
 * known-bad list (`bridge-allowlist.json` version 2, `knownBad[]`). Named by
 * the pre-attempt dialog so the user is told WHY a title routes to bottled
 * Steam instead of being silently steered there. Produced by 51-03's
 * `bridgeAllowlist.knownBadReason()`; consumed by 51-07's route resolver and
 * 51-16's known-bad dialog. */
export type SteamBridgeKnownBadReason =
  | 'drm-wrapped'
  | 'win64-only'
  | 'p2p-required'
  | 'does-not-run'

/** D-51-05/07/08/09/10/11: every reason the composed bridge route resolver
 * (51-07) can land on 'bridge', 'bottle', or 'not-eligible'. Produced by
 * 51-07's pure resolver; consumed by 51-09's backend (persistence / IPC
 * surface), 51-13's IPC handlers, and 51-16's UI (route line, notice,
 * known-bad dialog). `'seed'` = present in the bundled seed list with no
 * scan yet; `'scan-clean'` = a persisted scan found full coverage;
 * `'pending-scan'` = never scanned (or a prior scan was invalidated by a
 * shim release, D-51-07's auto-clear); `'no-steam-api'` = the game ships no
 * `steam_api*.dll` at all; `'user-forced-bridge'` = D-51-11's "Try the
 * bridge anyway" override; `'scan-miss'` = a persisted scan found missing
 * symbols; `'known-bad'` = the bundled known-bad list matched; `'win64-no-
 * shim'` = a `steam_api64.dll` import with no Win64 shim target (D-51-13
 * fail-closed default); `'user-forced-bottle'` = D-51-10's toggle;
 * `'failed-this-session'` = the existing session-scoped circuit breaker
 * (`bridgeFailedThisSession`, games.ts) fired. */
export type SteamBridgeRouteReason =
  | 'seed'
  | 'scan-clean'
  | 'pending-scan'
  | 'no-steam-api'
  | 'user-forced-bridge'
  | 'scan-miss'
  | 'known-bad'
  | 'win64-no-shim'
  | 'user-forced-bottle'
  | 'failed-this-session'

/** D-51-07/08/09/10/11: the composed bridge-vs-bottle route verdict — the
 * single value 51-07's pure resolver produces from seed ∪ persisted verdict
 * ∖ known-bad ∖ forced-bottle, and every later plan in this phase reads
 * instead of re-deriving the composition. Consumed by 51-09 (backend
 * persistence/read), 51-13 (IPC handlers), and 51-16 (install dialog route
 * line, game-page line, known-bad dialog, notice).
 *
 * `installedIn` is the ONE field the pure resolver (51-07) never fills — it
 * answers "where does an EXISTING install's bits already live", which only
 * 51-09's `getBridgeRouteVerdict` (a backend read, not a pure function) can
 * know. The pure resolver always returns `installedIn: null`; this is
 * declared here (not as a 51-09-only extension) so the single shared type
 * never has two incompatible shapes across the phase. */
export interface SteamBridgeRouteVerdict {
  route: 'bridge' | 'bottle' | 'not-eligible'
  reason: SteamBridgeRouteReason | null
  knownBadReason: SteamBridgeKnownBadReason | null
  /** D-51-07/09: the symbols a persisted scan found missing, surfaced
   * verbatim on the game page and the D-05 fallback dialog. Empty when the
   * route was not decided by a scan miss. */
  missingSymbols: string[]
  /** D-51-02: true when this game launches through a stubbed interface or
   * an identity fallback (D-51-04) — drives the one-time per-game notice. */
  noticeRequired: boolean
  /** D-51-02: the interface families served as stubs for this game (from
   * 51-02's `evaluateShimCoverage`), named in the one-time notice. */
  stubbedInterfaces: string[]
  /** D-51-04: true when the bridge helper fell back to AppID 480
   * identity-only for this game (real-AppID init failed). */
  identityFallback: boolean
  /** D-51-10/11: the user's own override, persisted beside the scan verdict
   * (`bridge.userRoute` on `SteamMetadataCacheEntry`) — `null` means no
   * override has ever been set. */
  userRoute: 'bottle' | 'bridge' | null
  /** Where an EXISTING install's bits already live, or `null` when nothing
   * is installed yet. See this interface's own doc comment: the pure
   * resolver (51-07) always returns `null` here; only 51-09's backend read
   * fills it in. */
  installedIn: 'bridge' | 'bottle' | null
}

/** D-51-16 (folded todo): the three causes 51-16's "Waiting for Steam…"
 * state distinguishes when a bottled-Steam fallback launch has produced no
 * game process within the grace window — detected from the bottle's
 * `logs/bootstrap_log.txt` / `console_log.txt` per the todo's own
 * prescription. Produced by the bottle-launch waiting-state detector;
 * consumed by the `steamBottleLaunchWaiting` frontend message below. */
export type SteamBottleLaunchWaitingCause =
  | 'self-update'
  | 'login'
  | 'other-session'

/** Phase 54: what the guided Go Offline step was asked for. */
export type SteamGoOfflineAction = 'refresh' | 'install' | 'redeem'

/** Phase 54: backend push (`steamGoOfflineRequired`) payload. */
export interface SteamGoOfflinePayload {
  action: SteamGoOfflineAction
  appName?: string
  /** 54-REVIEW CR-01: the refused install's own `InstallArgs.path` and
   *  `steamForceWindowsViaBottle`, so the guided Continue replays the install
   *  the user confirmed instead of the default library and route. Absent
   *  when the backend never saw them. */
  installPath?: string
  forceWindowsViaBottle?: boolean
}

/** Phase 54: result of the renderer's `steamGoOfflineRetry` invoke. */
export type SteamGoOfflineRetryResult = {
  status: 'ready' | 'still-online' | 'not-macos'
}
