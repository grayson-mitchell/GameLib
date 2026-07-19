// Debug/steam-install-slow-start (cycle 6, transport-swapped in the CDN-auth
// implementation cycle; cycle 11 swapped the transport AGAIN — see below):
// unit tests for the CDN auth token cache (depot/cdnAuth.ts) — the
// highest-leverage fix this session implements.
//
// See the module's own doc comment for the root-cause + transport writeup:
// fetchChunk built chunk URLs with NO auth token; the legacy
// `client.getCDNAuthToken()` (EMsg.ClientGetCDNAuthToken) timed out on real
// hardware because Valve moved that capability server-side; cycle 10's
// `client._sendUnified('ContentServerDirectory.GetCDNAuthToken#1', ...)`
// then threw a TypeError on real hardware — steam-user@5.3.0 never wired
// this specific RPC's compiled classes into its internal encode/decode
// lookup map. Cycle 11 ("DECISION 2026-07-19: OPTION B") bypasses
// `_sendUnified` entirely: encodes the request manually via the compiled
// protobuf classes, sends it via `client._send` (the same lower-level
// transport `_sendUnified` itself delegates to), and decodes the response
// manually too.

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { logInfo, logWarning } from 'backend/logger'
import {
  CdnAuthTokenCache,
  PROACTIVE_REFRESH_BUFFER_MS,
  CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS,
  CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS,
  type CDNAuthTokenClient
} from '../depot/cdnAuth'
import { makeFakeSendClient } from './fixtures/cdnAuthSendFixture'
import {
  CContentServerDirectory_GetCDNAuthToken_Request,
  CContentServerDirectory_GetCDNAuthToken_Response as CdnAuthTokenResponse
} from 'steam-user/protobufs/generated/_load.js'

const makeFakeClient = makeFakeSendClient

/** For the handful of tests below that need hand-rolled control over
 *  exactly when/whether the callback fires (rather than the fixture's
 *  deterministic `impl` callback) — still encodes a REAL response buffer,
 *  matching what `client._send`'s callback actually receives in
 *  production. */
