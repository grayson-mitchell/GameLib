/**
 * Phase 54 (54-05) test helpers for suites that auto-mock '../user'.
 * The depot path acquires an authenticated lease instead of calling
 * ensureConnected(); these helpers script the lease the way the old tests
 * scripted ensureConnected()'s boolean. The lease's client is read lazily
 * from SteamUser.getClient(), so a test may set the client before or after.
 */
import { SteamUser } from '../user'

/** acquireAuthenticated resolves a granted lease; returns the release spy. */
export function mockLeaseOk(onAcquire?: () => void): jest.Mock {
  const release = jest.fn()
  jest.mocked(SteamUser.acquireAuthenticated).mockImplementation(async () => {
    onAcquire?.()
    return {
      ok: true,
      client: SteamUser.getClient() as never,
      release
    }
  })
  return release
}

/** acquireAuthenticated refuses (no lease, no client). */
export function mockLeaseRefused(
  reason: 'logon-rejected' | 'go-offline-required' = 'logon-rejected'
): void {
  jest
    .mocked(SteamUser.acquireAuthenticated)
    .mockResolvedValue({ ok: false, reason } as never)
}

/** acquireOpenAuthenticated returns an open-session lease; returns the release spy. */
export function mockOpenLease(): jest.Mock {
  const release = jest.fn()
  jest.mocked(SteamUser.acquireOpenAuthenticated).mockReturnValue({
    client: SteamUser.getClient() as never,
    release
  })
  return release
}
