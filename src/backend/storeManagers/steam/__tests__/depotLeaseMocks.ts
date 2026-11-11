/**
 * Phase 54 (54-05) test helpers for suites that drive the depot path through a mocked SteamUser.
 * The depot path acquires an authenticated lease instead of calling ensureConnected(); these
 * helpers script the lease the way the old tests scripted ensureConnected()'s boolean. The lease's
 * client is read lazily from steamUser.getClient(), so a test may set the client before or after.
 * 66.3-16: the SteamUser is a per-test jest-fn double passed in, not a module-level static.
 */
import type { SteamUser } from '../user'

type MockSteamUser = jest.Mocked<SteamUser>

/** acquireAuthenticated resolves a granted lease; returns the release spy. */
export function mockLeaseOk(
  steamUser: MockSteamUser,
  onAcquire?: () => void
): jest.Mock {
  const release = jest.fn()
  steamUser.acquireAuthenticated.mockImplementation(async () => {
    onAcquire?.()
    return {
      ok: true,
      client: steamUser.getClient() as never,
      release
    }
  })
  return release
}

/** acquireAuthenticated refuses (no lease, no client). */
export function mockLeaseRefused(
  steamUser: MockSteamUser,
  reason: 'logon-rejected' | 'go-offline-required' = 'logon-rejected'
): void {
  steamUser.acquireAuthenticated.mockResolvedValue({
    ok: false,
    reason
  } as never)
}

/** acquireOpenAuthenticated returns an open-session lease; returns the release spy. */
export function mockOpenLease(steamUser: MockSteamUser): jest.Mock {
  const release = jest.fn()
  steamUser.acquireOpenAuthenticated.mockReturnValue({
    client: steamUser.getClient() as never,
    release
  })
  return release
}
