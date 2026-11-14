/**
 * Unit tests for the Humble adapter (C5 isolation wall).
 * Covers HACCT-01 (identity fetch), HACCT-02 (401/403 split), T-10-01/02/03.
 *
 * Mock boundaries:
 *  - axios       → get, isAxiosError (GET paths: library page + JS chunks)
 *  - global fetch → the filterUserLibrary and redeemEntitlementAction server-action POSTs
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

import {
  getLibraryOrders,
  libraryItemToOrderDetail,
  revealKey
} from '../adapter'
import {
  createHumbleActionIdCache,
  type HumbleActionIdCache
} from '../actionIdCache'
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

// ── Phase 14 (HCLAIM-01): revealKey — the first write-style Humble call ────
//
// Phase 39 Plan 03: `humblePostRequest` now routes unconditionally through
// the login-window seam (`humblePostRequestViaSeam`) — the electron-net
// alternate this describe block used to exercise by default (no seam
// installed) is gone. Every test below installs a fake seam via the shared
// `fakeSeam()`/`mockRevealPost` helpers declared near the top of this file.

// ── getLibraryOrders (Next.js server action `filterUserLibrary`) ─────────────

describe('libraryItemToOrderDetail', () => {
  test('maps each keys[] element onto an order-detail tpk and carries the integration id as keyindex', () => {
    const order = libraryItemToOrderDetail({
      id: 'item-1',
      title: 'Some Game',
      entitlements: {
        keys: [
          {
            id: 'k1',
            title: 'Some Game (Steam)',
            keyIntegrationId: 'steam',
            gameKey: null,
            redeemedAt: null,
            expired: false,
            redemptionExpiryDate: '$D2030-01-02T00:00:00.000Z'
          }
        ],
        downloads: []
      }
    })
    expect(order?.gamekey).toBe('item-1')
    const tpk = order?.tpkd_dict?.all_tpks?.[0] as Record<string, unknown>
    expect(tpk).toMatchObject({
      machine_name: 'k1',
      human_name: 'Some Game (Steam)',
      key_type: 'steam',
      is_expired: false,
      expiry_date: '2030-01-02T00:00:00.000Z'
    })
    expect(tpk).not.toHaveProperty('redeemed_key_val')
    expect(tpk).toHaveProperty('keyindex', 'steam')
  })

  test('a present gameKey becomes redeemed_key_val; redeemedAt alone marks revealed without a value', () => {
    const withValue = libraryItemToOrderDetail({
      id: 'i',
      entitlements: {
        keys: [{ id: 'k', keyIntegrationId: 'steam', gameKey: 'SYNTH-KEY' }]
      }
    })
    expect(
      (withValue?.tpkd_dict?.all_tpks?.[0] as Record<string, unknown>)
        .redeemed_key_val
    ).toBe('SYNTH-KEY')
    const flagOnly = libraryItemToOrderDetail({
      id: 'i',
      entitlements: {
        keys: [
          { id: 'k', keyIntegrationId: 'steam', redeemedAt: '$D2030-01-01' }
        ]
      }
    })
    expect(
      (flagOnly?.tpkd_dict?.all_tpks?.[0] as Record<string, unknown>)
        .redeemed_key_val
    ).toBe(true)
  })

  test('a revealed key is read from redemptionData.keyFormatted (gameKey is null); the value is never logged', () => {
    const order = libraryItemToOrderDetail({
      id: 'i',
      entitlements: {
        keys: [
          {
            id: 'k',
            keyIntegrationId: 'steam',
            gameKey: null,
            redeemedAt: '2030-01-01T00:00:00.000Z',
            redemptionExpiryDate: '$undefined',
            redemptionData: {
              keyFormatted: 'SYNTH-AAAAA-BBBBB',
              externalOrderStatus: null,
              externalAccountName: null
            }
          }
        ]
      }
    })
    const tpk = order?.tpkd_dict?.all_tpks?.[0] as Record<string, unknown>
    expect(tpk.redeemed_key_val).toBe('SYNTH-AAAAA-BBBBB')
    expect(tpk).not.toHaveProperty('expiry_date')
    for (const line of allLoggedStrings())
      expect(line).not.toContain('SYNTH-AAAAA-BBBBB')
    // unrevealed shape: keyFormatted null and redeemedAt null -> no value
    const unrevealed = libraryItemToOrderDetail({
      id: 'j',
      entitlements: {
        keys: [
          {
            id: 'k2',
            keyIntegrationId: 'steam',
            redeemedAt: null,
            redemptionData: { keyFormatted: null }
          }
        ]
      }
    })
    expect(
      unrevealed?.tpkd_dict?.all_tpks?.[0] as Record<string, unknown>
    ).not.toHaveProperty('redeemed_key_val')
  })

  test('download-only and group items yield zero keys; a non-object item is dropped', () => {
    expect(
      libraryItemToOrderDetail({
        id: 'd',
        itemType: 'entitlement-group',
        entitlements: { keys: [], downloads: [{ id: 'x' }] }
      })?.tpkd_dict?.all_tpks
    ).toEqual([])
    expect(libraryItemToOrderDetail('nope')).toBeNull()
    expect(libraryItemToOrderDetail({ title: 'no id' })).toBeNull()
  })
})

describe('getLibraryOrders', () => {
  const ACTION_ID = 'a'.repeat(42)
  let actionIds: HumbleActionIdCache
  const mockFetch = jest.fn()
  const realFetch = global.fetch

  const flight = (
    page: number,
    totalPages: number,
    ids: string[],
    totalDocs: number = ids.length
  ) =>
    `0:{"a":"$@1","f":"","b":"x"}\n1:${JSON.stringify({
      results: ids.map((id) => ({
        id,
        title: `T ${id}`,
        entitlements: {
          keys: [{ id: `${id}-k`, keyIntegrationId: 'steam', gameKey: null }]
        }
      })),
      bundlesCount: 0,
      pagination: { page, totalPages, totalDocs },
      success: true
    })}\n`

  const actionResponse = (
    body: string,
    status = 200,
    ct = 'text/x-component'
  ) =>
    ({
      status,
      headers: new Headers({ 'content-type': ct }),
      text: () => Promise.resolve(body)
    }) as unknown as Response

  // axios.get mock: the library HTML lists two chunks; only the second holds
  // the action id.
  function mockDiscovery() {
    mockGet.mockImplementation((url: string) => {
      if (url.endsWith('/home/library'))
        return Promise.resolve({
          status: 200,
          data: '<script src="/_next/static/chunks/aaa.js"></script><script src="/_next/static/chunks/bbb.js"></script>',
          headers: {}
        })
      if (url.endsWith('/bbb.js'))
        return Promise.resolve({
          status: 200,
          data: `x=createServerReference("${ACTION_ID}",e.callServer,void 0,e.findSourceMapURL,"filterUserLibrary")`
        })
      return Promise.resolve({ status: 200, data: 'nothing' })
    })
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    actionIds = createHumbleActionIdCache()
    mockFetch.mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
  })
  afterEach(() => {
    jest.useRealTimers()
    global.fetch = realFetch
  })

  async function run(cookie = 'ory_session_x=synthetic') {
    const p = getLibraryOrders(cookie, actionIds)
    await jest.runAllTimersAsync()
    return p
  }

  test('discovers the id once, walks every page, maps items, logs counts only', async () => {
    mockDiscovery()
    mockFetch
      .mockResolvedValueOnce(actionResponse(flight(1, 2, ['a', 'b'], 3)))
      .mockResolvedValueOnce(actionResponse(flight(2, 2, ['c'], 3)))

    const result = await run()

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.map((o) => o.gamekey)).toEqual(['a', 'b', 'c'])
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://www.humblebundle.com/home/library')
    expect(init.headers['Next-Action']).toBe(ACTION_ID)
    expect(init.headers.Cookie).toBe('ory_session_x=synthetic')
    expect(mockLogInfo.mock.calls.flat().join(' ')).toContain(
      'totalDocs=3 totalPages=2 pagesFetched=2 items=3'
    )
    for (const line of allLoggedStrings())
      expect(line).not.toContain('synthetic')
  })

  test('a second call reuses the cached id: no HTML/chunk fetches', async () => {
    mockDiscovery()
    mockFetch.mockResolvedValue(actionResponse(flight(1, 1, ['a'])))
    await run()
    mockGet.mockClear()

    const second = await run()

    expect(second.status).toBe('ok')
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockLogInfo.mock.calls.flat().join(' ')).toContain(
      'reusing cached filterUserLibrary action id'
    )
  })

  test('discovery fills the library slot of the owner and leaves the redeem slot empty (66.4-REVIEW CR-01)', async () => {
    mockDiscovery()
    mockFetch.mockResolvedValue(actionResponse(flight(1, 1, ['a'])))
    expect(actionIds.get('library')).toBeNull()

    await run()

    expect(actionIds.get('library')).toEqual({
      id: ACTION_ID,
      chunk: '/_next/static/chunks/bbb.js'
    })
    expect(actionIds.get('redeem')).toBeNull()
  })

  test("a fresh owner (a new boot) never reuses another boot's action id (66.4-REVIEW CR-01)", async () => {
    mockDiscovery()
    mockFetch.mockResolvedValue(actionResponse(flight(1, 1, ['a'])))
    await run() // owner A is primed
    mockGet.mockClear()
    const ownerA = actionIds
    actionIds = createHumbleActionIdCache()

    const result = await run() // owner B

    expect(result.status).toBe('ok')
    expect(mockGet).toHaveBeenCalled()
    expect(actionIds.get('library')?.id).toBe(ACTION_ID)
    expect(actionIds).not.toBe(ownerA)
  })

  test('a stale id (non-flight response) triggers exactly one re-discovery then succeeds', async () => {
    mockDiscovery()
    mockFetch.mockResolvedValueOnce(actionResponse(flight(1, 1, ['a'])))
    await run()
    mockGet.mockClear()
    mockFetch
      .mockResolvedValueOnce(
        actionResponse('<html>404</html>', 200, 'text/html')
      )
      .mockResolvedValueOnce(actionResponse(flight(1, 1, ['a'])))

    const result = await run()

    expect(result.status).toBe('ok')
    expect(
      mockGet.mock.calls.some((c) => String(c[0]).endsWith('/home/library'))
    ).toBe(true)
  })

  test('an undiscoverable id is a schema_error (not a throw)', async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        status: 200,
        data: url.endsWith('/home/library')
          ? '<script src="/_next/static/chunks/aaa.js"></script>'
          : 'nothing',
        headers: {}
      })
    )
    const result = await run()
    expect(result.status).toBe('schema_error')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('an unrecognised response shape is a schema_error', async () => {
    mockDiscovery()
    mockFetch.mockResolvedValue(actionResponse('0:{"a":"$@1"}\n1:{"nope":1}\n'))
    expect((await run()).status).toBe('schema_error')
  })

  test('401 -> session_expired; 403/429 -> access_denied; redirect to the auth host -> session_expired', async () => {
    mockDiscovery()
    mockFetch.mockResolvedValueOnce(actionResponse('', 401))
    expect((await run()).status).toBe('session_expired')
    actionIds = createHumbleActionIdCache()
    mockFetch.mockResolvedValueOnce(actionResponse('', 403))
    expect((await run()).status).toBe('access_denied')
    actionIds = createHumbleActionIdCache()
    mockFetch.mockResolvedValueOnce(actionResponse('', 429))
    expect((await run()).status).toBe('access_denied')
    actionIds = createHumbleActionIdCache()
    mockFetch.mockResolvedValueOnce({
      status: 307,
      headers: new Headers({
        location: 'https://auth.humblebundle.com/self-service/login/browser'
      }),
      text: () => Promise.resolve('')
    } as unknown as Response)
    expect((await run()).status).toBe('session_expired')
  })

  test('each page POST goes to /home/library?page=N (URL, Referer), names its FormData fields `_1_<field>` and requests a distinct page/cursor', async () => {
    mockDiscovery()
    mockFetch
      .mockResolvedValueOnce(actionResponse(flight(1, 3, ['a'])))
      .mockResolvedValueOnce(actionResponse(flight(2, 3, ['b'])))
      .mockResolvedValueOnce(actionResponse(flight(3, 3, ['c'])))

    await run()

    expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([
      'https://www.humblebundle.com/home/library',
      'https://www.humblebundle.com/home/library?page=2',
      'https://www.humblebundle.com/home/library?page=3'
    ])
    // The browser sends no Next-Url header.
    expect(mockFetch.mock.calls[1]?.[1].headers).not.toHaveProperty('Next-Url')
    expect(
      mockFetch.mock.calls[1]?.[1].headers['Next-Router-State-Tree']
    ).toContain('%22library%22')
    expect(mockFetch.mock.calls[1]?.[1].headers.Referer).toBe(
      'https://www.humblebundle.com/home/library?page=2'
    )
    const forms = mockFetch.mock.calls.map((c) => c[1].body as FormData)
    expect(forms.map((f) => f.get('_1_page'))).toEqual(['1', '2', '3'])
    expect(forms.map((f) => f.get('_1_cursor'))).toEqual(['5', '10', '15'])
    expect(forms[0]?.get('_1_limit')).toBe('5')
    expect(forms[0]?.get('0')).toContain('"$K1"')
    expect([...forms[0]!.keys()].filter((k) => k.startsWith('1_'))).toEqual([])
  })

  test('part 0 threads the previous page result as prevState (initial state on page 1); the carried value is never logged', async () => {
    mockDiscovery()
    const page1 = flight(1, 2, ['a'], 2).replace(
      '"gameKey":null',
      '"gameKey":null,"redemptionData":{"keyFormatted":"SYNTH-PREV-STATE"}'
    )
    mockFetch
      .mockResolvedValueOnce(actionResponse(page1))
      .mockResolvedValueOnce(actionResponse(flight(2, 2, ['b'], 2)))

    await run()

    const part0 = mockFetch.mock.calls.map((c) =>
      JSON.parse((c[1].body as FormData).get('0') as string)
    )
    expect(part0[0]).toEqual([
      {
        results: [],
        pagination: { page: 1, totalPages: 1, totalDocs: 0 },
        success: true
      },
      '$K1'
    ])
    expect(part0[1][1]).toBe('$K1')
    expect(part0[1][0].pagination.page).toBe(1)
    expect(part0[1][0].results[0].id).toBe('a')
    expect(JSON.stringify(part0[1][0])).toContain('SYNTH-PREV-STATE')
    for (const line of allLoggedStrings())
      expect(line).not.toContain('SYNTH-PREV-STATE')
  })

  test('root part "0" is the LAST multipart entry (load-bearing: first makes the server ignore every field)', async () => {
    mockDiscovery()
    mockFetch
      .mockResolvedValueOnce(actionResponse(flight(1, 2, ['a'], 2)))
      .mockResolvedValueOnce(actionResponse(flight(2, 2, ['b'], 2)))

    await run()

    for (const call of mockFetch.mock.calls) {
      const keys = [...(call[1].body as FormData).keys()]
      expect(keys[keys.length - 1]).toBe('0')
      expect(keys.slice(0, -1).every((k) => k.startsWith('_1_'))).toBe(true)
    }
  })

  test('prevState mirrors the browser re-encode: "$undefined" keys dropped; requestId = previous + 1', async () => {
    mockDiscovery()
    const page1 = flight(1, 2, ['a'], 2).replace(
      '"gameKey":null',
      '"gameKey":null,"redemptionExpiryDate":"$undefined"'
    )
    mockFetch
      .mockResolvedValueOnce(actionResponse(page1))
      .mockResolvedValueOnce(actionResponse(flight(2, 2, ['b'], 2)))

    await run()

    const [first, second] = mockFetch.mock.calls.map(
      (c) => c[1].body as FormData
    )
    expect(first?.get('_1_requestId')).toBe('1')
    const state = JSON.parse(second?.get('0') as string)[0]
    expect(JSON.stringify(state)).not.toContain('$undefined')
    expect(JSON.stringify(state)).not.toContain('redemptionExpiryDate')
    // flight() echoes requestId "x"-less rows, so the previous value is absent
    // and the counter restarts at 1; with an echoed numeric id it increments.
    expect(second?.get('_1_requestId')).toBe('1')
  })

  test('requestId increments from the previous state requestId', async () => {
    mockDiscovery()
    const withId = (txt: string, id: string) =>
      txt.replace('"success":true', `"success":true,"requestId":"${id}"`)
    mockFetch
      .mockResolvedValueOnce(
        actionResponse(withId(flight(1, 2, ['a'], 2), '2'))
      )
      .mockResolvedValueOnce(actionResponse(flight(2, 2, ['b'], 2)))

    await run()

    const second = mockFetch.mock.calls[1]?.[1].body as FormData
    expect(second.get('_1_requestId')).toBe('3')
  })

  test('a server that ignores paging (re-serves page 1) is a schema_error, never a partial library', async () => {
    mockDiscovery()
    mockFetch.mockResolvedValue(actionResponse(flight(1, 3, ['a', 'b'])))
    expect((await run()).status).toBe('schema_error')
    expect(mockLogWarning.mock.calls.flat().join(' ')).toContain(
      'paging not honored'
    )
  })

  test('fewer unique items than totalDocs is a schema_error (incomplete library)', async () => {
    mockDiscovery()
    mockFetch
      .mockResolvedValueOnce(actionResponse(flight(1, 2, ['a'], 10)))
      .mockResolvedValueOnce(actionResponse(flight(2, 2, ['b'], 10)))
    // totalDocs says 10, but only 2 ids exist.
    expect((await run()).status).toBe('schema_error')
    expect(mockLogWarning.mock.calls.flat().join(' ')).toContain('incomplete')
  })

  test('a 5xx or network failure THROWS (transient) and returns no partial data', async () => {
    mockDiscovery()
    mockFetch
      .mockResolvedValueOnce(actionResponse(flight(1, 2, ['a'])))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
    const p = getLibraryOrders('ory_session_x=synthetic', actionIds)
    const settled = p.then(
      () => 'resolved',
      (e: Error) => e.message
    )
    await jest.runAllTimersAsync()
    expect(await settled).toBe('ECONNRESET')
  })

  test('a runaway totalPages is capped with a schema_error', async () => {
    mockDiscovery()
    let n = 0
    mockFetch.mockImplementation(() => {
      n += 1
      return Promise.resolve(
        actionResponse(flight(n, 100000, [`x${n}`], 100000))
      )
    })
    expect((await run()).status).toBe('schema_error')
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(200)
  })
})

describe('revealKey', () => {
  const ACTION_ID = 'b'.repeat(42)
  let actionIds: HumbleActionIdCache
  const GAMEKEY = 'gamekey-reveal-xyz'
  const KEY_ID = 'somegame_steam'
  const FAKE_KEY = 'AAAAA-BBBBB-CCCCC'
  const COOKIE = 'ory_session_x=synthetic'
  const mockFetch = jest.fn()
  const realFetch = global.fetch

  const params = () => ({
    gamekey: GAMEKEY,
    machineName: KEY_ID,
    keyindex: 'steam'
  })

  const actionResponse = (
    body: string,
    status = 200,
    ct = 'text/x-component'
  ) =>
    ({
      status,
      headers: new Headers({ 'content-type': ct }),
      text: () => Promise.resolve(body)
    }) as unknown as Response

  const flightResult = (result: unknown) =>
    `0:{"a":"$@1","f":"","b":"x"}\n1:${JSON.stringify(result)}\n`

  function mockDiscovery() {
    mockGet.mockImplementation((url: string) => {
      if (url.endsWith(`/home/library/${GAMEKEY}`))
        return Promise.resolve({
          status: 200,
          data: '<script src="/_next/static/chunks/aaa.js"></script>',
          headers: {}
        })
      if (url.endsWith('/aaa.js'))
        return Promise.resolve({
          status: 200,
          data: `x=createServerReference("${ACTION_ID}",e.callServer,void 0,e.findSourceMapURL,"redeemEntitlementAction")`
        })
      return Promise.resolve({ status: 200, data: 'nothing' })
    })
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    actionIds = createHumbleActionIdCache()
    mockFetch.mockReset()
    mockGet.mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
    mockDiscovery()
  })
  afterEach(() => {
    jest.useRealTimers()
    global.fetch = realFetch
  })

  async function run() {
    const p = revealKey(COOKIE, actionIds, params())
    await jest.runAllTimersAsync()
    return p
  }

  test('{success:true, key} -> ok; posts [keyId, integrationId, $undefined] with the Next-Action id', async () => {
    mockFetch.mockResolvedValueOnce(
      actionResponse(flightResult({ success: true, key: FAKE_KEY }))
    )
    const result = await run()
    expect(result).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/home/library/${GAMEKEY}`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual([
      KEY_ID,
      'steam',
      '$undefined'
    ])
    expect((init.headers as Record<string, string>)['Next-Action']).toBe(
      ACTION_ID
    )
  })

  test('a reveal writes only the redeem slot; a fresh owner re-discovers (66.4-REVIEW CR-01)', async () => {
    mockFetch.mockResolvedValue(
      actionResponse(flightResult({ success: true, key: FAKE_KEY }))
    )
    await run()
    expect(actionIds.get('redeem')?.id).toBe(ACTION_ID)
    expect(actionIds.get('library')).toBeNull()
    mockGet.mockClear()
    actionIds = createHumbleActionIdCache()

    expect(await run()).toEqual({ status: 'ok', data: { key: FAKE_KEY } })

    expect(mockGet).toHaveBeenCalled()
  })

  test('{success:false, errorKind} -> rejected_by_server, errorKind logged, key never logged', async () => {
    mockFetch.mockResolvedValueOnce(
      actionResponse(
        flightResult({ success: false, errorKind: 'already_owned' })
      )
    )
    expect(await run()).toEqual({ status: 'rejected_by_server' })
    expect(allLoggedStrings().join('\n')).toContain('already_owned')
  })

  test('success without a key -> schema_error', async () => {
    mockFetch.mockResolvedValueOnce(
      actionResponse(flightResult({ success: true }))
    )
    expect((await run()).status).toBe('schema_error')
  })

  test('success logs never contain the key or cookie', async () => {
    mockFetch.mockResolvedValueOnce(
      actionResponse(flightResult({ success: true, key: FAKE_KEY }))
    )
    await run()
    const logged = allLoggedStrings().join('\n')
    expect(logged).not.toContain(FAKE_KEY)
    expect(logged).not.toContain('synthetic')
  })

  test('a cached action id that goes stale is re-discovered once, then reveals', async () => {
    mockFetch.mockResolvedValueOnce(
      actionResponse(flightResult({ success: true, key: FAKE_KEY }))
    )
    await run() // primes the cache
    mockFetch
      .mockResolvedValueOnce(actionResponse('Server action not found', 404))
      .mockResolvedValueOnce(
        actionResponse(flightResult({ success: true, key: FAKE_KEY }))
      )
    expect(await run()).toEqual({ status: 'ok', data: { key: FAKE_KEY } })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  test('a freshly discovered action id that is rejected as stale fails', async () => {
    mockFetch.mockResolvedValueOnce(
      actionResponse('Server action not found', 404)
    )
    expect((await run()).status).toBe('schema_error')
  })

  test('401 -> session_expired, 403 -> access_denied', async () => {
    mockFetch.mockResolvedValueOnce(actionResponse('', 401))
    expect((await run()).status).toBe('session_expired')
    actionIds = createHumbleActionIdCache()
    mockFetch.mockResolvedValueOnce(actionResponse('', 403))
    expect((await run()).status).toBe('access_denied')
  })

  test('5xx throws (transient/ambiguous)', async () => {
    mockFetch.mockResolvedValueOnce(actionResponse('', 502))
    const p = revealKey(COOKIE, actionIds, params())
    const assertion = expect(p).rejects.toThrow()
    await jest.runAllTimersAsync()
    await assertion
  })

  test('unrecognised body -> schema_error', async () => {
    mockFetch.mockResolvedValueOnce(actionResponse('0:{"a":"$@1"}\n'))
    expect((await run()).status).toBe('schema_error')
  })
})
