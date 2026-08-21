/**
 * Regression coverage for debug/manage-accounts-slow-update.md.
 *
 * `GOGUser.login()` used to call `getUserDetails()` with no arguments, which
 * unconditionally called `getCredentials()` -- spawning a SECOND `gogdl auth`
 * subprocess (via `runRunnerCommand`) purely to re-derive an access_token the
 * `login()` call's own `gogdl auth --code` invocation already had in its parsed
 * stdout. Measured live: that redundant call cost ~5s on the critical path
 * between the OAuth window closing and the frontend's in-progress screen
 * clearing.
 *
 * These tests pin the fix (`login()` now passes its already-known access_token
 * through, skipping the redundant `runRunnerCommand` call) while proving the
 * OTHER caller of `getUserDetails()` -- the boot-time revalidation at
 * `main.ts:445-460`, which has no fresh token in hand -- keeps its original
 * disk-read/refresh behavior unchanged.
 */

const mockRunRunnerCommand = jest.fn()

jest.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' }
}))

jest.mock('axios')

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Gog: 'Gog' }
}))

jest.mock('backend/online_monitor', () => ({
  isOnline: () => true
}))

jest.mock('backend/storeManagers/index', () => ({
  libraryManagerMap: {
    gog: { runRunnerCommand: mockRunRunnerCommand }
  }
}))

const mockConfigStoreSet = jest.fn()
const mockConfigStoreClear = jest.fn()
// A plain `jest.fn(() => true)` default here does NOT survive: this suite's
// jest.config.js sets `resetMocks: true`, which wipes any implementation
// configured at factory time before the FIRST test even runs. The
// implementation is (re)installed in `beforeEach` below instead.
//
// Key-aware rather than a blanket `mockReturnValue(true)`: the D-3 drift
// guard added in quick-260821-o34 also reads `get_nodefault('userData')`,
// and a boolean `true` there would satisfy `previous?.galaxyUserId` type-wise
// at the mock boundary but misrepresent every test's starting state as "a
// previous userData record already exists". Tests that need to exercise the
// drift guard override this per-test.
const mockConfigStoreGetNodefault = jest.fn((key: string): unknown =>
  key === 'isLoggedIn' ? true : undefined
)
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: {
    set: mockConfigStoreSet,
    get_nodefault: mockConfigStoreGetNodefault,
    clear: mockConfigStoreClear
  }
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogdlAuthConfig: '/fake/gog_store/auth.json'
}))

jest.mock('backend/utils', () => ({
  clearCache: jest.fn()
}))

import axios from 'axios'
import { logWarning } from 'backend/logger'
import { GOGUser } from '../user'

const mockedAxiosGet = axios.get as jest.Mock
const mockedLogWarning = logWarning as jest.Mock

function stdoutFor(payload: Record<string, unknown>) {
  return { stdout: JSON.stringify(payload) }
}

