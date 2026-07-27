/**
 * Unit tests for the Humble adapter (C5 isolation wall).
 * Covers HACCT-01 (identity fetch), HACCT-02 (401/403 split), T-10-01/02/03.
 *
 * Mock boundaries:
 *  - axios       → get, isAxiosError (GET paths: getGamekeys/getOrderDetail/
 *                  getAccountIdentity)
 *  - electron    → net.request (round 6: the reveal POST's transport —
 *                  see FakeClientRequest/FakeIncomingMessage below)
 *  - backend/logger → logInfo/logError/logWarning (asserted never to receive the cookie)
 */

// ── axios mock (factory — must be first, jest.mock is hoisted) ──────────────
const mockGet = jest.fn()
const mockIsAxiosError = jest.fn()
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    isAxiosError: (...args: unknown[]) => mockIsAxiosError(...args)
  }
}))

// ── electron net mock (round 6: the reveal POST's electron-net transport) ───
// Minimal fake of Electron's ClientRequest/IncomingMessage event-emitter
// shape — just enough to drive humblePostRequest's promise wrapper
// (setHeader/end/on('response'|'error'), response.on('data'|'end'|'error'),
// response.statusCode/headers). Queue a response OR an error via
// queueNetResponse()/queueNetError() before calling revealKey(); the fake
// resolves/rejects on the next tick after request.end() is called, mirroring
// a real async I/O round-trip closely enough for these tests.
import { EventEmitter } from 'node:events'

class FakeIncomingMessage extends EventEmitter {
  statusCode: number
  headers: Record<string, string>
  constructor(statusCode: number, headers: Record<string, string>) {
    super()
    this.statusCode = statusCode
    this.headers = headers
  }
}

type QueuedNetBehavior =
  | { type: 'response'; status: number; body: string; headers: Record<string, string> }
  | { type: 'error'; error: Error }

let nextNetBehavior: QueuedNetBehavior | undefined

class FakeClientRequest extends EventEmitter {
  headers: Record<string, string> = {}
  body = ''
  aborted = false
  setHeader(name: string, value: string) {
    this.headers[name] = value
  }
  getHeader(name: string) {
    return this.headers[name]
  }
  abort() {
    this.aborted = true
    this.emit('abort')
  }
  end(chunk?: string) {
    this.body = chunk ?? ''
    const behavior = nextNetBehavior
    nextNetBehavior = undefined
    if (!behavior) {
      // No response queued: simulates a stalled/hung connection — used by
      // the WR-04 timeout test below, which advances fake timers to trigger
      // humblePostRequest's own manually-armed timeout/abort instead of
      // waiting for a response that will never come.
      return
    }
    process.nextTick(() => {
      if (behavior.type === 'error') {
        this.emit('error', behavior.error)
        return
      }
      const response = new FakeIncomingMessage(behavior.status, behavior.headers)
      this.emit('response', response)
      process.nextTick(() => {
        if (behavior.body.length > 0) {
          response.emit('data', Buffer.from(behavior.body))
        }
        response.emit('end')
      })
    })
  }
}

const createdNetRequests: FakeClientRequest[] = []
const netRequestOptions: Record<string, unknown>[] = []
// jest.config's `resetMocks: true` strips any implementation given at
// `jest.fn(impl)` construction time before EVERY test — the implementation
// is re-established in beforeEach below (mirrors mockIsAxiosError's own
// re-established mockImplementation just below it).
const mockNetRequest = jest.fn()

// Typical Electron default UA shape (mirrors user.test.ts's own fixture) —
// standardBrowserUserAgent() (userAgent.ts) reads app.userAgentFallback to
// build the reveal POST's User-Agent header.
const MOCK_USER_AGENT_FALLBACK =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) GameLib/1.0.0 Chrome/142.0.7444.52 Electron/41.1.1 Safari/537.36'

jest.mock('electron', () => ({
  app: { userAgentFallback: MOCK_USER_AGENT_FALLBACK },
  net: { request: (options: unknown) => mockNetRequest(options) }
}))

/** Queues the next FakeClientRequest.end() call to resolve with an HTTP response. */
function queueNetResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' }
) {
  const bodyStr =
    typeof body === 'string'
      ? body
      : body === undefined
        ? ''
        : JSON.stringify(body)
  nextNetBehavior = { type: 'response', status, body: bodyStr, headers }
}

/** Queues the next FakeClientRequest.end() call to reject (network-level failure, no response). */
function queueNetError(error: Error) {
  nextNetBehavior = { type: 'error', error }
}

function lastNetRequestOptions(): Record<string, unknown> {
  return netRequestOptions[netRequestOptions.length - 1]
}

function lastNetRequestHeaders(): Record<string, string> {
  return createdNetRequests[createdNetRequests.length - 1].headers
}

// ── Logger mock (factory to prevent transitive module load failures) ────────
const mockLogInfo = jest.fn()
const mockLogError = jest.fn()
const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: {
    Backend: 'Backend'
  }
}))