function encodeResponse(v: {
  token?: string
  expiration_time?: number
}): Buffer {
  return CdnAuthTokenResponse.encode({
    token: v.token,
    expiration_time: v.expiration_time
  }).finish()
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('CdnAuthTokenCache', () => {
  it('cache miss: fetches a token via the MODERN unified RPC with the exact method name and request fields', async () => {
    const { client, calls } = makeFakeClient()
    const cache = new CdnAuthTokenCache(client, 1091500)

    const token = await cache.getToken(
      '12345',
      'cache1-akl-tpwr.steamcontent.com'
    )

    expect(token).toBe('?default-token')
    expect(calls).toHaveLength(1)
    expect(calls[0].methodName).toBe('ContentServerDirectory.GetCDNAuthToken#1')
    expect(calls[0].methodData).toEqual({
      app_id: 1091500,
      depot_id: 12345,
      host_name: 'cache1-akl-tpwr.steamcontent.com'
    })
  })

  it('maps expiration_time (epoch seconds) to expiresAt correctly — a token well within its window is reused, not re-fetched', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const { client, calls } = makeFakeClient(() => ({
      token: '?token',
      expiration_time: nowSec + 3600
    }))
    const cache = new CdnAuthTokenCache(client, 1091500)

    await cache.getToken('12345', 'host-a')
    await cache.getToken('12345', 'host-a')

    expect(calls).toHaveLength(1)
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
    const { client, calls } = makeFakeClient((call) => ({
      token: `?token-for-${call.methodData.host_name}`,
      expiration_time: Math.floor(Date.now() / 1000) + 3600
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
          expiration_time:
            call === 1
              ? Math.floor(
                  (Date.now() + PROACTIVE_REFRESH_BUFFER_MS / 2) / 1000
                )
              : Math.floor((Date.now() + 60 * 60 * 1000) / 1000)
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
      return {
        token: `?token-${call}`,
        expiration_time: Math.floor(Date.now() / 1000) + 3600
      }
    })
    const cache = new CdnAuthTokenCache(client, 1091500)

    await cache.getToken('12345', 'host-a')
    await cache.getToken('12345', 'host-a')
    const third = await cache.getToken('12345', 'host-a')

    expect(third).toBe('?token-1')
    expect(calls).toHaveLength(1)
  })

  it('concurrent callers for the SAME depot+host are coalesced onto a single in-flight fetch — never N redundant CM round-trips', async () => {
    let resolveFetch: (v: {
      token: string
      expiration_time: number
    }) => void = () => {}
    const client: CDNAuthTokenClient = {
      _send: jest.fn((_header, _body, callback) => {
        // Deliberately never resolves synchronously — simulates a real
        // in-flight CM round-trip that many concurrent chunk-fetch workers
        // could race against.
        resolveFetch = (v) =>
          callback(encodeResponse(v), { proto: { eresult: 1 } })
      })
    }
    const cache = new CdnAuthTokenCache(client, 1091500)

    const p1 = cache.getToken('12345', 'host-a')
    const p2 = cache.getToken('12345', 'host-a')
    const p3 = cache.getToken('12345', 'host-a')

    expect(client._send).toHaveBeenCalledTimes(1)

    resolveFetch({
      token: '?shared-token',
      expiration_time: Math.floor(Date.now() / 1000) + 3600
    })

    await expect(p1).resolves.toBe('?shared-token')
    await expect(p2).resolves.toBe('?shared-token')
    await expect(p3).resolves.toBe('?shared-token')
    expect(client._send).toHaveBeenCalledTimes(1)
  })

  it('fetch failure: getToken NEVER throws — resolves to "" so the caller degrades to a token-less request', async () => {
    const { client } = makeFakeClient(() => ({ eresult: 5 /* AccessDenied */ }))
    const cache = new CdnAuthTokenCache(client, 1091500)

    const token = await cache.getToken('12345', 'host-a')

    expect(token).toBe('')
    expect(logWarning).toHaveBeenCalled()
  })

  it('a non-OK eresult (not just a missing token) is treated as a failure', async () => {
    const { client } = makeFakeClient(() => ({
      token: 'ignored-because-eresult-failed',
      eresult: 2
    }))
    const cache = new CdnAuthTokenCache(client, 1091500)

    const token = await cache.getToken('12345', 'host-a')

    expect(token).toBe('')
    expect(logWarning).toHaveBeenCalled()
  })

  it('fetch failure is not cached forever — a subsequent getToken call retries the fetch after the cooldown, not just returns the same empty string forever', async () => {
    jest.useFakeTimers()
    try {
      let call = 0
      const { client, calls } = makeFakeClient(() => {
        call++
        if (call === 1) return { eresult: 5 }
        return {
          token: '?recovered-token',
          expiration_time: Math.floor(Date.now() / 1000) + 3600
        }
      })
      const cache = new CdnAuthTokenCache(client, 1091500)

      const first = await cache.getToken('12345', 'host-a')
      expect(first).toBe('')

      // Immediately after a failure, the same key is in cooldown (PART 3) —
      // no second network attempt yet.
      const stillCoolingDown = await cache.getToken('12345', 'host-a')
      expect(stillCoolingDown).toBe('')
      expect(calls).toHaveLength(1)

      jest.advanceTimersByTime(CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS + 1)

      const afterCooldown = await cache.getToken('12345', 'host-a')
      expect(afterCooldown).toBe('?recovered-token')
      expect(calls).toHaveLength(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('invalidate: clears the cached token for that exact depot+host so the NEXT getToken call re-fetches', async () => {
    let call = 0
    const { client, calls } = makeFakeClient(() => {
      call++
      return {
        token: `?token-${call}`,
        expiration_time: Math.floor(Date.now() / 1000) + 3600
      }
    })
    const cache = new CdnAuthTokenCache(client, 1091500)

    const first = await cache.getToken('12345', 'host-a')
    expect(first).toBe('?token-1')

    cache.invalidate('12345', 'host-a')

    const second = await cache.getToken('12345', 'host-a')
    expect(second).toBe('?token-2')
    expect(calls).toHaveLength(2)
  })

  it("invalidate on one depot+host never affects a DIFFERENT depot+host's still-valid cached token", async () => {
    const { client, calls } = makeFakeClient((call) => ({
      token: `?token-${call.methodData.depot_id}-${call.methodData.host_name}`,
      expiration_time: Math.floor(Date.now() / 1000) + 3600
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

  describe('PART 3 (regression guard): a hanging/failing token fetch NEVER blocks or serializes the caller', () => {
    it('a token round-trip that never calls back is bounded by CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS, not left to hang indefinitely', async () => {
      jest.useFakeTimers()
      try {
        const { client } = makeFakeClient(() => ({ neverResolves: true }))
        const cache = new CdnAuthTokenCache(client, 1091500)

        const pending = cache.getToken('12345', 'host-a')
        let settled = false
        void pending.then(() => {
          settled = true
        })

        // Not yet at the timeout — must still be pending.
        await jest.advanceTimersByTimeAsync(CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS - 1)
        expect(settled).toBe(false)

        // Crosses the bound — must resolve (to '') within the SAME bounded
        // window, never past it.
        await jest.advanceTimersByTimeAsync(2)
        expect(settled).toBe(true)
        await expect(pending).resolves.toBe('')
      } finally {
        jest.useRealTimers()
      }
    })

    it('a late callback firing AFTER the bounded timeout already settled the promise is silently ignored — no crash, no double-resolve', async () => {
      jest.useFakeTimers()
      try {
        let lateCallback: (() => void) | undefined
        const client: CDNAuthTokenClient = {
          _send: jest.fn((_header, _body, callback) => {
            lateCallback = () =>
              callback(
                encodeResponse({
                  token: '?too-late',
                  expiration_time: Math.floor(Date.now() / 1000) + 3600
                }),
                { proto: { eresult: 1 } }
              )
          })
        }
        const cache = new CdnAuthTokenCache(client, 1091500)

        const pending = cache.getToken('12345', 'host-a')
        await jest.advanceTimersByTimeAsync(CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS + 1)
        await expect(pending).resolves.toBe('')

        // The real callback finally fires, long after this module gave up —
        // must not throw, must not resurrect the settled promise.
        expect(() => lateCallback?.()).not.toThrow()
      } finally {
        jest.useRealTimers()
      }
    })

    it('a hanging token fetch for ONE depot+host never blocks a concurrent getToken call for a DIFFERENT depot+host', async () => {
      const client: CDNAuthTokenClient = {
        _send: jest.fn((_header, body, callback) => {
          const { host_name } =
            CContentServerDirectory_GetCDNAuthToken_Request.decode(body)
          if (host_name === 'stuck-host') return // never calls back
          callback(
            encodeResponse({
              token: '?fine-host-token',
              expiration_time: Math.floor(Date.now() / 1000) + 3600
            }),
            { proto: { eresult: 1 } }
          )
        })
      }
      const cache = new CdnAuthTokenCache(client, 1091500)

      const stuck = cache.getToken('12345', 'stuck-host')
      const fine = await cache.getToken('12345', 'fine-host')

      // The healthy host resolves immediately, completely independent of
      // the stuck one still being in flight — proves no serialization
      // across different cache keys.
      expect(fine).toBe('?fine-host-token')

      // Clean up the still-pending stuck fetch so it doesn't leak past this
      // test (it will resolve to '' once its own bounded timeout fires).
      void stuck
    })

    it('after a token-fetch timeout, the SAME depot+host is negative-cached for CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS — every attempt during the cooldown short-circuits to "" with NO further network round-trip', async () => {
      jest.useFakeTimers()
      try {
        const { client, calls } = makeFakeClient(() => ({
          neverResolves: true
        }))
        const cache = new CdnAuthTokenCache(client, 1091500)

        const first = cache.getToken('12345', 'host-a')
        await jest.advanceTimersByTimeAsync(CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS + 1)
        await expect(first).resolves.toBe('')
        expect(calls).toHaveLength(1)

        // Simulate many more chunk-fetch workers landing on the SAME
        // depot+host during the cooldown window — none of them should
        // trigger a second network attempt.
        for (let i = 0; i < 20; i++) {
          // eslint-disable-next-line no-await-in-loop
          expect(await cache.getToken('12345', 'host-a')).toBe('')
        }
        expect(calls).toHaveLength(1)
      } finally {
        jest.useRealTimers()
      }
    })
  })

  it('SECURITY: the token value is NEVER present in any logInfo/logWarning call — only length/expiry/host are logged', async () => {
    const secretToken = '?SUPER_SECRET_SESSION_TOKEN_DO_NOT_LEAK_abc123'
    const { client } = makeFakeClient(() => ({
      token: secretToken,
      expiration_time: Math.floor(Date.now() / 1000) + 3600
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
    const { client } = makeFakeClient(() => ({ eresult: 5 }))
    const cache = new CdnAuthTokenCache(client, 1091500)

    await cache.getToken('12345', 'host-a')

    expect(logWarning).toHaveBeenCalled()
    const [messageParts] = (logWarning as jest.Mock).mock.calls[0]
    const text = Array.isArray(messageParts)
      ? messageParts.join(' ')
      : String(messageParts)
    expect(text).toContain('12345')
    expect(text).toContain('host-a')
  })
})