describe('debug/manage-accounts-slow-update -- GOGUser.login redundant gogdl call', () => {
  beforeEach(() => {
    // Key-aware: 'isLoggedIn' -> true (both call paths in these tests are past
    // the "just authenticated" point); everything else (including the D-3 drift
    // guard's 'userData' read) -> undefined, i.e. no previously stored record.
    mockConfigStoreGetNodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    // `getCredentials()`'s TTL cache (debug/gog-spawn-reduction.md fix 1) is a
    // module-level singleton that outlives any individual test -- reset it so each
    // test's own scripted `mockRunRunnerCommand` result is actually exercised, never
    // shadowed by an earlier test's cached token.
    GOGUser.__resetCredentialsCacheForTests()
  })

  it('login() does NOT spawn a second gogdl auth subprocess -- reuses the access_token the --code exchange already returned', async () => {
    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'fresh-token-from-code-exchange',
        refresh_token: 'r1',
        user_id: 'u1',
        expires_in: 3600,
        loginTime: Date.now()
      })
    )
    mockedAxiosGet.mockResolvedValueOnce({
      data: { username: 'testuser', email: 'x@example.com' }
    })

    const result = await GOGUser.login('the-oauth-code')

    expect(result.status).toBe('done')
    expect(result.data?.username).toBe('testuser')

    // THE regression this test exists to catch: only ONE gogdl subprocess
    // invocation for the whole login, not two.
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
    expect(mockRunRunnerCommand).toHaveBeenCalledWith(
      ['auth', '--code', 'the-oauth-code'],
      expect.anything()
    )

    // The api.gog.com/users/{user_id} fetch must use the SAME token the --code
    // exchange returned, and be keyed by the SAME scripted user_id ('u1'),
    // proving both were threaded through rather than silently dropped or
    // re-derived via a redundant getCredentials() call.
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://api.gog.com/users/u1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token-from-code-exchange'
        })
      })
    )
  })

  it('getUserDetails() called with NO token (the boot-time revalidation path) still refreshes credentials via gogdl -- unchanged', async () => {
    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'refreshed-token-from-disk',
        refresh_token: 'r2',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'read',
        session_id: 's1',
        user_id: 'u2',
        loginType: 1
      })
    )
    mockedAxiosGet.mockResolvedValueOnce({
      data: { username: 'bootuser', email: 'y@example.com' }
    })

    const data = await GOGUser.getUserDetails()

    expect(data?.username).toBe('bootuser')

    // The boot path has no fresh token, so it MUST still call getCredentials(),
    // which spawns exactly one `gogdl auth` (no --code) subprocess.
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
    expect(mockRunRunnerCommand).toHaveBeenCalledWith(
      ['auth'],
      expect.anything()
    )
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://api.gog.com/users/u2',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer refreshed-token-from-disk'
        })
      })
    )
  })
})

/**
 * Regression coverage for debug/gog-spawn-reduction.md fix 5.
 *
 * `login()`'s own `gogdl auth --code` exchange returns a fresh token, but the fix-1 TTL
 * cache stayed empty until the NEXT getCredentials() call (e.g. the post-login library
 * refresh), which then spawned its own redundant `gogdl auth` on a cold cache. This test
 * pins the fix: login() now seeds the same cache directly from its own stdout, so a
 * getCredentials() call immediately after a successful login() is served from cache with
 * zero additional gogdl subprocess spawns.
 */
describe('debug/gog-spawn-reduction fix 5 -- login() seeds the getCredentials() TTL cache', () => {
  beforeEach(() => {
    // Key-aware: 'isLoggedIn' -> true (both call paths in these tests are past
    // the "just authenticated" point); everything else (including the D-3 drift
    // guard's 'userData' read) -> undefined, i.e. no previously stored record.
    mockConfigStoreGetNodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    GOGUser.__resetCredentialsCacheForTests()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('getCredentials() called right after login() does NOT spawn a second gogdl auth subprocess', async () => {
    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'login-seeded-token',
        refresh_token: 'r1',
        user_id: 'u1',
        expires_in: 3600,
        loginTime: Date.now()
      })
    )
    mockedAxiosGet.mockResolvedValueOnce({
      data: { username: 'testuser', email: 'x@example.com' }
    })

    const loginResult = await GOGUser.login('the-oauth-code')
    expect(loginResult.status).toBe('done')

    // login()'s own `gogdl auth --code` call is the only subprocess spawn so far.
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)

    const credentials = await GOGUser.getCredentials()

    expect(credentials?.access_token).toBe('login-seeded-token')
    expect(credentials?.user_id).toBe('u1')
    // THE regression this test exists to catch: getCredentials() right after login()
    // must be served from the cache login() seeded, not spawn a second `gogdl auth`.
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
  })

  it('getCredentials() spawns gogdl again once the login()-seeded token has passed its expires_in window', async () => {
    const nowSpy = jest.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000_000)

    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'login-seeded-token',
        refresh_token: 'r1',
        user_id: 'u1',
        expires_in: 60,
        loginTime: 1_000_000
      })
    )
    mockedAxiosGet.mockResolvedValueOnce({
      data: { username: 'testuser', email: 'x@example.com' }
    })

    await GOGUser.login('the-oauth-code')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)

    // Advance past expires_in (60s) + the 60s safety margin.
    nowSpy.mockReturnValue(1_000_000 + 121_000)

    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'refreshed-token',
        refresh_token: 'r2',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'read',
        session_id: 's2',
        user_id: 'u1',
        loginType: 1
      })
    )
    const credentials = await GOGUser.getCredentials()

    expect(credentials?.access_token).toBe('refreshed-token')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(2)
  })
})

