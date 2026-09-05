/**
 * Unit tests for the Humble adapter (C5 isolation wall).
 * Covers HACCT-01 (identity fetch), HACCT-02 (401/403 split), T-10-01/02/03.
 *
 * Mock boundaries:
 *  - axios       → get, isAxiosError (GET paths: getGamekeys/getOrderDetail)
 *  - login-window seam → revealPost (Phase 39 Plan 03: the reveal POST's
 *                  sole transport since humblePostRequest's electron-net
 *                  alternate was collapsed — see the `fakeSeam` helper below)
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

// ── login-window seam mock (Phase 39 Plan 03: the reveal POST's sole
// transport) — a jest.fn() standing in for LoginWindowSeam['revealPost'].
// queueSeamResponse()/queueSeamError() queue ONE resolution/rejection each,
// consumed in call order (mockResolvedValueOnce/mockRejectedValueOnce),
// mirroring a real async round-trip closely enough for these tests. The
// seam itself is installed/torn down per-test inside describe('revealKey').
const mockRevealPost = jest.fn()

function fakeSeam(revealPost: LoginWindowSeam['revealPost']): LoginWindowSeam {
  return {
    open: jest.fn(),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn(),
    takeEvents: jest.fn(),
    close: jest.fn(),
    clearCookies: jest.fn(),
    revealPost,
    clearStorage: jest.fn()
  }
}

/** Queues the next revealPost() call to resolve with an HTTP response. */
function queueSeamResponse(status: number, body?: unknown) {
  const bodyStr =
    typeof body === 'string'
      ? body
      : body === undefined
        ? ''
        : JSON.stringify(body)
  mockRevealPost.mockResolvedValueOnce({ status, body: bodyStr })
}

/** Queues the next revealPost() call to reject (structural transport failure). */
function queueSeamError(error: Error) {
  mockRevealPost.mockRejectedValueOnce(error)
}

function lastRevealPostInput(): {
  originUrl: string
  path: string
  body: string
  csrfToken?: string
  userAgent: string
} {
  const calls = mockRevealPost.mock.calls
  return calls[calls.length - 1][0]
}

// Typical Electron default UA shape (mirrors user.test.ts's own fixture) —
// standardBrowserUserAgent() (userAgent.ts) reads app.userAgentFallback to
// build the reveal POST's User-Agent header, passed through unchanged to
// the login-window seam's revealPost() input.
const MOCK_USER_AGENT_FALLBACK =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) GameLib/1.0.0 Chrome/142.0.7444.52 Electron/41.1.1 Safari/537.36'

jest.mock('backend/platform', () => ({
  app: { userAgentFallback: MOCK_USER_AGENT_FALLBACK }
}))

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

import { getGamekeys, getOrderDetail, revealKey } from '../adapter'
import { setLoginWindowSeam, type LoginWindowSeam } from '../loginWindowSeam'

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
    expect(JSON.stringify(warnCall)).toContain(
      'no entry carried a string gamekey'
    )
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
    const { classifyOrder } =
      jest.requireActual<typeof import('../classify')>('../classify')
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
//
// Phase 39 Plan 03: `humblePostRequest` now routes unconditionally through
// the login-window seam (`humblePostRequestViaSeam`) — the electron-net
// alternate this describe block used to exercise by default (no seam
// installed) is gone. Every test below installs a fake seam via the shared
// `fakeSeam()`/`mockRevealPost` helpers declared near the top of this file.

