/**
 * Unit tests for the Humble adapter (C5 isolation wall).
 * Covers HACCT-01 (identity fetch), HACCT-02 (401/403 split), T-10-01/02/03.
 *
 * Mock boundaries:
 *  - axios       → get, isAxiosError
 *  - backend/logger → logInfo/logError/logWarning (asserted never to receive the cookie)
 */

// ── axios mock (factory — must be first, jest.mock is hoisted) ──────────────
const mockGet = jest.fn()
const mockPost = jest.fn()
const mockIsAxiosError = jest.fn()
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    isAxiosError: (...args: unknown[]) => mockIsAxiosError(...args)
  }
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

import {
  getGamekeys,
  getOrderDetail,
  getAccountIdentity,
  revealKey
} from '../adapter'

const COOKIE = 'super-secret-cookie-value'

function makeAxiosError(status: number) {
  const err = new Error(
    `Request failed with status code ${status}`
  ) as Error & {
    response?: { status: number }
    isAxiosError: true
  }
  err.response = { status }
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

  function params(keyindex: string | number = 1) {
    return { gamekey: GAMEKEY, machineName: MACHINE_NAME, keyindex }
  }

  test('{success:true, key} -> ok with the key value', async () => {
    mockPost.mockResolvedValue({ data: { success: true, key: FAKE_KEY } })
    const result = await revealKey(COOKIE, undefined, params())
    expect(result).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
  })

  test('{success:false, error_msg} -> schema_error, raw is undefined (error_msg may echo a key value, C4)', async () => {
    mockPost.mockResolvedValue({
      data: { success: false, error_msg: 'already redeemed' }
    })
    const result = await revealKey(COOKIE, undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: undefined })
  })

  test('success true but key missing -> schema_error, raw is undefined', async () => {
    mockPost.mockResolvedValue({ data: { success: true } })
    const result = await revealKey(COOKIE, undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: undefined })
  })

  test('body shape drift (non-object) -> schema_error carrying the raw body', async () => {
    mockPost.mockResolvedValue({ data: 'not-an-object' })
    const result = await revealKey(COOKIE, undefined, params())
    expect(result).toEqual({ status: 'schema_error', raw: 'not-an-object' })
  })

  test('axios 401 -> session_expired', async () => {
    mockPost.mockRejectedValue(makeAxiosError(401))
    const result = await revealKey(COOKIE, undefined, params())
    expect(result).toEqual({ status: 'session_expired' })
  })

  test('axios 403 -> access_denied (D-78: definitive failure)', async () => {
    mockPost.mockRejectedValue(makeAxiosError(403))
    const result = await revealKey(COOKIE, undefined, params())
    expect(result).toEqual({ status: 'access_denied' })
  })

  test('axios 429 -> access_denied', async () => {
    mockPost.mockRejectedValue(makeAxiosError(429))
    const result = await revealKey(COOKIE, undefined, params())
    expect(result).toEqual({ status: 'access_denied' })
  })

  test('a thrown network error (no response) rethrows — D-78 ambiguous-outcome caller responsibility', async () => {
    const err = new Error('timeout of 15000ms exceeded') as Error & {
      code: string
      isAxiosError: true
    }
    err.code = 'ECONNABORTED'
    err.isAxiosError = true
    mockPost.mockRejectedValue(err)
    await expect(revealKey(COOKIE, undefined, params())).rejects.toThrow(
      'timeout'
    )
  })

  test('sends keytype=machineName (naming trap), key=gamekey, keyindex as form-encoded body', async () => {
    mockPost.mockResolvedValue({ data: { success: true, key: FAKE_KEY } })
    await revealKey(COOKIE, undefined, params(7))
    expect(mockPost).toHaveBeenCalledTimes(1)
    const [url, body] = mockPost.mock.calls[0]
    expect(url).toBe('https://www.humblebundle.com/humbler/redeemkey')
    const parsedBody = new URLSearchParams(body)
    expect(parsedBody.get('keytype')).toBe(MACHINE_NAME)
    expect(parsedBody.get('key')).toBe(GAMEKEY)
    expect(parsedBody.get('keyindex')).toBe('7')
  })

  test('sends X-Requested-By, Content-Type and Cookie headers; omits csrf header when csrfToken is undefined', async () => {
    mockPost.mockResolvedValue({ data: { success: true, key: FAKE_KEY } })
    await revealKey(COOKIE, undefined, params())
    const [, , config] = mockPost.mock.calls[0]
    expect(config.headers['X-Requested-By']).toBe('hb_android_app')
    expect(config.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    )
    expect(config.headers.Cookie).toBe(`_simpleauth_sess=${COOKIE}`)
    expect(config.headers['csrf-prevention-token']).toBeUndefined()
  })

  test('T-14-04: sends csrf-prevention-token header when a csrfToken is provided', async () => {
    mockPost.mockResolvedValue({ data: { success: true, key: FAKE_KEY } })
    await revealKey(COOKIE, 'csrf-token-value', params())
    const [, , config] = mockPost.mock.calls[0]
    expect(config.headers['csrf-prevention-token']).toBe('csrf-token-value')
  })

  test('WR-04: sets a finite request timeout', async () => {
    mockPost.mockResolvedValue({ data: { success: true, key: FAKE_KEY } })
    await revealKey(COOKIE, undefined, params())
    const [, , config] = mockPost.mock.calls[0]
    expect(config.timeout).toBeGreaterThan(0)
    expect(config.timeout).toBeLessThanOrEqual(30_000)
  })

  // C4 redaction: no logged call may ever contain the cookie, the revealed
  // key value, or the error_msg content — across every outcome branch.
  test('never logs the cookie, the key value, or an error_msg containing a key-shaped string', async () => {
    const SNEAKY_ERROR_MSG = 'key was DDDDD-EEEEE-FFFFF already used'
    mockPost.mockResolvedValueOnce({ data: { success: true, key: FAKE_KEY } })
    await revealKey(COOKIE, undefined, params())
    mockPost.mockResolvedValueOnce({
      data: { success: false, error_msg: SNEAKY_ERROR_MSG }
    })
    await revealKey(COOKIE, undefined, params())

    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(COOKIE)
      expect(logged).not.toContain(FAKE_KEY)
      expect(logged).not.toContain(SNEAKY_ERROR_MSG)
      expect(logged).not.toContain('DDDDD-EEEEE-FFFFF')
    }
  })

  test('never logs the cookie on axios error paths either', async () => {
    mockPost.mockRejectedValue(makeAxiosError(401))
    await revealKey(COOKIE, undefined, params())
    for (const logged of allLoggedStrings()) {
      expect(logged).not.toContain(COOKIE)
    }
  })
})
