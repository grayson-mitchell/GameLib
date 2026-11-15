/**
 * A fresh SteamUser for consumer tests (D-66.3-16), built on fakes: a no-op anonymous client, a
 * fresh sign-in / session state and a rustInvoke that rejects unless the test supplies one (the Rust
 * CM session is the only engine). Pass `overrides` to supply the stores or a scripted rustInvoke.
 * Two calls never share a session, lease or guided-install map.
 *
 * The user module is required lazily so a suite that mocks it is not forced to load it.
 */
import type { SteamUser, SteamUserDeps } from '../storeManagers/steam/user'
import { createTestAnonymousClient } from './testAnonymousClient'
import { createTestSteamSession } from './testSteamSession'
import { createTestTokenStoreSlot } from './testTokenStore'
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
    signIn,
    steamSession: overrides.steamSession ?? createTestSteamSession(),
    tokenStore: overrides.tokenStore ?? createTestTokenStoreSlot(),
    anonymousClient: overrides.anonymousClient ?? createTestAnonymousClient(),
    config: overrides.config ?? createTestGlobalConfig(),
    sendFrontendMessage: overrides.sendFrontendMessage ?? (() => true),
    rustInvoke: overrides.rustInvoke ?? {
      requestRustInvoke: () =>
        Promise.reject(new Error('rustInvoke is not wired in this test'))
    }
  })
}

/**
 * An inert SteamUser for ManagerDeps bundles that never exercise the session: signed out, no
 * client, every acquire refused, nothing owed at shutdown. Plain object, no jest APIs, no steam-user
 * library (the user module is not loaded). A suite that scripts the session builds its own with
 * `createTestSteamUser` or a jest-fn double.
 */
export function createInertTestSteamUser(
  overrides: Partial<Record<keyof SteamUser, unknown>> = {}
): SteamUser {
  const inert: Record<keyof SteamUser, unknown> = {
    isSteamClientInstalled: () => false,
    isLoggedIn: () => false,
    probeCredentialPresence: () => Promise.resolve('unknown'),
    getClient: () => null,
    getLogonFailure: () => null,
    ensureConnected: () => Promise.resolve(false),
    acquireAuthenticated: () =>
      Promise.resolve({ ok: false, reason: 'client-not-ready' }),
    acquireAuthenticatedWithToken: () =>
      Promise.resolve({ ok: false, reason: 'client-not-ready' }),
    acquireOpenAuthenticated: () => Promise.resolve(null),
    getPersistedSteamId64: () => undefined,
    logout: () => Promise.resolve(),
    getUserDetails: () => Promise.resolve(undefined),
    getCredentials: () => Promise.resolve(undefined),
    releaseForShutdown: () => Promise.resolve()
  }
  return { ...inert, ...overrides } as unknown as SteamUser
}

/**
 * The inert SteamUser with every member a jest.fn, defaulting to the inert behaviour, for suites
 * that script or assert on the session (`jest.mocked(steamUser.getClient).mockReturnValue(...)`).
 * Jest-only: import it from a test file, never from production code. Two calls share nothing.
 */
export function createMockSteamUser(
  overrides: Partial<Record<keyof SteamUser, unknown>> = {}
): jest.Mocked<SteamUser> {
  const inert = createInertTestSteamUser(overrides) as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >
  const mocked: Record<string, jest.Mock> = {}
  for (const name of Object.keys(inert)) {
    mocked[name] = jest.fn(inert[name])
  }
  return mocked as unknown as jest.Mocked<SteamUser>
}
