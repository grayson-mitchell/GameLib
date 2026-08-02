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
// A plain `jest.fn(() => true)` default here does NOT survive: this suite's
// jest.config.js sets `resetMocks: true`, which wipes any implementation
// configured at factory time before the FIRST test even runs. The
// implementation is (re)installed in `beforeEach` below instead.
const mockConfigStoreGetNodefault = jest.fn()
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: {
    set: mockConfigStoreSet,
    get_nodefault: mockConfigStoreGetNodefault
  }
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogdlAuthConfig: '/fake/gog_store/auth.json'
}))

jest.mock('backend/utils', () => ({
  clearCache: jest.fn()
}))

import axios from 'axios'
import { GOGUser } from '../user'

const mockedAxiosGet = axios.get as jest.Mock

function stdoutFor(payload: Record<string, unknown>) {
  return { stdout: JSON.stringify(payload) }
}

describe('debug/manage-accounts-slow-update -- GOGUser.login redundant gogdl call', () => {
  beforeEach(() => {
    // `isLoggedIn()` reads this -- always answer true, both call paths in
    // these tests are past the "just authenticated" point.
    mockConfigStoreGetNodefault.mockReturnValue(true)
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

    // The userData.json fetch must use the SAME token the --code exchange
    // returned, proving it was reused rather than silently dropped.
    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://embed.gog.com/userData.json',
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
      'https://embed.gog.com/userData.json',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer refreshed-token-from-disk'
        })
      })
    )
  })
})
