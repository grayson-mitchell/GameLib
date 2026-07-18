// Debug/steam-install-slow-start (cycle 6): unit tests for the CDN auth token
// cache (depot/cdnAuth.ts) — the highest-leverage fix this cycle implements.
//
// See the module's own doc comment for the root-cause writeup: fetchChunk
// built chunk URLs with NO auth token, and the cycle-5 hardware run
// correlated failures EXACTLY with content-server `type` — the type=CDN
// global edges (which REQUIRE a token) failed ~100%, while the type=SteamCache
// locals (token-less) worked.

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { logInfo, logWarning } from 'backend/logger'
import {
  CdnAuthTokenCache,
  PROACTIVE_REFRESH_BUFFER_MS,
  type CDNAuthTokenClient
} from '../depot/cdnAuth'

/** Builds a fake steam-user-shaped client whose getCDNAuthToken resolves
 *  deterministically, and records every call it received. */
function makeFakeClient(
  impl?: (
    appId: number,
    depotId: number,
    hostname: string
  ) => { token: string; expires: Date } | Error
) {
  const calls: Array<{ appId: number; depotId: number; hostname: string }> = []
  const client: CDNAuthTokenClient = {
    getCDNAuthToken: jest.fn((appId, depotId, hostname, callback) => {
      calls.push({ appId, depotId, hostname })
      const result = impl
        ? impl(appId, depotId, hostname)
        : { token: '?default-token', expires: new Date(Date.now() + 60 * 60 * 1000) }
      if (result instanceof Error) {
        callback(result)
      } else {
        callback(null, result)
      }
    })
  }
  return { client, calls }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('CdnAuthTokenCache', () => {
  it('cache miss: fetches a token via client.getCDNAuthToken with the exact appId/depotId/hostname', async () => {
    const { client, calls } = makeFakeClient()
    const cache = new CdnAuthTokenCache(client, 1091500)

    const token = await cache.getToken('12345', 'cache1-akl-tpwr.steamcontent.com')

    expect(token).toBe('?default-token')
    expect(calls).toEqual([
      { appId: 1091500, depotId: 12345, hostname: 'cache1-akl-tpwr.steamcontent.com' }
    ])
  })

  it('cache hit: a second call for the SAME depot+host within the proactive-refresh window reuses the cached token — no second network call', async () => {
    const { client, calls } = makeFakeClient()
    const cache = new CdnAuthTokenCache(client, 1091500)

    const first = await cache.getToken('12345', 'host-a')
    const second = await cache.getToken('12345', 'host-a')

    expect(first).toBe('?default-token')
    expect(second).toBe('?default-token')
    expect(calls).toHaveLength(1)
  })

  it('a different HOST for the same depot is cached independently — not conflated with a different depot+host key', async () => {
    const { client, calls } = makeFakeClient((appId, depotId, hostname) => ({
      token: `?token-for-${hostname}`,
      expires: new Date(Date.now() + 60 * 60 * 1000)
    }))
    const cache = new CdnAuthTokenCache(client, 1091500)

    const tokenA = await cache.getToken('12345', 'host-a')
    const tokenB = await cache.getToken('12345', 'host-b')
    // Re-fetching host-a must still hit the cache, not host-b's entry.
    const tokenAAgain = await cache.getToken('12345', 'host-a')

    expect(tokenA).toBe('?token-for-host-a')
    expect(tokenB).toBe('?token-for-host-b')
    expect(tokenAAgain).toBe('?token-for-host-a')
    expect(calls).toHaveLength(2)
  })

  it('expiry: a cached token within PROACTIVE_REFRESH_BUFFER_MS of expiring is treated as stale and re-fetched', async () => {
    jest.useFakeTimers()
    try {
      let call = 0
      const { client, calls } = makeFakeClient(() => {
        call++
        // First response expires very soon (well inside the proactive buffer);
        // second response is healthy for a full hour.
        return {
          token: `?token-${call}`,
          expires:
            call === 1
              ? new Date(Date.now() + PROACTIVE_REFRESH_BUFFER_MS / 2)
              : new Date(Date.now() + 60 * 60 * 1000)
        }
      })
      const cache = new CdnAuthTokenCache(client, 1091500)

      const first = await cache.getToken('12345', 'host-a')
      expect(first).toBe('?token-1')

      // Advance past the point where the cached token is within the proactive
      // refresh buffer of its (already-soon) expiry.
      jest.advanceTimersByTime(1)

      const second = await cache.getToken('12345', 'host-a')
      expect(second).toBe('?token-2')
      expect(calls).toHaveLength(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('refresh: after PROACTIVE_REFRESH_BUFFER_MS-adjusted expiry, a THIRD call still reuses the freshly-refreshed token rather than refetching again', async () => {
    let call = 0
    const { client, calls } = makeFakeClient(() => {
      call++
      return { token: `?token-${call}`, expires: new Date(Date.now() + 60 * 60 * 1000) }
    })
    const cache = new CdnAuthTokenCache(client, 1091500)

    await cache.getToken('12345', 'host-a')
    await cache.getToken('12345', 'host-a')
    const third = await cache.getToken('12345', 'host-a')

    expect(third).toBe('?token-1')
    expect(calls).toHaveLength(1)
  })

  it('concurrent callers for the SAME depot+host are coalesced onto a single in-flight fetch — never N redundant CM round-trips', async () => {
    let resolveFetch: (v: { token: string; expires: Date }) => void = () => {}
    const client: CDNAuthTokenClient = {
      getCDNAuthToken: jest.fn((_appId, _depotId, _hostname, callback) => {
        // Deliberately never resolves synchronously — simulates a real
        // in-flight CM round-trip that many concurrent chunk-fetch workers
        // could race against.
        resolveFetch = (v) => callback(null, v)
      })
    }
    const cache = new CdnAuthTokenCache(client, 1091500)

    const p1 = cache.getToken('12345', 'host-a')
    const p2 = cache.getToken('12345', 'host-a')
    const p3 = cache.getToken('12345', 'host-a')

    expect(client.getCDNAuthToken).toHaveBeenCalledTimes(1)

    resolveFetch({ token: '?shared-token', expires: new Date(Date.now() + 60 * 60 * 1000) })

    await expect(p1).resolves.toBe('?shared-token')
    await expect(p2).resolves.toBe('?shared-token')
    await expect(p3).resolves.toBe('?shared-token')
    expect(client.getCDNAuthToken).toHaveBeenCalledTimes(1)
  })

  it('fetch failure: getToken NEVER throws — resolves to "" so the caller degrades to a token-less request', async () => {
    const { client } = makeFakeClient(() => new Error('ClientGetCDNAuthToken failed: eresult 5'))
    const cache = new CdnAuthTokenCache(client, 1091500)

    const token = await cache.getToken('12345', 'host-a')

    expect(token).toBe('')
    expect(logWarning).toHaveBeenCalled()
  })

  it('fetch failure is not cached — a subsequent getToken call retries the fetch, not just returns the same empty string forever', async () => {
    let call = 0
    const { client, calls } = makeFakeClient(() => {
      call++
      if (call === 1) return new Error('transient CM hiccup')
      return { token: '?recovered-token', expires: new Date(Date.now() + 60 * 60 * 1000) }
    })
    const cache = new CdnAuthTokenCache(client, 1091500)

    const first = await cache.getToken('12345', 'host-a')
    const second = await cache.getToken('12345', 'host-a')

    expect(first).toBe('')
    expect(second).toBe('?recovered-token')
    expect(calls).toHaveLength(2)
  })

  it('invalidate: clears the cached token for that exact depot+host so the NEXT getToken call re-fetches', async () => {
    let call = 0
    const { client, calls } = makeFakeClient(() => {
      call++
      return { token: `?token-${call}`, expires: new Date(Date.now() + 60 * 60 * 1000) }
    })
    const cache = new CdnAuthTokenCache(client, 1091500)

    const first = await cache.getToken('12345', 'host-a')
    expect(first).toBe('?token-1')

    cache.invalidate('12345', 'host-a')

    const second = await cache.getToken('12345', 'host-a')
    expect(second).toBe('?token-2')
    expect(calls).toHaveLength(2)
  })

  it('invalidate on one depot+host never affects a DIFFERENT depot+host\'s still-valid cached token', async () => {
    const { client, calls } = makeFakeClient((_appId, depotId, hostname) => ({
      token: `?token-${depotId}-${hostname}`,
      expires: new Date(Date.now() + 60 * 60 * 1000)
    }))
    const cache = new CdnAuthTokenCache(client, 1091500)

    await cache.getToken('12345', 'host-a')
    await cache.getToken('99999', 'host-a')

    cache.invalidate('12345', 'host-a')

    const untouched = await cache.getToken('99999', 'host-a')
    expect(untouched).toBe('?token-99999-host-a')
    expect(calls).toHaveLength(2) // no re-fetch for the untouched depot+host
  })

  it('invalidate on a never-fetched depot+host is a harmless no-op', () => {
    const { client } = makeFakeClient()
    const cache = new CdnAuthTokenCache(client, 1091500)
    expect(() => cache.invalidate('99999', 'never-fetched-host')).not.toThrow()
  })

  it('SECURITY: the token value is NEVER present in any logInfo/logWarning call — only length/expiry/host are logged', async () => {
    const secretToken = '?SUPER_SECRET_SESSION_TOKEN_DO_NOT_LEAK_abc123'
    const { client } = makeFakeClient(() => ({
      token: secretToken,
      expires: new Date(Date.now() + 60 * 60 * 1000)
    }))
    const cache = new CdnAuthTokenCache(client, 1091500)

    await cache.getToken('12345', 'host-a')

    const allLoggedText = [
      ...(logInfo as jest.Mock).mock.calls,
      ...(logWarning as jest.Mock).mock.calls
    ]
      .map((args) => JSON.stringify(args))
      .join('\n')

    expect(allLoggedText).not.toContain(secretToken)
    expect(logInfo).toHaveBeenCalled()
    const loggedMessage = String((logInfo as jest.Mock).mock.calls[0][0])
    expect(loggedMessage).toContain('tokenLen=')
    expect(loggedMessage).toContain('expiresInMs=')
    expect(loggedMessage).toContain('host-a')
  })

  it('SECURITY: a fetch-failure warning never includes any token-shaped secret content — only the depot/host and error', async () => {
    const { client } = makeFakeClient(() => new Error('eresult AccessDenied'))
    const cache = new CdnAuthTokenCache(client, 1091500)

    await cache.getToken('12345', 'host-a')

    expect(logWarning).toHaveBeenCalled()
    const [messageParts] = (logWarning as jest.Mock).mock.calls[0]
    const text = Array.isArray(messageParts) ? messageParts.join(' ') : String(messageParts)
    expect(text).toContain('12345')
    expect(text).toContain('host-a')
  })
})
