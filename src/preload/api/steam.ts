import { frontendListenerSlot, makeHandlerInvoker, makeListenerCaller } from '../ipc'

export const steamStartQR = makeHandlerInvoker('steamStartQR')
export const steamPollQR = makeHandlerInvoker('steamPollQR')
export const steamPollCredential = makeHandlerInvoker('steamPollCredential')
export const steamStartCredentials = makeHandlerInvoker('steamStartCredentials')
export const steamSubmitGuard = makeHandlerInvoker('steamSubmitGuard')
export const redeemSteamKey = makeHandlerInvoker('redeemSteamKey')
export const getSteamUserInfo = makeHandlerInvoker('getSteamUserInfo')
export const checkSteamInstalled = makeHandlerInvoker('checkSteamInstalled')
export const getSteamSyncedAt = makeHandlerInvoker('getSteamSyncedAt')
export const getSteamInstallSize = makeHandlerInvoker('getSteamInstallSize')
// Phase 21 (21-09), D-09: multi-library override picker data source.
export const listSteamLibraryTargets = makeHandlerInvoker('listSteamLibraryTargets')
// quick 261105-upw: modal's backend-authoritative InstallApp-route discriminator.
export const getSteamInstallAppTargets = makeHandlerInvoker('getSteamInstallAppTargets')
// quick 261106-s3n: backend-authoritative "GameLib deletes this Steam game" verdict.
export const getSteamDeleteRoute = makeHandlerInvoker('getSteamDeleteRoute')
export const logoutSteam = makeListenerCaller('logoutSteam')

// Phase 17 (17-04): dedicated Steam CrossOver bottle provisioning + status.
export const steamBottleProvision = makeHandlerInvoker('steamBottleProvision')
export const isSteamBottleProvisioned = makeHandlerInvoker('isSteamBottleProvisioned')
export const steamBottleStatus = makeHandlerInvoker('steamBottleStatus')
// Phase 34.13 (34.13-07), D-09/D-14/D-15: the install-form's only new IPC
// surface — registered on BOTH runtimes (main.ts + steamAuthFlowRegistration.ts).
export const isSteamBottleEligible = makeHandlerInvoker('isSteamBottleEligible')
export const persistBottleWineVersion = makeHandlerInvoker('persistBottleWineVersion')
// Phase 51 Plan 13 (D-51-09/10/11): the composed bridge-vs-bottle route pair.
export const getSteamBridgeRoute = makeHandlerInvoker('getSteamBridgeRoute')
// quick 261106-pvk: one-way push, library.ts no-activity give-up.
export const handleSteamRequestNotice = frontendListenerSlot('steamRequestNotice')
/** @public reached only as `window.api.handleSteamAdoptionStatusChanged` through the preload api bundle, which knip cannot trace (Phase 81 D-07, D-03: the game page's adoption status, pushed live) */
export const handleSteamAdoptionStatusChanged = frontendListenerSlot('steamAdoptionStatusChanged')
export const setSteamBridgeUserRoute = makeHandlerInvoker('setSteamBridgeUserRoute')
// quick-260821-le0 (Task 3): sweeps every recorded install root for a Steam
// title in one action — registered on BOTH runtimes.
export const steamRemoveAllCopies = makeHandlerInvoker('steamRemoveAllCopies')
// quick 261117-p38: "Launch without Steam" -- the eligibility verdict and the launch (sidecar-only).
/** @public reached only as `window.api.steamDirectLaunchVerdict` through the preload api bundle, which knip cannot trace */
export const steamDirectLaunchVerdict = makeHandlerInvoker('steamDirectLaunchVerdict')
// Phase 81 D-05: the one-shot launch from the refused-restart notice (sidecar-only, verdict re-derived).
/** @public reached only as `window.api.steamLaunchWithoutSteamOnce` through the preload api bundle, which knip cannot trace */
export const steamLaunchWithoutSteamOnce = makeHandlerInvoker('steamLaunchWithoutSteamOnce')
// Phase 81 D-01..D-03: the game page's pending-adoption read and its two actions (sidecar-only).
/** @public reached only as `window.api.steamAdoptionStatus` through the preload api bundle, which knip cannot trace */
export const steamAdoptionStatus = makeHandlerInvoker('steamAdoptionStatus')
/** @public reached only as `window.api.steamAdoptionRestartNow` through the preload api bundle, which knip cannot trace */
export const steamAdoptionRestartNow = makeHandlerInvoker('steamAdoptionRestartNow')
/** @public reached only as `window.api.steamAdoptionOpenSteam` through the preload api bundle, which knip cannot trace */
export const steamAdoptionOpenSteam = makeHandlerInvoker('steamAdoptionOpenSteam')
// Phase 58 Plan 31 (M-01 Direction A): the friend picker's list and invite channels -- sidecar-only.
export const steamBridgeListFriends = makeHandlerInvoker('steamBridgeListFriends')
export const steamBridgeInviteFriend = makeHandlerInvoker('steamBridgeInviteFriend')
// Quick 261101-llf: the invite request is no longer pushed to the main window; helperProcess.ts
// opens the dedicated `bridge-invite` window through the shell instead.
// One-way push (17-05 emits, 17-06 subscribes) — no handler, listener only.
export const handleSteamBottleSetupRequired = frontendListenerSlot('steamBottleSetupRequired')
// quick 261027-tot: one-way push (setupDownloads.ts emits, SteamSetupDownloads.ts
// subscribes). Omitting this slot fails silently -- see the 'highest-risk omission' note.
export const handleSteamSetupDownloadProgress = frontendListenerSlot('steamSetupDownloadProgress')
// Phase 51 Plan 13 (D-51-08/11): one-way push -- games.ts's install() emits,
// Task 3's SteamBridgeRouteNotice.ts subscribes. No handler, listener only.
export const handleSteamBridgeRouteNotice = frontendListenerSlot('steamBridgeRouteNotice')

