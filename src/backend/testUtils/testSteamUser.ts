/**
 * A fresh SteamUser for consumer tests (D-66.3-16), built on fakes: a fake clock, a pass-through Mac
 * Steam go-offline wrap (`not-darwin`, nothing owed), a no-op anonymous client and a fresh sign-in /
 * session state. Pass `overrides` to supply the stores, a scripted wrap or a clock the test asserts
 * on. Two calls never share a client, lease count, wrap tail or guided-install map.
 *
 * The user module is required lazily so importing this fake does not pull the steam-user library
 * into a suite that mocks it.
 */
import type { SteamUser, SteamUserDeps } from '../storeManagers/steam/user'
import { createFakeClock } from './fakeClock'
import { createTestAnonymousClient } from './testAnonymousClient'
import { createTestSteamSession } from './testSteamSession'
import { createTestSignInProbe } from './testSignInProbe'
import { createTestGlobalConfig } from './testConfig'

export type TestSteamUserOverrides = Partial<SteamUserDeps> & {
  stores: SteamUserDeps['stores']
}

function loadUser(): typeof import('../storeManagers/steam/user') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../storeManagers/steam/user') as typeof import('../storeManagers/steam/user')
}

export function createTestSteamUser(
  overrides: TestSteamUserOverrides
): SteamUser {
  const signIn = overrides.signIn ?? createTestSignInProbe()
  return loadUser().createSteamUser({
    stores: overrides.stores,
    macSteamOffline: overrides.macSteamOffline ?? {
      withMacSteamOffline: async (connect) => ({
        value: await connect('not-darwin'),
        wrap: 'not-darwin'
      }),
      restoreMacSteamOnlineIfOwed: () => Promise.resolve('not-darwin')
    },
    signIn,
    steamSession: overrides.steamSession ?? createTestSteamSession(),
    anonymousClient: overrides.anonymousClient ?? createTestAnonymousClient(),
    clock: overrides.clock ?? createFakeClock(),
    config: overrides.config ?? createTestGlobalConfig()
  })
}

const SLICE_METHODS = [
  'acquireAuthenticated',
  'acquireAuthenticatedWithToken',
  'acquireOpenAuthenticated',
  'getClient',
  'getLogonFailure',
  'getPersistedSteamId64',
  'isLoggedIn',
  'isSteamClientInstalled',
  'releaseForShutdown',
  'ensureConnected',
  'logout',
  'getUserDetails',
  'getCredentials',
  'probeCredentialPresence'
] as const satisfies readonly (keyof SteamUser)[]

/**
 * A SteamUser built on the first method call, so a ManagerDeps bundle can carry one without every
 * suite that mocks the user module paying for (or tripping on) the real class.
 */
export function createLazyTestSteamUser(
  overrides: TestSteamUserOverrides
): SteamUser {
  let real: SteamUser | undefined
  const instance = (): SteamUser => (real ??= createTestSteamUser(overrides))
  const out: Record<string, unknown> = {}
  for (const name of SLICE_METHODS) {
    out[name] = (...args: unknown[]) =>
      (instance()[name] as (...a: unknown[]) => unknown)(...args)
  }
  return out as unknown as SteamUser
}
