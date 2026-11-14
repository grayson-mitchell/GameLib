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
import type { SteamCmClient } from '../storeManagers/steam/cm/SteamCmClient'
import { createFakeClock } from './fakeClock'
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
    macSteamOffline: overrides.macSteamOffline ?? {
      withMacSteamOffline: async (connect) => ({
        value: await connect('not-darwin'),
        wrap: 'not-darwin'
      }),
      restoreMacSteamOnlineIfOwed: () => Promise.resolve('not-darwin')
    },
    signIn,
    steamSession: overrides.steamSession ?? createTestSteamSession(),
    tokenStore: overrides.tokenStore ?? createTestTokenStoreSlot(),
    anonymousClient: overrides.anonymousClient ?? createTestAnonymousClient(),
    clock: overrides.clock ?? createFakeClock(),
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
    releaseForShutdown: () => Promise.resolve('not-owed')
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

/**
 * A scripted SteamCmClient double (79-23). Annotated with the narrow interface so every test
 * double is checked against it at compile time: it fits a steam-user lease and a Rust lease alike.
 * Every call rejects (or never calls back) unless the test overrides it.
 */
export function createTestSteamCmClient(
  overrides: Partial<SteamCmClient> = {}
): SteamCmClient {
  const unscripted = (name: string) =>
    Promise.reject(new Error(`${name} is not scripted in this test`))
  const base: SteamCmClient = {
    steamID: null,
    licenses: [],
    getProductInfo: () => unscripted('getProductInfo'),
    getDepotDecryptionKey: (_a, _d, cb) =>
      cb(new Error('getDepotDecryptionKey is not scripted'), Buffer.alloc(0)),
    getContentServers: (_a, cb) =>
      cb(new Error('getContentServers is not scripted'), []),
    getManifestRequestCode: () => unscripted('getManifestRequestCode'),
    getUserOwnedApps: () => unscripted('getUserOwnedApps'),
    getPersonas: () => unscripted('getPersonas'),
    redeemKey: () => unscripted('redeemKey')
  }
  return { ...base, ...overrides }
}
