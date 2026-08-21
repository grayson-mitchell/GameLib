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
export const listSteamLibraryTargets = makeHandlerInvoker(
  'listSteamLibraryTargets'
)
export const logoutSteam = makeListenerCaller('logoutSteam')

// Phase 17 (17-04): dedicated Steam CrossOver bottle provisioning + status.
export const steamBottleProvision = makeHandlerInvoker('steamBottleProvision')
export const isSteamBottleProvisioned = makeHandlerInvoker(
  'isSteamBottleProvisioned'
)
export const steamBottleStatus = makeHandlerInvoker('steamBottleStatus')
// Phase 34.13 (34.13-07), D-09/D-14/D-15: the install-form's only new IPC
// surface — registered on BOTH runtimes (main.ts + steamAuthFlowRegistration.ts).
export const isSteamBottleEligible = makeHandlerInvoker('isSteamBottleEligible')
export const persistBottleWineVersion = makeHandlerInvoker('persistBottleWineVersion')
// quick-260821-le0 (Task 3): sweeps every recorded install root for a Steam
// title in one action — registered on BOTH runtimes.
export const steamRemoveAllCopies = makeHandlerInvoker('steamRemoveAllCopies')
// One-way push (17-05 emits, 17-06 subscribes) — no handler, listener only.
export const handleSteamBottleSetupRequired = frontendListenerSlot(
  'steamBottleSetupRequired'
)

// Phase 21 (21-10), D-10/D-11: native Steam-CLIENT guided install +
// prompt-to-launch — distinct from the bottle-provisioning trio above.
export const steamClientSetupStart = makeHandlerInvoker('steamClientSetupStart')
export const steamClientSetupRecheck = makeHandlerInvoker(
  'steamClientSetupRecheck'
)
export const handleSteamClientSetupRequired = frontendListenerSlot(
  'steamClientSetupRequired'
)

// Phase 24 (24-09), R7/D-05: bridge-failure dialog signal — one-way push
// (24-06/24-08 emit, 24-09 subscribes), mirrors the bottle/client slots above.
export const handleSteamBridgeSetupRequired = frontendListenerSlot(
  'steamBridgeSetupRequired'
)
// One-way push — backend emits while background metadata/art fetch is running.
export const handleSteamMetadataSyncing = frontendListenerSlot(
  'steamMetadataSyncing'
)
// Phase 34.15 (34.15-02), D-06/D-07: one-way push, mirrors
// handleSteamMetadataSyncing above. This export is the highest-risk omission
// in the phase -- for a backend->renderer push, the sidecar's
// electronStub.pushFrontendMessage forwarder is channel-agnostic, so the emit
// side needs no allowlist. The silent-failure risk is entirely here: without
// this export (and GlobalState's subscription) the backend emits fine, Rust
// forwards fine, and the renderer simply has nobody listening -- no compile
// error, no runtime error, nothing arrives. Ledgered as
// sidecar-send-channels-fail-silently.
export const handleSteamSyncStatus = frontendListenerSlot('steamSyncStatus')
