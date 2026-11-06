import type { WineInstallation } from '../../types'
import type {
  RedeemKeyResult,
  SteamBottleConfig,
  SteamBottleEligibilityVerdict,
  SteamBridgeRouteReason,
  SteamGoOfflineRetryResult,
  BridgeListFriendsResult,
  BridgeInviteResult,
  SteamBridgeRouteVerdict,
  SteamEngineState,
  SteamEngineOption,
  SteamUserData
} from '../steam'

export interface SteamAuthSync {
  logoutSteam: () => void
}

export interface SteamAuthAsync {
  steamStartQR: () => Promise<{
    status: 'done' | 'error'
    challengeUrl?: string
  }>
  steamPollQR: () => Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }>
  steamPollCredential: () => Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }>
  steamStartCredentials: (credentials: {
    username: string
    password: string
  }) => Promise<{ status: 'done' | 'guard_required' | 'error' }>
  steamSubmitGuard: (code: string) => Promise<{ status: 'done' | 'error' }>
  redeemSteamKey: (payload: {
    store: 'steam'
    key: string
  }) => Promise<RedeemKeyResult>
  getSteamUserInfo: () => Promise<SteamUserData | undefined>
  checkSteamInstalled: () => Promise<boolean>
  getSteamSyncedAt: () => Promise<number | null>
  getSteamInstallSize: (appId: string) => Promise<string>
  // Phase 17 (17-04): provisions the dedicated Steam CrossOver bottle
  // (create via the locked cxbottle mechanism, fetch + non-silently run
  // SteamSetup.exe, D-02). Bottled-Steam auth stays opaque (D-04) — this
  // never inspects loginusers.vdf/sentry.
  steamBottleProvision: (args?: {
    bottleName?: string
    wineVersion?: WineInstallation
  }) => Promise<{
    status: 'done' | 'error'
    error?: string
    errorCode?: 'crossover-missing'
  }>
  isSteamBottleProvisioned: () => Promise<boolean>
  steamBottleStatus: () => Promise<
    Pick<SteamBottleConfig, 'provisioned' | 'bottleName'>
  >
  // Phase 34.13 (34.13-07), D-09/D-15 (exposure half): backend-authoritative
  // bottle-eligibility verdict for the install-form's wine section, carrying
  // the PERSISTED wineVersion/bottleName (undefined when nothing was ever
  // persisted — see installFormIpc.ts's own doc comment for why this never
  // delegates to getSteamBottleSettings()). Registered on BOTH runtimes.
  isSteamBottleEligible: (
    appName: string
  ) => Promise<SteamBottleEligibilityVerdict>
  // Phase 51 Plan 03 (D-51-07/08/09/10/11): the composed bridge-vs-bottle
  // route verdict for a single game, resolved by 51-07's pure resolver and
  // read here by 51-09's backend. See SteamBridgeRouteVerdict's own doc
  // comment (common/types/steam.ts) for the full field contract.
  getSteamBridgeRoute: (appId: string) => Promise<SteamBridgeRouteVerdict>
  // Phase 59 (D-04/D-06/D-13/D-14/D-15)
  getSteamEngineState: (appId: string) => Promise<SteamEngineState | null>
  listSteamEngineOptions: () => Promise<SteamEngineOption[]>
  dismissSteamEngineNotice: (
    args:
      | { kind: 'no-crossover' }
      | { kind: 'untested-crossover'; build: string }
  ) => Promise<{ ok: boolean }>
  // Phase 51 Plan 03 (D-51-10/11): persists the user's own bridge/bottle
  // override (D-51-10's install-dialog toggle, D-51-11's "Try the bridge
  // anyway" button) beside the scan verdict, via 51-09's bridgeVerdict.ts
  // writer. `acknowledgeReason` is set when the override is a response to a
  // specific dialog (e.g. a known-bad acknowledgement) so the backend can
  // record which notice/dialog state the user was shown; omitted for a
  // plain toggle flip.
  setSteamBridgeUserRoute: (args: {
    appId: string
    userRoute: 'bottle' | 'bridge' | null
    acknowledgeReason?: SteamBridgeRouteReason
  }) => Promise<{ ok: boolean; error?: string }>
  // quick-260821-le0 (Task 3): sweeps EVERY recorded install root for a
  // Steam title in one action — see removeAllCopies.ts's own doc comment.
  // Registered on BOTH runtimes.
  steamRemoveAllCopies: (appName: string) => Promise<{
    removed: number
    refused: number
    error?: string
  }>
  // Phase 54: sidecar-only, registered by plan 07. The renderer's Continue
  // button on the guided Go Offline step; arms the one-shot guided restore.
  steamGoOfflineRetry: () => Promise<SteamGoOfflineRetryResult>
  // 54-REVIEW WR-05: sidecar-only. The guided Go Offline step's Cancel/close;
  // pays the goonline a ready-but-abandoned guided step owes.
  steamGoOfflineCancel: () => Promise<void>
  // Phase 58 Plan 31 (M-01 Direction A): sidecar-only friend picker channels.
  steamBridgeListFriends: (appId: string) => Promise<BridgeListFriendsResult>
  steamBridgeInviteFriend: (
    appId: string,
    ordinal: number
  ) => Promise<BridgeInviteResult>
  // Phase 34.13 (34.13-07), D-14: persists the install form's chosen wine
  // engine into steamBottleConfigStore via bottle.ts's own
  // persistBottleWineVersion() primitive, after validating the untrusted
  // renderer payload. Return shape reused verbatim from steamBottleProvision.
  // Registered on BOTH runtimes.
  persistBottleWineVersion: (
    wineVersion: WineInstallation
  ) => Promise<{ status: 'done' | 'error'; error?: string }>
  // Phase 21 (21-10), D-10: on user consent, downloads + non-silently runs
  // (Win/macOS) or link-opens (Linux) the official native Steam client
  // installer. See clientSetup.ts's startGuidedClientInstall.
  steamClientSetupStart: () => Promise<{
    status: 'started' | 'link-opened' | 'error'
    error?: string
  }>
  // Phase 21 (21-10), D-10/D-11: re-checks ensureSteamClientReady(appId)
  // after the user has acted (finished the guided install, or launched
  // Steam once) — the frontend polls/re-checks this to know when to retry
  // the install. appId is guarded server-side (T-21-05) inside
  // ensureSteamClientReady itself, the single seam both this handler and
  // SteamGame.install() go through. Also called once by
  // startSteamQuickInstall on a library-missing verdict (D-UAT-15), so the
  // backend push opens client setup before any library notice. Console
  // Mode's probeSteamQuickInstallTarget calls it once on the same verdict
  // (quick 261102-pgy); its card hands setup off to desktop mode.
  steamClientSetupRecheck: (appId: string) => Promise<{
    status: 'ready' | 'needs-install' | 'needs-launch'
    ready: boolean
    error?: string
  }>
}
