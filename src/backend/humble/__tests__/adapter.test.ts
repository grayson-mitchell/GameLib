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
const mockIsAxiosError = jest.fn()
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
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

import { getGamekeys, getOrderDetail, getAccountIdentity } from '../adapter'

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