import {
  getGamekeys,
  getOrderDetail,
  getAccountIdentity,
  revealKey
} from '../adapter'
import {
  setLoginWindowSeam,
  type LoginWindowSeam
} from '../loginWindowSeam'

const COOKIE = 'super-secret-cookie-value'

function makeAxiosError(
  status: number,
  responseExtra?: { data?: unknown; headers?: Record<string, unknown> }
) {
  const err = new Error(
    `Request failed with status code ${status}`
  ) as Error & {
    response?: {
      status: number
      data?: unknown
      headers?: Record<string, unknown>
    }
    isAxiosError: true
  }
  err.response = { status, ...responseExtra }
  err.isAxiosError = true
  return err
}

beforeEach(() => {
  jest.clearAllMocks()
  mockIsAxiosError.mockImplementation(
    (err: unknown): err is { response?: { status: number } } =>
      Boolean(err && typeof err === 'object' && 'isAxiosError' in err)
  )
  createdNetRequests.length = 0
  netRequestOptions.length = 0
  nextNetBehavior = undefined
  mockNetRequest.mockImplementation((options: unknown) => {
    const req = new FakeClientRequest()
    createdNetRequests.push(req)
    netRequestOptions.push(options as Record<string, unknown>)
    return req
  })
})

function allLoggedStrings(): string[] {
  const calls = [
    ...mockLogInfo.mock.calls,
    ...mockLogError.mock.calls,
    ...mockLogWarning.mock.calls
  ]
  return calls.map((call) => JSON.stringify(call))
}

describe('getGamekeys', () => {
  // Real /api/v1/user/order shape (confirmed live, HUMBLE-SPEC-SOURCE.md
  // Appendix A): an array of order-summary objects, each carrying a
  // `gamekey` string — NOT bare strings.
  test('200 + realistic order-summary array -> ok with gamekey strings extracted', async () => {
    mockGet.mockResolvedValue({
      data: [
        { gamekey: 'abc123', human_name: 'Some Bundle' },
        { gamekey: 'def456', human_name: 'Another Bundle' }
      ]
    })
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({ status: 'ok', data: ['abc123', 'def456'] })
  })

  test('200 + empty array -> ok with empty data', async () => {
    mockGet.mockResolvedValue({ data: [] })
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({ status: 'ok', data: [] })
  })

  test('200 + legacy bare-string array shape -> schema_error (regression guard)', async () => {
    mockGet.mockResolvedValue({ data: ['abc123', 'def456'] })
    const result = await getGamekeys(COOKIE)
    expect(result.status).toBe('schema_error')
  })

  test('200 + non-array body -> schema_error', async () => {
    mockGet.mockResolvedValue({ data: { unexpected: true } })
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({
      status: 'schema_error',
      raw: { unexpected: true }
    })
  })

  test('200 + non-array body -> logs redacted, self-diagnosing schema_error details', async () => {
    mockGet.mockResolvedValue({
      data: { unexpected: true },
      headers: { 'content-type': 'application/json' }
    })
    await getGamekeys(COOKIE)
    const warnCall = mockLogWarning.mock.calls.find((call) =>
      JSON.stringify(call).includes('schema validation')
    )
    expect(warnCall).toBeDefined()
    const logged = JSON.stringify(warnCall)
    expect(logged).toContain('contentType=application/json')
    expect(logged).toContain('bodyIsString=false')
    expect(logged).not.toContain(COOKIE)
  })

  test('200 + HTML/interstitial string body -> schema_error diagnostics flag non-JSON transport issue', async () => {
    mockGet.mockResolvedValue({
      data: '<html><body>Please log in</body></html>',
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
    const result = await getGamekeys(COOKIE)
    expect(result.status).toBe('schema_error')
    const warnCall = mockLogWarning.mock.calls.find((call) =>
      JSON.stringify(call).includes('schema validation')
    )
    expect(warnCall).toBeDefined()
    const logged = JSON.stringify(warnCall)
    expect(logged).toContain('bodyIsString=true')
    expect(logged).toContain('contentType=text/html')
    // Redaction: the HTML body content itself must never be logged.
    expect(logged).not.toContain('Please log in')
  })

  test('axios 401 -> session_expired', async () => {
    mockGet.mockRejectedValue(makeAxiosError(401))
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({ status: 'session_expired' })
  })

  test('axios 403 -> access_denied', async () => {
    mockGet.mockRejectedValue(makeAxiosError(403))
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({ status: 'access_denied' })
  })

  // D-25: Humble rate-limit (429) is a backoff-inducing denial — routed
  // through the same access_denied abort+cooldown path as 403.
  test('axios 429 -> access_denied', async () => {
    mockGet.mockRejectedValue(makeAxiosError(429))
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({ status: 'access_denied' })
  })

  test('non-axios / unmapped-status error rethrows', async () => {
    mockGet.mockRejectedValue(makeAxiosError(500))
    await expect(getGamekeys(COOKIE)).rejects.toThrow()
  })

  test('sends X-Requested-By and Cookie headers', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await getGamekeys(COOKIE)
    expect(mockGet).toHaveBeenCalledTimes(1)
    const [, config] = mockGet.mock.calls[0]
    expect(config.headers['X-Requested-By']).toBe('hb_android_app')
    expect(config.headers.Cookie).toMatch(/_simpleauth_sess=/)
    expect(config.headers.Cookie).toBe(`_simpleauth_sess=${COOKIE}`)
  })

  test('WR-04: sets a finite request timeout so a hung transport cannot stall validation indefinitely', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await getGamekeys(COOKIE)
    const [, config] = mockGet.mock.calls[0]
    expect(config.timeout).toBeGreaterThan(0)
    expect(config.timeout).toBeLessThanOrEqual(30_000)
  })

  test('WR-04: an axios timeout error (ECONNABORTED, no response) rethrows as a transient error rather than mapping to expired/denied', async () => {
    const err = new Error('timeout of 15000ms exceeded') as Error & {
      code: string
      isAxiosError: true
    }
    err.code = 'ECONNABORTED'
    err.isAxiosError = true
    mockGet.mockRejectedValue(err)
    await expect(getGamekeys(COOKIE)).rejects.toThrow('timeout')
  })

  test('never logs the raw cookie value', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await getGamekeys(COOKIE)
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(COOKIE)
    }
  })

  test('never logs the raw cookie value on error paths either', async () => {
    mockGet.mockRejectedValue(makeAxiosError(401))
    await getGamekeys(COOKIE)
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(COOKIE)
    }
  })
})