/**
 * Regression coverage for debug/gog-spawn-reduction.md fix 1.
 *
 * `GOGUser.getCredentials()` had zero caching across its 15 call sites (login/boot/
 * library-refresh/presence/playtime/etc.), so every call spawned its own `gogdl auth`
 * subprocess -- each carrying the ~5-13s OS-level tax documented in
 * resolved/gogdl-spawn-tax.md. These tests pin the fix: a TTL cache keyed on the token's
 * own `expires_in`, cleared by logout() and by natural expiry.
 */
describe('debug/gog-spawn-reduction fix 1 -- GOGUser.getCredentials() TTL cache', () => {
  beforeEach(() => {
    // Key-aware: 'isLoggedIn' -> true (both call paths in these tests are past
    // the "just authenticated" point); everything else (including the D-3 drift
    // guard's 'userData' read) -> undefined, i.e. no previously stored record.
    mockConfigStoreGetNodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    GOGUser.__resetCredentialsCacheForTests()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not spawn a second gogdl auth subprocess while the cached token is still within its expires_in window', async () => {
    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'cached-token',
        refresh_token: 'r1',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'read',
        session_id: 's1',
        user_id: 'u1',
        loginType: 1
      })
    )

    const first = await GOGUser.getCredentials()
    const second = await GOGUser.getCredentials()

    expect(first?.access_token).toBe('cached-token')
    expect(second?.access_token).toBe('cached-token')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(1)
  })

  it('spawns a fresh gogdl auth subprocess once the cached token has passed its expires_in window (minus the safety margin)', async () => {
    const nowSpy = jest.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000_000)

    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'first-token',
        refresh_token: 'r1',
        expires_in: 60,
        token_type: 'bearer',
        scope: 'read',
        session_id: 's1',
        user_id: 'u1',
        loginType: 1
      })
    )
    const first = await GOGUser.getCredentials()
    expect(first?.access_token).toBe('first-token')

    // Advance past expires_in (60s) + the 60s safety margin.
    nowSpy.mockReturnValue(1_000_000 + 121_000)

    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'second-token',
        refresh_token: 'r2',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'read',
        session_id: 's2',
        user_id: 'u1',
        loginType: 1
      })
    )
    const second = await GOGUser.getCredentials()

    expect(second?.access_token).toBe('second-token')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(2)
  })

  it('logout() clears the cached credentials so the next getCredentials() call spawns gogdl again', async () => {
    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'pre-logout-token',
        refresh_token: 'r1',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'read',
        session_id: 's1',
        user_id: 'u1',
        loginType: 1
      })
    )
    await GOGUser.getCredentials()

    GOGUser.logout()

    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'post-logout-token',
        refresh_token: 'r2',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'read',
        session_id: 's2',
        user_id: 'u2',
        loginType: 1
      })
    )
    const afterLogout = await GOGUser.getCredentials()

    expect(afterLogout?.access_token).toBe('post-logout-token')
    expect(mockRunRunnerCommand).toHaveBeenCalledTimes(2)
  })
})

