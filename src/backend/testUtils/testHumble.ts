/**
 * A fresh, isolated set of Humble services for consumer tests (D-66.3-17). Plain objects, no
 * jest APIs. Two calls never share a sync fence, a login-window seam slot, an action-id owner or a secret store.
 *
 * The user and the library pull the adapter, the logger and the IPC layer in; they are built
 * lazily, on first read, so a suite that mocks one of those modules is not broken by merely
 * importing this fake (the `createTestSignInProbe` precedent).
 */
import type { HumbleServices, HumbleServicesDeps } from '../humble'
import { createHumbleSyncFence } from '../humble/syncFence'
import { createLoginWindowSeamSlot } from '../humble/loginWindowSeam'
import { createHumbleActionIdCache } from '../humble/actionIdCache'
import type { HumbleSecretKey, HumbleSecretStore } from '../humble/secretStore'
import { TEST_APP_INFO } from './testContext'
import { createTestSignInProbe } from './testSignInProbe'
import { createInertTestSteamUser } from './testSteamUser'
import type { Stores } from '../services/types'

/** An in-memory secret store: no keyring, no config store. */
function createTestHumbleSecretStore(
  initial: Partial<Record<HumbleSecretKey, string>> = {}
): HumbleSecretStore {
  const secrets: Partial<Record<HumbleSecretKey, string>> = { ...initial }
  return {
    isAvailable: async () => true,
    getSecret: async (key) => secrets[key] ?? '',
    setSecret: async (key, value) => {
      secrets[key] = value
    },
    clearSecrets: async () => {
      delete secrets.sessionCookie
      delete secrets.csrfToken
    }
  }
}

export function createTestHumbleServices(
  opts: Partial<HumbleServicesDeps> & {
    stores: Pick<Stores, 'humble' | 'steam'>
  }
): HumbleServices {
  const syncFence = createHumbleSyncFence()
  const loginWindowSeam = createLoginWindowSeamSlot()
  const actionIds = createHumbleActionIdCache()
  const secretStore = opts.secretStore ?? createTestHumbleSecretStore()
  const appInfo = opts.appInfo ?? TEST_APP_INFO
  const sendFrontendMessage = opts.sendFrontendMessage ?? (() => true)
  // The user and the library share the fence and seam slot this fake hands out.
  let user: HumbleServices['user'] | undefined
  let library: HumbleServices['library'] | undefined
  const build = (): void => {
    if (user && library) return
    const { HumbleUser } = loadHumbleUser()
    const { createHumbleLibrary } = loadHumbleLibrary()
    user = new HumbleUser({
      stores: opts.stores,
      secretStore,
      loginWindowSeam,
      syncFence,
      signInOutcomes: opts.signInOutcomes ?? createTestSignInProbe().outcomes,
      appInfo,
      sendFrontendMessage
    })
    library = createHumbleLibrary({
      stores: opts.stores,
      user,
      syncFence,
      actionIds,
      steamUser: opts.steamUser ?? createInertTestSteamUser(),
      // Inert: no test harness may reach Steam's store search.
      steamAppIdResolver: {
        lookupCached: () => undefined,
        resolvePending: () =>
          Promise.resolve({
            requested: 0,
            resolved: 0,
            cached: 0,
            misses: 0,
            errors: 0,
            deferred: 0
          })
      },
      loginWindowSeam,
      appInfo,
      sendFrontendMessage
    })
  }
  return {
    get user() {
      build()
      return user as HumbleServices['user']
    },
    get library() {
      build()
      return library as HumbleServices['library']
    },
    syncFence,
    loginWindowSeam,
    actionIds,
    secretStore,
    appInfo
  }
}

function loadHumbleUser(): typeof import('../humble/user') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../humble/user') as typeof import('../humble/user')
}

function loadHumbleLibrary(): typeof import('../humble/library') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../humble/library') as typeof import('../humble/library')
}