describe('getOrderDetail', () => {
  const GAMEKEY = 'gamekey-xyz'

  test('valid detail body -> ok', async () => {
    const body = {
      gamekey: GAMEKEY,
      tpkd_dict: { all_tpks: [{ steam_app_id: 220 }] }
    }
    mockGet.mockResolvedValue({ data: body })
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result).toEqual({ status: 'ok', data: body })
  })

  test('malformed body -> schema_error', async () => {
    mockGet.mockResolvedValue({ data: 'not-an-object' })
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result.status).toBe('schema_error')
  })

  test('axios 401 -> session_expired', async () => {
    mockGet.mockRejectedValue(makeAxiosError(401))
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result).toEqual({ status: 'session_expired' })
  })

  test('axios 403 -> access_denied', async () => {
    mockGet.mockRejectedValue(makeAxiosError(403))
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result).toEqual({ status: 'access_denied' })
  })

  // D-25: same abort+cooldown path as 403.
  test('axios 429 -> access_denied', async () => {
    mockGet.mockRejectedValue(makeAxiosError(429))
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result).toEqual({ status: 'access_denied' })
  })

  test('sends X-Requested-By and Cookie headers', async () => {
    mockGet.mockResolvedValue({ data: { gamekey: GAMEKEY } })
    await getOrderDetail(COOKIE, GAMEKEY)
    const [, config] = mockGet.mock.calls[0]
    expect(config.headers['X-Requested-By']).toBe('hb_android_app')
    expect(config.headers.Cookie).toBe(`_simpleauth_sess=${COOKIE}`)
  })

  // Live-UAT round 3 (debug: humble-zero-keys-from-valid-orders): without
  // `?all_tpkds=true` Humble does not reliably include tpkd_dict.all_tpks —
  // 25/25 orders parsed ok with ZERO extractable keys. Every working
  // integration (Playnite HumbleKeysLibrary, FailSpy redeemer) sends it.
  test('requests the order detail with ?all_tpkds=true (round 3 regression)', async () => {
    mockGet.mockResolvedValue({ data: { gamekey: GAMEKEY } })
    await getOrderDetail(COOKIE, GAMEKEY)
    const [url] = mockGet.mock.calls[0]
    expect(url).toBe(
      `https://www.humblebundle.com/api/v1/order/${GAMEKEY}?all_tpkds=true`
    )
  })

  // WR-04: gamekey is schema-validated only as z.string() — a drifted or
  // hostile value with URL metacharacters must not change the request target
  // or truncate the required all_tpkds=true query (the exact parameter whose
  // absence caused the round-3 zero-keys failure).
  test('WR-04: a gamekey with URL metacharacters is percent-encoded into the path — target and query survive intact', async () => {
    mockGet.mockResolvedValue({ data: { gamekey: 'weird' } })
    const hostileGamekey = 'abc/../../user?x=1#frag key'
    await getOrderDetail(COOKIE, hostileGamekey)
    const [url] = mockGet.mock.calls[0]
    expect(url).toBe(
      `https://www.humblebundle.com/api/v1/order/${encodeURIComponent(
        hostileGamekey
      )}?all_tpkds=true`
    )
    // The encoded path segment carries none of the raw metacharacters.
    expect(url).not.toContain('/../')
    expect(url).not.toContain('#')
    expect(url.endsWith('?all_tpkds=true')).toBe(true)
  })

  // Shape tolerance (round 3): a live `"tpkd_dict": null` or
  // `"all_tpks": null` must degrade to "no tpks" (diagnosed downstream by
  // library.ts's zero-key logging), never fail the whole order parse.
  test('tpkd_dict: null -> ok, never schema_error', async () => {
    mockGet.mockResolvedValue({ data: { gamekey: GAMEKEY, tpkd_dict: null } })
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result.status).toBe('ok')
  })

  test('all_tpks: null -> ok, never schema_error', async () => {
    mockGet.mockResolvedValue({
      data: { gamekey: GAMEKEY, tpkd_dict: { all_tpks: null } }
    })
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result.status).toBe('ok')
  })

  // Real-world tpk field set (Playnite Tpk model / FailSpy): parses ok and
  // RETAINS the fields classify.ts consumes (redeemed_key_val, is_expired).
  test('real-world tpk shape parses ok and retains redeemed_key_val/is_expired', async () => {
    const body = {
      gamekey: GAMEKEY,
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'realgame_steam',
            gamekey: GAMEKEY,
            key_type: 'steam',
            key_type_human_name: 'Steam',
            human_name: 'Real Game',
            steam_app_id: '220',
            is_expired: false,
            redeemed_key_val: 'redeemed-value-string'
          }
        ]
      }
    }
    mockGet.mockResolvedValue({ data: body })
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const tpk = result.data.tpkd_dict?.all_tpks?.[0] as Record<string, unknown>
    expect(tpk.redeemed_key_val).toBe('redeemed-value-string')
    expect(tpk.is_expired).toBe(false)
    expect(tpk.steam_app_id).toBe('220')
  })

  // Round 4: the real expiration date field (best-evidence `expiry_date`) is
  // not declared on the schema but MUST survive .passthrough() so classify.ts's
  // extractExpiration can read it — a regression guard against a future
  // schema tightening silently stripping the date field.
  test('an unlisted expiry_date field survives .passthrough() for classify to read', async () => {
    const body = {
      gamekey: GAMEKEY,
      tpkd_dict: {
        all_tpks: [
          {
            machine_name: 'expiring_steam',
            key_type: 'steam',
            human_name: 'Expiring Game',
            is_expired: false,
            expiry_date: '2026-08-03T00:00:00Z'
          }
        ]
      }
    }
    mockGet.mockResolvedValue({ data: body })
    const result = await getOrderDetail(COOKIE, GAMEKEY)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const tpk = result.data.tpkd_dict?.all_tpks?.[0] as Record<string, unknown>
    expect(tpk.expiry_date).toBe('2026-08-03T00:00:00Z')
  })

  test('never logs the raw cookie value', async () => {
    mockGet.mockResolvedValue({ data: { gamekey: GAMEKEY } })
    await getOrderDetail(COOKIE, GAMEKEY)
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(COOKIE)
    }
  })
})