/**
 * Regression coverage for quick-260821-o34.
 *
 * `GOGUser.getUserDetails()` used to fetch a GOG "embed" endpoint that embeds
 * the account's entire wishlist/friends/checksum payload. For accounts with a
 * large wishlist, GOG returns an error instead of a truncated document, so
 * `getUserDetails()` returned `undefined`, `configStore.userData`
 * was never written, and the user appeared logged out even though auth actually
 * succeeded. These tests pin the fix: `getUserDetails()` now fetches the small,
 * fixed-size `https://api.gog.com/users/{user_id}` document instead, and the
 * persisted record is an explicit `{userId, username, galaxyUserId}` projection
 * rather than a passthrough of the response body.
 */
describe('quick-260821-o34 -- getUserDetails() repointed at api.gog.com/users/{user_id}', () => {
  beforeEach(() => {
    mockConfigStoreGetNodefault.mockImplementation((key: string) =>
      key === 'isLoggedIn' ? true : undefined
    )
    GOGUser.__resetCredentialsCacheForTests()
  })

  it('persists username + galaxyUserId + userId from a wishlist-free response body (the headline regression)', async () => {
    mockRunRunnerCommand.mockResolvedValueOnce(
      stdoutFor({
        access_token: 'tok',
        refresh_token: 'r1',
        user_id: 'galaxy-1',
        expires_in: 3600,
        loginTime: Date.now()
      })
    )
    // The small, fixed-size api.gog.com/users/{id} document -- no wishlist,
    // friends, checksum or updates payload, unlike the old embed.gog.com/
    // userData.json endpoint this replaces.
    mockedAxiosGet.mockResolvedValueOnce({
      data: {
        id: 'galaxy-1',
        username: 'bigwishlist',
        created_date: '2015-01-01',
        avatar: { small: 'x' }
      }
    })

    const result = await GOGUser.login('the-oauth-code')

    expect(result.status).toBe('done')
    expect(result.data?.username).toBe('bigwishlist')

    expect(mockConfigStoreSet).toHaveBeenCalledWith(
      'userData',
      expect.objectContaining({
        username: 'bigwishlist',
        galaxyUserId: 'galaxy-1',
        userId: 'galaxy-1'
      })
    )
    const [, storedUserData] = mockConfigStoreSet.mock.calls.find(
      ([key]) => key === 'userData'
    ) as [string, Record<string, unknown>]
    expect(storedUserData).not.toHaveProperty('email')
  })

  it('persists nothing when user_id is missing from credentials', async () => {
    const data = await GOGUser.getUserDetails({
      access_token: 'tok'
    } as never)

    expect(data).toBeUndefined()
    expect(mockedAxiosGet).not.toHaveBeenCalled()
    expect(mockConfigStoreSet).not.toHaveBeenCalledWith(
      'userData',
      expect.anything()
    )
  })

  it('persists nothing when the response body carries no username', async () => {
    mockedAxiosGet.mockResolvedValueOnce({
      data: { id: 'galaxy-1' }
    })

    const data = await GOGUser.getUserDetails({
      access_token: 'tok',
      user_id: 'galaxy-1'
    })

    expect(data).toBeUndefined()
    expect(mockConfigStoreSet).not.toHaveBeenCalledWith(
      'userData',
      expect.anything()
    )
  })

  it('logs a warning naming both ids when the derived galaxyUserId drifts from a previously stored one, but still writes the new record', async () => {
    mockConfigStoreGetNodefault.mockImplementation((key: string) => {
      if (key === 'isLoggedIn') return true
      if (key === 'userData') return { galaxyUserId: 'old-galaxy' }
      return undefined
    })
    mockedAxiosGet.mockResolvedValueOnce({
      data: { id: 'galaxy-1', username: 'testuser' }
    })

    const data = await GOGUser.getUserDetails({
      access_token: 'tok',
      user_id: 'galaxy-1'
    })

    expect(data?.galaxyUserId).toBe('galaxy-1')
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('old-galaxy'),
      expect.anything()
    )
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('galaxy-1'),
      expect.anything()
    )
    expect(mockConfigStoreSet).toHaveBeenCalledWith(
      'userData',
      expect.objectContaining({ galaxyUserId: 'galaxy-1' })
    )
  })
})
