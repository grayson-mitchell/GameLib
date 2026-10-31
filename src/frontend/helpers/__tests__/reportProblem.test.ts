import {
  collectDiagnostics,
  getReportEnv,
  isReportingConfigured,
  submitReport,
  WEB3FORMS_ACCESS_KEY
} from '../reportProblem'

const KEY = '11111111-2222-4333-8444-555555555555'

function mockResponse(status: number, body: unknown, json = true) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: json
      ? () => Promise.resolve(body)
      : () => Promise.reject(new Error('not json'))
  } as unknown as Response
}

const baseArgs = {
  message: 'it broke',
  appVersion: '2.20.0',
  osLabel: 'macOS 15'
}

describe('isReportingConfigured', () => {
  test('the committed constant is a configured, UUID-shaped key', () => {
    expect(isReportingConfigured(WEB3FORMS_ACCESS_KEY)).toBe(true)
    expect(isReportingConfigured()).toBe(true)
  })

  test('rejects empty and non-UUID, accepts UUID-shaped', () => {
    expect(isReportingConfigured('')).toBe(false)
    expect(isReportingConfigured('not-a-uuid')).toBe(false)
    expect(isReportingConfigured(` ${KEY} `)).toBe(true)
  })
})

describe('submitReport', () => {
  test('unconfigured key never calls fetch', async () => {
    const fetchImpl = jest.fn()
    const r = await submitReport({ ...baseArgs, accessKey: '', fetchImpl })
    expect(r).toEqual({ ok: false, reason: 'not-configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('POSTs JSON to Web3Forms and maps 200 success', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse(200, { success: true }))
    const r = await submitReport({
      ...baseArgs,
      diagnostics: 'D',
      replyEmail: 'me@x.io',
      accessKey: KEY,
      fetchImpl
    })
    expect(r).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.web3forms.com/submit')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Accept).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body.access_key).toBe(KEY)
    expect(body.message).toBe('it broke')
    expect(body.diagnostics).toBe('D')
    expect(body.email).toBe('me@x.io')
  })

  test('400 success:false -> rejected with message', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        mockResponse(400, { success: false, body: { message: 'bad key' } })
      )
    expect(
      await submitReport({ ...baseArgs, accessKey: KEY, fetchImpl })
    ).toEqual({ ok: false, reason: 'rejected', message: 'bad key' })
  })

  test('200 with success:false -> rejected', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse(200, { success: false, message: 'no' }))
    const r = await submitReport({ ...baseArgs, accessKey: KEY, fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe('rejected')
  })

  test('429 -> rate-limited', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse(429, { success: false }))
    expect(
      await submitReport({ ...baseArgs, accessKey: KEY, fetchImpl })
    ).toEqual({ ok: false, reason: 'rate-limited' })
  })

  test('500 and non-JSON bodies -> server', async () => {
    const f500 = jest.fn().mockResolvedValue(mockResponse(500, { error: 'x' }))
    expect(
      await submitReport({ ...baseArgs, accessKey: KEY, fetchImpl: f500 })
    ).toEqual({ ok: false, reason: 'server' })
    const fBad = jest.fn().mockResolvedValue(mockResponse(200, null, false))
    expect(
      await submitReport({ ...baseArgs, accessKey: KEY, fetchImpl: fBad })
    ).toEqual({ ok: false, reason: 'server' })
  })

  test('fetch throwing -> network', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'))
    expect(
      await submitReport({ ...baseArgs, accessKey: KEY, fetchImpl })
    ).toEqual({ ok: false, reason: 'network' })
  })
})

describe('collectDiagnostics', () => {
  type Api = Record<string, unknown>
  const setApi = (api: Api) => {
    const g = globalThis as unknown as { window?: { api?: Api } }
    if (!g.window) g.window = {}
    g.window.api = api
  }

  const game = { app_name: '70', runner: 'steam' as const, title: 'Half-Life' }

  const okApi = (over: Api = {}): Api => ({
    systemInfo: {
      get: jest.fn().mockResolvedValue({
        OS: { name: 'macOS', version: '15.1', platform: 'darwin' }
      })
    },
    getHeroicVersion: jest.fn().mockReturnValue('2.20.0'),
    getLogContent: jest.fn().mockResolvedValue(''),
    isNative: jest.fn().mockReturnValue(false),
    getSteamBridgeRoute: jest.fn().mockResolvedValue({ route: 'bridge' }),
    ...over
  })

  test('returns redacted text', async () => {
    setApi(
      okApi({
        getLogContent: jest
          .fn()
          .mockResolvedValue(
            'opening /Users/alice/Library/x\n{"username": "bob"}'
          )
      })
    )
    const out = await collectDiagnostics({ knownIdentifiers: [] })
    expect(out).not.toContain('alice')
    expect(out).not.toContain('bob')
    expect(out).toContain('App version: 2.20.0')
    expect(out).toContain('macOS')
  })

  test('redacts known identifiers in the game title and logs', async () => {
    setApi(okApi())
    const out = await collectDiagnostics({
      game: { ...game, title: 'zed_player game' },
      knownIdentifiers: ['zed_player']
    })
    expect(out).not.toContain('zed_player')
  })

  test('rejected api calls still resolve with fallbacks', async () => {
    setApi(
      okApi({
        getLogContent: jest.fn().mockRejectedValue(new Error('x')),
        getSteamBridgeRoute: jest.fn().mockRejectedValue(new Error('y'))
      })
    )
    const out = await collectDiagnostics({ game, knownIdentifiers: [] })
    expect(out).toContain('Launch route: unknown')
    expect(out).toContain('(log unavailable)')
  })

  test('steam + not native + route bottle -> bottled', async () => {
    setApi(
      okApi({
        getSteamBridgeRoute: jest.fn().mockResolvedValue({ route: 'bottle' })
      })
    )
    const out = await collectDiagnostics({ game, knownIdentifiers: [] })
    expect(out).toContain('Launch route: bottled')
    expect(out).toContain('Store: steam')
    expect(out).toContain('AppId: 70')
  })

  test('native games report native', async () => {
    setApi(okApi({ isNative: jest.fn().mockReturnValue(true) }))
    const out = await collectDiagnostics({ game, knownIdentifiers: [] })
    expect(out).toContain('Launch route: native')
  })

  test('non-steam, non-native -> compatibility layer', async () => {
    setApi(okApi())
    const out = await collectDiagnostics({
      game: { app_name: 'abc', runner: 'gog', title: 'G' },
      knownIdentifiers: []
    })
    expect(out).toContain('Launch route: compatibility layer')
  })
})

describe('getReportEnv', () => {
  test('falls back to unknown without throwing', async () => {
    const g = globalThis as unknown as { window?: { api?: unknown } }
    if (!g.window) g.window = {}
    g.window.api = {
      systemInfo: { get: jest.fn().mockRejectedValue(new Error('x')) },
      getHeroicVersion: jest.fn().mockImplementation(() => {
        throw new Error('y')
      })
    }
    expect(await getReportEnv()).toEqual({
      appVersion: 'unknown',
      osLabel: 'unknown'
    })
  })
})