describe('getAccountIdentity', () => {
  test('valid identity body -> ok AdapterResult<HumbleUserData>', async () => {
    mockGet.mockResolvedValue({ data: { username: 'testuser' } })
    const result = await getAccountIdentity(COOKIE)
    expect(result).toEqual({ status: 'ok', data: { username: 'testuser' } })
  })

  test('malformed body -> schema_error', async () => {
    mockGet.mockResolvedValue({ data: { no_username_field: true } })
    const result = await getAccountIdentity(COOKIE)
    expect(result.status).toBe('schema_error')
  })

  test('axios 401 -> session_expired', async () => {
    mockGet.mockRejectedValue(makeAxiosError(401))
    const result = await getAccountIdentity(COOKIE)
    expect(result).toEqual({ status: 'session_expired' })
  })

  test('axios 403 -> access_denied', async () => {
    mockGet.mockRejectedValue(makeAxiosError(403))
    const result = await getAccountIdentity(COOKIE)
    expect(result).toEqual({ status: 'access_denied' })
  })

  test('sends X-Requested-By and Cookie headers', async () => {
    mockGet.mockResolvedValue({ data: { username: 'testuser' } })
    await getAccountIdentity(COOKIE)
    const [, config] = mockGet.mock.calls[0]
    expect(config.headers['X-Requested-By']).toBe('hb_android_app')
    expect(config.headers.Cookie).toBe(`_simpleauth_sess=${COOKIE}`)
  })

  test('never logs the raw cookie value', async () => {
    mockGet.mockResolvedValue({ data: { username: 'testuser' } })
    await getAccountIdentity(COOKIE)
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(COOKIE)
    }
  })
})

// ── Live-UAT round 2 regressions (debug: humble-keys-empty-list-flashing-sync)

