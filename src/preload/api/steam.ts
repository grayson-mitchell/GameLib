import { frontendListenerSlot, makeHandlerInvoker, makeListenerCaller } from '../ipc'

export const steamStartQR = makeHandlerInvoker('steamStartQR')
export const steamPollQR = makeHandlerInvoker('steamPollQR')
export const steamPollCredential = makeHandlerInvoker('steamPollCredential')
export const steamStartCredentials = makeHandlerInvoker('steamStartCredentials')
export const steamSubmitGuard = makeHandlerInvoker('steamSubmitGuard')
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
// One-way push — backend emits while background metadata/art fetch is running.
export const handleSteamMetadataSyncing = frontendListenerSlot(
  'steamMetadataSyncing'
)