describe('revealKey', () => {
  const GAMEKEY = 'gamekey-reveal-xyz'
  const MACHINE_NAME = 'somegame_steam'
  const FAKE_KEY = 'AAAAA-BBBBB-CCCCC'
  const CSRF_TOKEN = 'csrf-token-value'

  function params(keyindex: string | number = 1) {
    return { gamekey: GAMEKEY, machineName: MACHINE_NAME, keyindex }
  }

  beforeEach(() => {
    setLoginWindowSeam(fakeSeam(mockRevealPost))
  })

  afterEach(() => {
    // Load-bearing: the seam holder is a module-level singleton
    // (`backend/humble/loginWindowSeam.ts`) and would otherwise leak into
    // every OTHER test file that imports the real (unmocked) module in the
    // same jest worker.
    setLoginWindowSeam(null)
  })

  test('{success:true, key} -> ok with the key value', async () => {
    queueSeamResponse(200, { success: true, key: FAKE_KEY })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
  })

  test('D-29-03: a SUCCESSFUL reveal emits one INFO completion line with a duration', async () => {
    queueSeamResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(undefined, params())
    const call = mockLogInfo.mock.calls.find((c) =>
      JSON.stringify(c).includes('reveal succeeded')
    )
    expect(call).toBeDefined()
    const logged = JSON.stringify(call)
    expect(logged).toContain('keyPresent=true')
    expect(logged).toMatch(/durationMs=\d+/)
  })

  test('D-29-03: the revealed key reaches NO log sink on the success path (C4)', async () => {
    queueSeamResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(undefined, params())
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(FAKE_KEY)
    }
  })

  test('{success:false, error_msg} -> rejected_by_server (definitive server denial, never schema_error)', async () => {
    queueSeamResponse(200, { success: false, error_msg: 'already redeemed' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'rejected_by_server' })
  })

  test('WR-06: rejected_by_server logs presence/length only — never the error_msg content (C4)', async () => {
    queueSeamResponse(200, {
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
    queueSeamResponse(200, { success: true })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: undefined })
  })

  test('success absent (nullish) -> schema_error, raw is undefined (genuine shape drift, not a server verdict)', async () => {
    queueSeamResponse(200, { key: FAKE_KEY })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: undefined })
  })

  test('body shape drift (non-object) -> schema_error carrying the raw body', async () => {
    queueSeamResponse(200, 'not-an-object')
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: 'not-an-object' })
  })

  test('HTTP 401 -> session_expired', async () => {
    queueSeamResponse(401, { error_msg: 'expired' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'session_expired' })
  })

  test('HTTP 403 -> access_denied (D-78: definitive failure)', async () => {
    queueSeamResponse(403, { error_msg: 'forbidden' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'access_denied' })
  })

  test('HTTP 429 -> access_denied', async () => {
    queueSeamResponse(429, { error_msg: 'rate limited' })
    const result = await revealKey(undefined, params())
    expect(result).toEqual({ status: 'access_denied' })
  })

  // Round 5 (debug session humble-reveal-key-fails): access_denied
  // previously collapsed a genuine Humble JSON denial and a Cloudflare Bot
  // Management HTML challenge page into an identical, silent status. revealKey
  // was the FIRST call site to opt into mapAxiosError's diagnostic context —
  // structural-only (never body content, mirrors describeSchemaFailure's own
  // redaction discipline).
  //
  // Phase 39 Plan 03 finding: `LoginWindowRevealPostResult` (the seam's
  // response shape) carries only `{status, body}` — no headers — so
  // `HumbleTransportHttpError.response.headers` is always `undefined` on
  // this transport and `contentType` in the diagnostic below is always
  // `unknown`. This is not a regression this plan introduced: it was already
  // true of every REAL (production, Tauri) call, since the seam has been the
  // only transport that ever actually ran outside this test file since Phase
  // 34.4.1 Plan 04. What the diagnostic can still prove — and what these two
  // tests still assert — is `looksLikeHtml`/`bodyIsString`, which are
  // derived from the BODY, not the (now-absent) headers, and are exactly
  // what distinguishes a genuine Humble JSON denial from a Cloudflare WAF
  // challenge page.
  test('round 5: a 403 with a Cloudflare-shaped HTML body logs a structural (never content) diagnostic', async () => {
    queueSeamResponse(
      403,
      '<!DOCTYPE html><html><body>Attention Required! | Cloudflare</body></html>'
    )
    await revealKey(undefined, params())
    const call = mockLogWarning.mock.calls.find((c) =>
      JSON.stringify(c).includes('reveal HTTP failure diagnostic')
    )
    expect(call).toBeDefined()
    const logged = JSON.stringify(call)
    expect(logged).toContain('status=403')
    expect(logged).toContain('contentType=unknown')
    expect(logged).toContain('bodyIsString=true')
    expect(logged).toContain('looksLikeHtml=true')
    // Redaction: the actual HTML content must never be logged.
    expect(logged).not.toContain('Cloudflare')
    expect(logged).not.toContain('Attention Required')
  })

  test('round 5: a 403 with a genuine Humble JSON body logs looksLikeHtml=false (distinguishes real denial from a WAF challenge)', async () => {
    queueSeamResponse(403, { success: false, error_msg: 'forbidden' })
    await revealKey(undefined, params())
    const call = mockLogWarning.mock.calls.find((c) =>
      JSON.stringify(c).includes('reveal HTTP failure diagnostic')
    )
    expect(call).toBeDefined()
    const logged = JSON.stringify(call)
    expect(logged).toContain('status=403')
    expect(logged).toContain('contentType=unknown')
    expect(logged).toContain('bodyIsString=false')
    expect(logged).toContain('looksLikeHtml=false')
    expect(logged).not.toContain('forbidden')
  })

  test('round 5: getGamekeys (no diagnostic context) does NOT log an HTTP failure diagnostic on a 403 (opt-in only, unchanged behavior)', async () => {
    mockGet.mockRejectedValue(makeAxiosError(403, { data: '<html></html>' }))
    await getGamekeys(COOKIE)
    const call = mockLogWarning.mock.calls.find((c) =>
      JSON.stringify(c).includes('HTTP failure diagnostic')
    )
    expect(call).toBeUndefined()
  })

  test('a network-level error (no HTTP response at all) rethrows — D-78 ambiguous-outcome caller responsibility', async () => {
    queueSeamError(new Error('humble_reveal_post:connection_reset'))
    await expect(revealKey(undefined, params())).rejects.toThrow(
      'connection_reset'
    )
  })

  // WR-04 (round 6, re-pointed at the seam transport by Phase 39 Plan 03):
  // `humblePostRequestViaSeam` arms its own REQUEST_TIMEOUT_MS timer and
  // races it against `seam.revealPost()` — a hung seam call must still
  // reject with a recognizable timeout error rather than hang the reveal
  // indefinitely. There is no `abort()` concept on this transport (the
  // login window's own `fetch()` is not cancellable from here), so unlike
  // the deleted electron-net version of this test, there is nothing to
  // assert beyond the rejection itself.
  test('WR-04: a hung seam call is rejected once REQUEST_TIMEOUT_MS fires', async () => {
    jest.useFakeTimers()
    try {
      // Never resolves/rejects — simulates a stalled login-window fetch().
      mockRevealPost.mockImplementation(() => new Promise(() => {}))
      const assertion = expect(revealKey(undefined, params())).rejects.toThrow(
        'timed out'
      )
      await jest.advanceTimersByTimeAsync(15_000)
      await assertion
    } finally {
      jest.useRealTimers()
    }
  })

  // C4 redaction: no logged call may ever contain the csrf token, the
  // revealed key value, or the error_msg content — across every outcome
  // branch. (Round 6: revealKey no longer receives a session cookie value at
  // all, so there is nothing left to assert never leaks on that front — see
  // adapter.ts's revealKey doc comment.)
  test('never logs the csrf token, the key value, or an error_msg containing a key-shaped string', async () => {
    const SNEAKY_ERROR_MSG = 'key was DDDDD-EEEEE-FFFFF already used'
    queueSeamResponse(200, { success: true, key: FAKE_KEY })
    await revealKey(CSRF_TOKEN, params())
    queueSeamResponse(200, { success: false, error_msg: SNEAKY_ERROR_MSG })
    await revealKey(CSRF_TOKEN, params())

    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(CSRF_TOKEN)
      expect(logged).not.toContain(FAKE_KEY)
      expect(logged).not.toContain(SNEAKY_ERROR_MSG)
      expect(logged).not.toContain('DDDDD-EEEEE-FFFFF')
    }
  })

  test('never logs the csrf token on HTTP error paths either', async () => {
    queueSeamResponse(401, { error_msg: 'expired' })
    await revealKey(CSRF_TOKEN, params())
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(CSRF_TOKEN)
    }
  })

  // ── Phase 34.4.1 Plan 04 (D-07): the Tauri login-window seam transport ──
  //
  // `humblePostRequest` (Phase 39 Plan 03) now unconditionally routes
  // through `seam.revealPost()` instead of `net.request` — there is no
  // other transport left to compare against. The response still flows
  // through the SAME `RevealResponseSchema`/`mapAxiosError`/
  // `HumbleTransportHttpError` path exercised by every `describe('revealKey',
  // ...)` case above; this nested describe covers what is specific to the
  // seam call itself (its input shape, its rejection semantics).
  describe('revealKey via the Tauri login-window seam (D-07)', () => {
    test('a 200 JSON body resolves through the unchanged RevealResponseSchema', async () => {
      mockRevealPost.mockResolvedValue({
        status: 200,
        body: JSON.stringify({ success: true, key: FAKE_KEY })
      })
      const result = await revealKey(undefined, params())
      expect(result).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
    })

    test('a 403 with an HTML (Cloudflare-shaped) body maps to access_denied via HumbleTransportHttpError, never a raw throw', async () => {
      mockRevealPost.mockResolvedValue({
        status: 403,
        body: '<!DOCTYPE html><html><body>Attention Required! | Cloudflare</body></html>'
      })
      const result = await revealKey(undefined, params())
      expect(result).toEqual({ status: 'access_denied' })
    })

    test('a 401 body maps to session_expired', async () => {
      mockRevealPost.mockResolvedValue({
        status: 401,
        body: JSON.stringify({ error_msg: 'expired' })
      })
      const result = await revealKey(undefined, params())
      expect(result).toEqual({ status: 'session_expired' })
    })

    test('a seam rejection propagates as a network-level error', async () => {
      mockRevealPost.mockRejectedValue(new Error('humble_reveal_post:timeout'))
      await expect(revealKey(undefined, params())).rejects.toThrow(
        'humble_reveal_post:timeout'
      )
    })

    test('calls seam.revealPost with HUMBLE_BASE_URL, the redeem path, the form-encoded body, the csrf token and a non-empty userAgent', async () => {
      queueSeamResponse(200, { success: true, key: FAKE_KEY })
      await revealKey(CSRF_TOKEN, params(3))
      expect(mockRevealPost).toHaveBeenCalledTimes(1)
      const input = lastRevealPostInput()
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
  })
})