describe('getGamekeys — per-entry tolerance (round 2)', () => {
  test('one malformed summary entry is SKIPPED, valid gamekeys still returned, redacted count warning logged', async () => {
    mockGet.mockResolvedValue({
      data: [
        { gamekey: 'abc123', human_name: 'Good Bundle' },
        { gamekey: 12345, human_name: 'Numeric Gamekey Drift' },
        null,
        { gamekey: 'def456' }
      ],
      headers: { 'content-type': 'application/json' }
    })
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({ status: 'ok', data: ['abc123', 'def456'] })

    const warnCall = mockLogWarning.mock.calls.find((call) =>
      JSON.stringify(call).includes('skipped 2 malformed order-summary')
    )
    expect(warnCall).toBeDefined()
    // Redaction: structural issue paths only — never entry values.
    const logged = JSON.stringify(warnCall)
    expect(logged).not.toContain('12345')
    expect(logged).not.toContain('Numeric Gamekey Drift')
    expect(logged).not.toContain(COOKIE)
  })

  test('non-empty array where EVERY entry is malformed is still schema_error (wholesale drift must not become a silent empty library)', async () => {
    mockGet.mockResolvedValue({
      data: [{ no_gamekey: true }, { gamekey: 42 }],
      headers: { 'content-type': 'application/json' }
    })
    const result = await getGamekeys(COOKIE)
    expect(result.status).toBe('schema_error')
    const warnCall = mockLogWarning.mock.calls.find((call) =>
      JSON.stringify(call).includes('schema validation')
    )
    expect(warnCall).toBeDefined()
    expect(JSON.stringify(warnCall)).toContain('no entry carried a string gamekey')
  })
})

describe('humbleRequest — string-body JSON coercion (round 2)', () => {
  test('valid JSON delivered as a raw string (mislabeled content-type) is coerced and parses ok', async () => {
    mockGet.mockResolvedValue({
      data: JSON.stringify([{ gamekey: 'abc123' }]),
      headers: { 'content-type': 'text/plain' }
    })
    const result = await getGamekeys(COOKIE)
    expect(result).toEqual({ status: 'ok', data: ['abc123'] })
  })

  test('a genuine HTML body still fails with bodyIsString=true diagnostics', async () => {
    mockGet.mockResolvedValue({
      data: '<html><body>challenge</body></html>',
      headers: { 'content-type': 'text/html' }
    })
    const result = await getOrderDetail(COOKIE, 'gk')
    expect(result.status).toBe('schema_error')
    const logged = JSON.stringify(mockLogWarning.mock.calls)
    expect(logged).toContain('bodyIsString=true')
    expect(logged).not.toContain('challenge')
  })
})

describe('getOrderDetail — realistic plain store-purchase payload (round 2, spec Appendix A + 10-VALIDATION.md)', () => {
  // Field set grounded in HUMBLE-SPEC-SOURCE.md Appendix A and the Phase 10
  // live gate (tpkd_dict.all_tpks[n].steam_app_id present;
  // redeemed_key_value ABSENT — not null — for an unredeemed key).
  const realisticOrder = {
    amount_spent: 4.99,
    product: {
      category: 'storefront',
      machine_name: 'greatgame_storefront',
      human_name: 'Great Game'
    },
    gamekey: 'AbCdEfGh12345678',
    uid: 'ABCDEF123456',
    created: '2026-06-20T18:12:33.123456',
    missed_credit: null,
    subproducts: [{ machine_name: 'greatgame', human_name: 'Great Game' }],
    currency: 'USD',
    is_giftee: false,
    claimed: true,
    total: 4.99,
    tpkd_dict: {
      all_tpks: [
        {
          machine_name: 'greatgame_steam',
          gamekey: 'AbCdEfGh12345678',
          exclusive_countries: [],
          key_type: 'steam',
          disallowed_countries: [],
          human_name: 'Great Game',
          steam_app_id: 123456,
          is_gift: false,
          num_days_until_expired: 0,
          sold_out: false,
          is_expired: false,
          keyindex: 1
          // no redeemed_key_value at all (unredeemed), no expiration
        }
      ]
    },
    path_ids: ['12345abc']
  }

  test('parses ok and the parsed data retains tpkd_dict.all_tpks for classification', async () => {
    mockGet.mockResolvedValue({
      data: realisticOrder,
      headers: { 'content-type': 'application/json' }
    })
    const result = await getOrderDetail(COOKIE, 'AbCdEfGh12345678')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.tpkd_dict?.all_tpks).toHaveLength(1)

    // End-to-end into the real classifier: a plain purchased Steam key must
    // classify to exactly one UNREVEALED steam entry — never an empty order.
    const { classifyOrder } = jest.requireActual<
      typeof import('../classify')
    >('../classify')
    const entry = classifyOrder(result.data, () => false)
    expect(entry.keys).toHaveLength(1)
    expect(entry.keys[0]).toMatchObject({
      gamekey: 'AbCdEfGh12345678',
      machineName: 'greatgame_steam',
      state: 'UNREVEALED',
      platform: 'steam',
      title: 'Great Game'
    })
    expect(entry.allTerminal).toBe(false)
  })
})

// ── Phase 14 (HCLAIM-01): revealKey — the first write-style Humble call ────

