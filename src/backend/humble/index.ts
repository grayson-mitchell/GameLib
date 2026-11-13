import type { AppInfo } from 'backend/process/context'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import type { ManagerDeps, Stores } from 'backend/services/types'
import type { SteamUser } from 'backend/storeManagers/steam/user'

import {
  createHumbleActionIdCache,
  type HumbleActionIdCache
} from './actionIdCache'
import { createHumbleLibrary, type HumbleLibrary } from './library'
import {
  createLoginWindowSeamSlot,
  type LoginWindowSeamSlot
} from './loginWindowSeam'
import type { HumbleSecretStore } from './secretStore'
import { createSteamAppIdResolver } from './steamAppIdResolver'
import { createHumbleSyncFence, type HumbleSyncFence } from './syncFence'
import { HumbleUser } from './user'

/**
 * What the boot hands `createHumbleServices` (D-05, D-66.3-17). Every member is required at
 * construction: the secret store is the one this boot selected (keyring or dev vault), so no code
 * path can read a placeholder store (Pitfall 2/3).
 */
export interface HumbleServicesDeps {
  stores: Pick<Stores, 'humble' | 'steam'>
  secretStore: HumbleSecretStore
  /** The boot-owned Steam session, for the library's connectivity gate (D-66.3-16). */
  steamUser: Pick<SteamUser, 'isLoggedIn'>
  /** The boot-owned sign-in outcome notes (D-66.3-13). */
  signInOutcomes: ManagerDeps['signIn']['outcomes']
  appInfo: Pick<AppInfo, 'userAgentFallback'>
  sendFrontendMessage: SendFrontendMessage
}

/**
 * The boot's Humble services: one set per boot, passed to every consumer by slice. The user, the
 * library and the registrations share the one sync fence and the one login-window seam slot, so a
 * disconnect invalidates exactly the syncs of this boot and a seam installed at registration is
 * the seam every consumer reads. The library and the dev validation run share the one action-id
 * owner, so a cached server-action id never outlives its boot.
 */
export interface HumbleServices {
  user: HumbleUser
  library: HumbleLibrary
  syncFence: HumbleSyncFence
  loginWindowSeam: LoginWindowSeamSlot
  /** The boot's Humble server-action id owner (66.4-REVIEW CR-01). */
  actionIds: HumbleActionIdCache
  secretStore: HumbleSecretStore
  appInfo: Pick<AppInfo, 'userAgentFallback'>
}

export function createHumbleServices(deps: HumbleServicesDeps): HumbleServices {
  const syncFence = createHumbleSyncFence()
  const loginWindowSeam = createLoginWindowSeamSlot()
  const actionIds = createHumbleActionIdCache()
  const user = new HumbleUser({
    stores: deps.stores,
    secretStore: deps.secretStore,
    loginWindowSeam,
    syncFence,
    signInOutcomes: deps.signInOutcomes,
    appInfo: deps.appInfo,
    sendFrontendMessage: deps.sendFrontendMessage
  })
  const library = createHumbleLibrary({
    stores: deps.stores,
    user,
    syncFence,
    actionIds,
    steamUser: deps.steamUser,
    steamAppIdResolver: createSteamAppIdResolver({
      cache: deps.stores.humble.humbleSteamAppIdStore
    }),
    loginWindowSeam,
    appInfo: deps.appInfo,
    sendFrontendMessage: deps.sendFrontendMessage
  })
  return {
    user,
    library,
    syncFence,
    loginWindowSeam,
    actionIds,
    secretStore: deps.secretStore,
    appInfo: deps.appInfo
  }
}