// Phase 21 (21-10), D-10/D-11: native Steam-CLIENT guided install +
// prompt-to-launch — distinct from the bottle-provisioning trio above.
export const steamClientSetupStart = makeHandlerInvoker('steamClientSetupStart')
export const steamClientSetupRecheck = makeHandlerInvoker('steamClientSetupRecheck')
export const handleSteamClientSetupRequired = frontendListenerSlot('steamClientSetupRequired')

// Phase 24 (24-09), R7/D-05: bridge-failure dialog signal — one-way push
// (24-06/24-08 emit, 24-09 subscribes), mirrors the bottle/client slots above.
export const handleSteamBridgeSetupRequired = frontendListenerSlot('steamBridgeSetupRequired')
// One-way push — backend emits while background metadata/art fetch is running.
export const handleSteamMetadataSyncing = frontendListenerSlot('steamMetadataSyncing')
// Phase 34.15 (34.15-02), D-06/D-07: one-way push, mirrors
// handleSteamMetadataSyncing above. This export is the highest-risk omission
// in the phase -- for a backend->renderer push, the sidecar's
// platformApi.pushFrontendMessage forwarder is channel-agnostic, so the emit
// side needs no allowlist. The silent-failure risk is entirely here: without
// this export (and GlobalState's subscription) the backend emits fine, Rust
// forwards fine, and the renderer simply has nobody listening -- no compile
// error, no runtime error, nothing arrives. Ledgered as
// sidecar-send-channels-fail-silently.
export const handleSteamSyncStatus = frontendListenerSlot('steamSyncStatus')

// Phase 51 Plan 08 (D-51-16, folded todo): one-way push, mirrors
// handleSteamBridgeSetupRequired above -- backend emits via
// bottleProcessMonitor.ts's waiting-state check, 51-08's GlobalState
// listener subscribes.
export const handleSteamBottleLaunchWaiting = frontendListenerSlot('steamBottleLaunchWaiting')