describe('revealKey', () => {
  const GAMEKEY = 'gamekey-reveal-xyz'
  const MACHINE_NAME = 'somegame_steam'
  const FAKE_KEY = 'AAAAA-BBBBB-CCCCC'
  const CSRF_TOKEN = 'csrf-token-value'

  function params(keyindex: string | number = 1) {
    return { gamekey: GAMEKEY, machineName: MACHINE_NAME, keyindex }
  }

  test('{success:true, key} -> ok with the key value', async () => {
    queueNetResponse(200, { success: true, key: FAKE_KEY })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
  })

  // WR-06 (14-REVIEW): a well-formed {success:false} body is a definitive
  // SERVER verdict (e.g. "already redeemed"/"expired" denial), NOT schema
  // drift — previously misreported as schema_error, which downstream rolled
  // back the write-ahead REVEALED flag and rendered false "nothing was used
  // up" copy inviting an endless retry loop against a consumed key.
  test('{success:false, error_msg} -> rejected_by_server (definitive server denial, never schema_error)', async () => {
    queueNetResponse(200, { success: false, error_msg: 'already redeemed' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'rejected_by_server' })
  })

  test('WR-06: rejected_by_server logs presence/length only — never the error_msg content (C4)', async () => {
    queueNetResponse(200, {
      success: false,
      error_msg: 'already redeemed by SNEAKY-KEY-VALUE'
    })
    await revealKey(undefined, params())
    const rejectedLog = mockLogWarning.mock.calls.find((c) =>
      JSON.stringify(c).includes('rejected by server')
    )
    expect(rejectedLog).toBeDefined()
    expect(JSON.stringify(rejectedLog)).not.toContain('SNEAKY-KEY-VALUE')
    expect(JSON.stringify(rejectedLog)).toContain('errorMsgLength=')
  })

  test('success true but key missing -> schema_error, raw is undefined', async () => {
    queueNetResponse(200, { success: true })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: undefined })
  })

  test('success absent (nullish) -> schema_error, raw is undefined (genuine shape drift, not a server verdict)', async () => {
    queueNetResponse(200, { key: FAKE_KEY })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: undefined })
  })

  test('body shape drift (non-object) -> schema_error carrying the raw body', async () => {
    queueNetResponse(200, 'not-an-object')
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: 'not-an-object' })
  })

  test('HTTP 401 -> session_expired', async () => {
    queueNetResponse(401, { error_msg: 'expired' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'session_expired' })
  })

  test('HTTP 403 -> access_denied (D-78: definitive failure)', async () => {
    queueNetResponse(403, { error_msg: 'forbidden' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'access_denied' })
  })

  test('HTTP 429 -> access_denied', async () => {
    queueNetResponse(429, { error_msg: 'rate limited' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'access_denied' })
  })

  // Round 5 (debug session humble-reveal-key-fails): access_denied
  // previously collapsed a genuine Humble JSON denial and a Cloudflare Bot
  // Management HTML challenge page into an identical, silent status. revealKey
  // is the ONE call site that opts into mapAxiosError's diagnostic context —
  // structural-only (never body content, mirrors describeSchemaFailure's own
  // redaction discipline). Round 6: this diagnostic is exactly what
  // DECISIVELY confirmed the transport-fingerprint hypothesis live — see
  // adapter.ts's humblePostRequest doc comment.
  test('round 5: a 403 with a Cloudflare-shaped HTML body logs a structural (never content) diagnostic', async () => {
    queueNetResponse(
      403,
      '<!DOCTYPE html><html><body>Attention Required! | Cloudflare</body></html>',
      { 'content-type': 'text/html; charset=UTF-8' }
    )
    await revealKey(undefined, params())
    const call = mockLogWarning.mock.calls.find((c) =>
      JSON.stringify(c).includes('reveal HTTP failure diagnostic')
    )
    expect(call).toBeDefined()
    const logged = JSON.stringify(call)
    expect(logged).toContain('status=403')
    expect(logged).toContain('contentType=text/html')
    expect(logged).toContain('bodyIsString=true')
    expect(logged).toContain('looksLikeHtml=true')
    // Redaction: the actual HTML content must never be logged.
    expect(logged).not.toContain('Cloudflare')
    expect(logged).not.toContain('Attention Required')
  })

  test('round 5: a 403 with a genuine Humble JSON body logs looksLikeHtml=false (distinguishes real denial from a WAF challenge)', async () => {
    queueNetResponse(
      403,
      { success: false, error_msg: 'forbidden' },
      { 'content-type': 'application/json' }
    )
    await revealKey(undefined, params())
    const call = mockLogWarning.mock.calls.find((c) =>
      JSON.stringify(c).includes('reveal HTTP failure diagnostic')
    )
    expect(call).toBeDefined()
    const logged = JSON.stringify(call)
    expect(logged).toContain('status=403')
    expect(logged).toContain('contentType=application/json')
    expect(logged).toContain('bodyIsString=false')
    expect(logged).toContain('looksLikeHtml=false')
    expect(logged).not.toContain('forbidden')
  })

  test('round 5: getGamekeys (no diagnostic context) does NOT log an HTTP failure diagnostic on a 403 (opt-in only, unchanged behavior)', async () => {
    mockGet.mockRejectedValue(
      makeAxiosError(403, { data: '<html></html>' })
    )
    await getGamekeys(COOKIE)
    const call = mockLogWarning.mock.calls.find((c) =>
      JSON.stringify(c).includes('HTTP failure diagnostic')
    )
    expect(call).toBeUndefined()
  })

  test('a network-level error (no HTTP response at all) rethrows — D-78 ambiguous-outcome caller responsibility', async () => {
    queueNetError(new Error('net::ERR_CONNECTION_RESET'))
    await expect(revealKey(undefined, params())).rejects.toThrow(
      'ERR_CONNECTION_RESET'
    )
  })

  // WR-04 (round 6): net.request has no built-in timeout option (unlike
  // axios's `timeout` config) — humblePostRequest arms one manually and
  // must abort()+reject() a stalled connection rather than hang forever.
  test('WR-04: a hung connection (no response ever received) is aborted and rejected once the timeout fires', async () => {
    jest.useFakeTimers()
    try {
      // Attach the rejection assertion SYNCHRONOUSLY, before advancing
      // timers — otherwise the promise can reject (during the timer
      // advance's internal microtask flush) before anything is listening,
      // which Node reports as an unhandled rejection instead of letting this
      // assertion observe it.
      const assertion = expect(revealKey(undefined, params())).rejects.toThrow(
        'timed out'
      )
      // Deliberately never queueNetResponse/queueNetError — simulates a
      // stalled TCP connection. Advance past REQUEST_TIMEOUT_MS (15s).
      await jest.advanceTimersByTimeAsync(15_000)
      await assertion
      expect(createdNetRequests[0].aborted).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  test('sends keytype=machineName (naming trap), key=gamekey, keyindex as form-encoded body', async () => {
    queueNetResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(undefined, params(7))
    expect(mockNetRequest).toHaveBeenCalledTimes(1)
    expect(lastNetRequestOptions().url).toBe(
      'https://www.humblebundle.com/humbler/redeemkey'
    )
    const parsedBody = new URLSearchParams(createdNetRequests[0].body)
    expect(parsedBody.get('keytype')).toBe(MACHINE_NAME)
    expect(parsedBody.get('key')).toBe(GAMEKEY)
    expect(parsedBody.get('keyindex')).toBe('7')
  })

  test('routes the reveal POST through the live persist:humble partition, with native session cookie attachment (round 6)', async () => {
    queueNetResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(undefined, params())
    const options = lastNetRequestOptions()
    expect(options.method).toBe('POST')
    expect(options.partition).toBe('persist:humble')
    expect(options.credentials).toBe('include')
    expect(options.useSessionCookies).toBe(true)
    // No manual Cookie header — Chromium attaches the partition's cookie
    // jar natively via useSessionCookies/credentials above (superseding
    // round 5's hand-built HumbleUser.getFullCookieHeader).
    expect(lastNetRequestHeaders().Cookie).toBeUndefined()
  })

  test('sends Accept, Content-Type and User-Agent headers; omits csrf header when csrfToken is undefined', async () => {
    queueNetResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(undefined, params())
    const headers = lastNetRequestHeaders()
    expect(headers.Accept).toBe('application/json')
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(headers['User-Agent']).toEqual(expect.any(String))
    expect(headers['User-Agent'].length).toBeGreaterThan(0)
    expect(headers['csrf-prevention-token']).toBeUndefined()
  })

  // Round 5 (debug session humble-reveal-key-fails): neither proven-working
  // reference implementation for this endpoint sends X-Requested-By on the
  // redeemkey call — GameLib previously spread the FULL
  // HUMBLE_REQUIRED_HEADERS (shared with the GET paths) onto every POST.
  // GET calls are untouched (still send it — see getGamekeys/getOrderDetail/
  // getAccountIdentity tests above). Still true post-round-6 transport swap.
  test('round 5: does NOT send X-Requested-By on the reveal POST (neither working reference sends it)', async () => {
    queueNetResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(undefined, params())
    expect(lastNetRequestHeaders()['X-Requested-By']).toBeUndefined()
  })

  test('T-14-04: sends csrf-prevention-token header when a csrfToken is provided', async () => {
    queueNetResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(CSRF_TOKEN, params())
    expect(lastNetRequestHeaders()['csrf-prevention-token']).toBe(CSRF_TOKEN)
  })

  // C4 redaction: no logged call may ever contain the csrf token, the
  // revealed key value, or the error_msg content — across every outcome
  // branch. (Round 6: revealKey no longer receives a session cookie value at
  // all, so there is nothing left to assert never leaks on that front — see
  // adapter.ts's revealKey doc comment.)
  test('never logs the csrf token, the key value, or an error_msg containing a key-shaped string', async () => {
    const SNEAKY_ERROR_MSG = 'key was DDDDD-EEEEE-FFFFF already used'
    queueNetResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(CSRF_TOKEN, params())
    queueNetResponse(200, { success: false, error_msg: SNEAKY_ERROR_MSG })
    await revealKey(CSRF_TOKEN, params())

    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(CSRF_TOKEN)
      expect(logged).not.toContain(FAKE_KEY)
      expect(logged).not.toContain(SNEAKY_ERROR_MSG)
      expect(logged).not.toContain('DDDDD-EEEEE-FFFFF')
    }
  })

  test('never logs the csrf token on HTTP error paths either', async () => {
    queueNetResponse(401, { error_msg: 'expired' })
    await revealKey(CSRF_TOKEN, params())
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(CSRF_TOKEN)
    }
  })

  // ── Phase 34.4.1 Plan 04 (D-07): the Tauri login-window seam transport ──
  //
  // `humblePostRequest` branches on `getLoginWindowSeam()` -- when a seam is installed
  // (Tauri), the reveal POST routes through `seam.revealPost()` instead of `net.request`.
  // Only the TRANSPORT changes: the response still flows through the SAME
  // `RevealResponseSchema`/`mapAxiosError`/`HumbleTransportHttpError` path exercised by every
  // `describe('revealKey', ...)` case above. `setLoginWindowSeam(null)` in `afterEach` is
  // load-bearing -- the seam holder is a module-level singleton
  // (`backend/humble/loginWindowSeam.ts`) and would otherwise leak into every OTHER test file
  // that imports the real (unmocked) module in the same jest worker.
  describe('revealKey via the Tauri login-window seam (D-07)', () => {
    function fakeSeam(revealPost: LoginWindowSeam['revealPost']): LoginWindowSeam {
      return {
        open: jest.fn(),
        cookies: jest.fn(),
        takeEvents: jest.fn(),
        close: jest.fn(),
        clearCookies: jest.fn(),
        revealPost
      }
    }

    afterEach(() => {
      setLoginWindowSeam(null)
    })

    test('a 200 JSON body resolves through the unchanged RevealResponseSchema, and net.request is never called', async () => {
      setLoginWindowSeam(
        fakeSeam(
          jest.fn().mockResolvedValue({
            status: 200,
            body: JSON.stringify({ success: true, key: FAKE_KEY })
          })
        )
      )
      const result = await revealKey(undefined, params())
      expect(result).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
      expect(mockNetRequest).not.toHaveBeenCalled()
    })

    test('a 403 with an HTML (Cloudflare-shaped) body maps to access_denied via HumbleTransportHttpError, never a raw throw', async () => {
      setLoginWindowSeam(
        fakeSeam(
          jest.fn().mockResolvedValue({
            status: 403,
            body: '<!DOCTYPE html><html><body>Attention Required! | Cloudflare</body></html>'
          })
        )
      )
      const result = await revealKey(undefined, params())
      expect(result).toEqual({ status: 'access_denied' })
    })

    test('a 401 body maps to session_expired, matching the Electron path', async () => {
      setLoginWindowSeam(
        fakeSeam(
          jest.fn().mockResolvedValue({
            status: 401,
            body: JSON.stringify({ error_msg: 'expired' })
          })
        )
      )
      const result = await revealKey(undefined, params())
      expect(result).toEqual({ status: 'session_expired' })
    })

    test('a seam rejection propagates exactly as a network-level error does on the Electron path', async () => {
      setLoginWindowSeam(
        fakeSeam(jest.fn().mockRejectedValue(new Error('humble_reveal_post:timeout')))
      )
      await expect(revealKey(undefined, params())).rejects.toThrow(
        'humble_reveal_post:timeout'
      )
    })

    test('calls seam.revealPost with HUMBLE_BASE_URL, the redeem path, the form-encoded body, the csrf token and a non-empty userAgent', async () => {
      const revealPost = jest.fn().mockResolvedValue({
        status: 200,
        body: JSON.stringify({ success: true, key: FAKE_KEY })
      })
      setLoginWindowSeam(fakeSeam(revealPost))
      await revealKey(CSRF_TOKEN, params(3))
      expect(revealPost).toHaveBeenCalledTimes(1)
      const [input] = revealPost.mock.calls[0]
      expect(input.originUrl).toBe('https://www.humblebundle.com')
      expect(input.path).toBe('/humbler/redeemkey')
      expect(input.csrfToken).toBe(CSRF_TOKEN)
      expect(typeof input.userAgent).toBe('string')
      expect(input.userAgent.length).toBeGreaterThan(0)
      const parsedBody = new URLSearchParams(input.body)
      expect(parsedBody.get('keytype')).toBe(MACHINE_NAME)
      expect(parsedBody.get('key')).toBe(GAMEKEY)
      expect(parsedBody.get('keyindex')).toBe('3')
    })

    test('the Electron net.request path still runs unchanged when no seam is installed', async () => {
      setLoginWindowSeam(null)
      queueNetResponse(200, { success: true, key: FAKE_KEY })
      const result = await revealKey(undefined, params())
      expect(result).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
      expect(mockNetRequest).toHaveBeenCalledTimes(1)
    })
  })
})
