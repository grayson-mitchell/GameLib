/**
 * Unit tests for platformCapture.ts — D-01/D-02/D-03/D-04 bulk PICS platform
 * capture (Phase 34.15, Plan 01).
 *
 * Mock strategy (mirrors library.test.ts / games.test.ts in this directory):
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in the Backend jest.config means all mock
 *    implementations must be re-established per describe/beforeEach
 */

import {
  parseOslistPlatforms,
  mergePlatformCapture,
  captureOwnedAppPlatforms,
  withPlatformCaptureLock,
  CapturedPlatforms,
  PlatformCapturePicsClient
} from '../platformCapture'
import { steamMetadataStore } from '../electronStores'
import { STEAM_PICS_BULK_TIMEOUT_MS } from '../withTimeout'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('../electronStores', () => ({
  steamMetadataStore: {
    get: jest.fn(),
    set: jest.fn(),
    entries: jest.fn()
  }
}))

const mockedGet = steamMetadataStore.get as jest.Mock
const mockedSet = steamMetadataStore.set as jest.Mock

// ── parseOslistPlatforms (Task 1) ────────────────────────────────────────────

describe('parseOslistPlatforms', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace-only string', '   '],
    ['a number', 42]
  ])('returns null for %s', (_name, input) => {
    expect(parseOslistPlatforms(input)).toBeNull()
  })

  it('returns null for a string of only unrecognised tokens', () => {
    expect(parseOslistPlatforms('unknowntoken')).toBeNull()
  })

  it("'unknowntoken,linux' -> linux only (unrecognised token does not block a real one)", () => {
    expect(
      parseOslistPlatforms('unknowntoken,linux')
    ).toEqual<CapturedPlatforms>({
      is_windows_native: false,
      is_mac_native: false,
      is_linux_native: true
    })
  })

  it("'windows' -> windows only", () => {
    expect(parseOslistPlatforms('windows')).toEqual<CapturedPlatforms>({
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })
  })

  it("'windows,linux' -> windows + linux", () => {
    expect(parseOslistPlatforms('windows,linux')).toEqual<CapturedPlatforms>({
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: true
    })
  })

  it("'windows,macos,linux' -> all three", () => {
    expect(
      parseOslistPlatforms('windows,macos,linux')
    ).toEqual<CapturedPlatforms>({
      is_windows_native: true,
      is_mac_native: true,
      is_linux_native: true
    })
  })

  it("'macos' -> mac only", () => {
    expect(parseOslistPlatforms('macos')).toEqual<CapturedPlatforms>({
      is_windows_native: false,
      is_mac_native: true,
      is_linux_native: false
    })
  })

  it("'osx' (legacy synonym) -> is_mac_native: true", () => {
    const result = parseOslistPlatforms('osx')
    expect(result).not.toBeNull()
    expect(result?.is_mac_native).toBe(true)
    expect(result?.is_windows_native).toBe(false)
    expect(result?.is_linux_native).toBe(false)
  })

  it("' Windows , MacOS ' (whitespace + case) -> windows + mac", () => {
    expect(
      parseOslistPlatforms(' Windows , MacOS ')
    ).toEqual<CapturedPlatforms>({
      is_windows_native: true,
      is_mac_native: true,
      is_linux_native: false
    })
  })

  describe('non-vacuity: the "write nothing" branch is not vacuous', () => {
    /** Saboteur: the shape this module must NEVER become — treats an
     *  absent/empty oslist as "every platform available" instead of "write
     *  nothing". Proves the real function's null-on-empty branch actually
     *  discriminates rather than being an untested no-op. */
    function treatsAbsentAsAvailable(oslist: unknown): CapturedPlatforms {
      if (typeof oslist === 'string' && oslist.trim().length > 0) {
        return (
          parseOslistPlatforms(oslist) ?? {
            is_windows_native: true,
            is_mac_native: true,
            is_linux_native: true
          }
        )
      }
      return {
        is_windows_native: true,
        is_mac_native: true,
        is_linux_native: true
      }
    }

    it('the saboteur DISAGREES with the real function on an empty string', () => {
      const sabotaged = treatsAbsentAsAvailable('')
      const real = parseOslistPlatforms('')

      expect(sabotaged).toEqual<CapturedPlatforms>({
        is_windows_native: true,
        is_mac_native: true,
        is_linux_native: true
      })
      expect(real).toBeNull()
    })
  })
})

// ── mergePlatformCapture (Task 2, D-02) ──────────────────────────────────────

describe('mergePlatformCapture (D-02)', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedSet.mockReset()
  })

  it('carries forward every existing field individually while writing the three new flags + platformsCaptured', () => {
    mockedGet.mockReturnValue({
      art_cover: 'https://example.test/cover.jpg',
      art_square: 'https://example.test/square.jpg',
      extra: { about: { description: 'x', shortDescription: 'y' }, genres: [] },
      mac_arch: '64',
      mac_arch_verified: true,
      mac_arch_source: 'macho',
      forcedWindowsViaBottle: true,
      is_delisted: false
    })

    mergePlatformCapture('123', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: true
    })

    expect(mockedSet).toHaveBeenCalledTimes(1)
    const [, written] = mockedSet.mock.calls[0]

    expect(written.art_cover).toBe('https://example.test/cover.jpg')
    expect(written.art_square).toBe('https://example.test/square.jpg')
    expect(written.extra).toEqual({
      about: { description: 'x', shortDescription: 'y' },
      genres: []
    })
    expect(written.is_delisted).toBe(false)
    expect(written.mac_arch).toBe('64')
    expect(written.mac_arch_verified).toBe(true)
    expect(written.mac_arch_source).toBe('macho')
    expect(written.forcedWindowsViaBottle).toBe(true)

    expect(written.is_windows_native).toBe(true)
    expect(written.is_mac_native).toBe(false)
    expect(written.is_linux_native).toBe(true)
    expect(written.platformsCaptured).toBe(true)
  })

  it('with NO existing entry, the write still succeeds with the three flags + platformsCaptured, and does not invent mac_arch', () => {
    mockedGet.mockReturnValue(undefined)

    mergePlatformCapture('456', {
      is_windows_native: true,
      is_mac_native: true,
      is_linux_native: false
    })

    expect(mockedSet).toHaveBeenCalledTimes(1)
    const [key, written] = mockedSet.mock.calls[0]

    expect(key).toBe('456')
    expect(written.is_windows_native).toBe(true)
    expect(written.is_mac_native).toBe(true)
    expect(written.is_linux_native).toBe(false)
    expect(written.platformsCaptured).toBe(true)
    expect(written.mac_arch).toBeUndefined()
  })

  it('wholesaleSet saboteur: a wholesale set() with only the new fields DROPS forcedWindowsViaBottle, while the real writer preserves it', () => {
    const existing = {
      forcedWindowsViaBottle: true,
      mac_arch: '64' as const
    }
    mockedGet.mockReturnValue(existing)

    /** Saboteur: the exact anti-pattern D-02/T-34.15-01-02 forbids — writes
     *  ONLY the new fields, discarding everything else on the entry. */
    function wholesaleSet(appId: string, platforms: CapturedPlatforms): void {
      steamMetadataStore.set(appId, {
        ...platforms,
        platformsCaptured: true
      } as never)
    }

    wholesaleSet('789', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })
    const [, sabotagedWrite] = mockedSet.mock.calls[0]
    expect(sabotagedWrite.forcedWindowsViaBottle).toBeUndefined()

    mockedSet.mockReset()
    mockedGet.mockReturnValue(existing)

    mergePlatformCapture('789', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })
    const [, realWrite] = mockedSet.mock.calls[0]
    expect(realWrite.forcedWindowsViaBottle).toBe(true)
  })

  // ── Quick task 260816-qcn: freshest-write-wins precedence ────────────────

  it('QCN-01: an accepted merge stamps platformsSource "pics" and a numeric platformsCapturedAt', () => {
    mockedGet.mockReturnValue(undefined)

    mergePlatformCapture('111', {
      is_windows_native: true,
      is_mac_native: true,
      is_linux_native: false
    })

    expect(mockedSet).toHaveBeenCalledTimes(1)
    const [, written] = mockedSet.mock.calls[0]
    expect(written.platformsSource).toBe('pics')
    expect(typeof written.platformsCapturedAt).toBe('number')
  })

  it('QCN-01: declines to overwrite an entry carrying a strictly newer, complete appdetails capture -- no .set() call at all', () => {
    mockedGet.mockReturnValue({
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: true,
      platformsSource: 'appdetails',
      platformsCapturedAt: Date.now() + 60_000
    })

    mergePlatformCapture('222', {
      is_windows_native: false,
      is_mac_native: true,
      is_linux_native: false
    })

    expect(mockedSet).not.toHaveBeenCalled()
  })

  it('QCN-01: accepts and flips platformsSource to "pics" when the existing capture is older, preserving all eight carry-forwards', () => {
    mockedGet.mockReturnValue({
      art_cover: 'https://example.test/cover.jpg',
      art_square: 'https://example.test/square.jpg',
      extra: { about: { description: 'x', shortDescription: 'y' }, genres: [] },
      is_delisted: false,
      mac_arch: '64',
      mac_arch_verified: true,
      mac_arch_source: 'macho',
      forcedWindowsViaBottle: true,
      is_windows_native: false,
      is_mac_native: false,
      is_linux_native: false,
      platformsSource: 'appdetails',
      platformsCapturedAt: Date.now() - 60_000
    })

    mergePlatformCapture('333', {
      is_windows_native: true,
      is_mac_native: true,
      is_linux_native: false
    })

    expect(mockedSet).toHaveBeenCalledTimes(1)
    const [, written] = mockedSet.mock.calls[0]
    expect(written.is_windows_native).toBe(true)
    expect(written.is_mac_native).toBe(true)
    expect(written.is_linux_native).toBe(false)
    expect(written.platformsSource).toBe('pics')
    expect(written.art_cover).toBe('https://example.test/cover.jpg')
    expect(written.art_square).toBe('https://example.test/square.jpg')
    expect(written.extra).toEqual({
      about: { description: 'x', shortDescription: 'y' },
      genres: []
    })
    expect(written.is_delisted).toBe(false)
    expect(written.mac_arch).toBe('64')
    expect(written.mac_arch_verified).toBe(true)
    expect(written.mac_arch_source).toBe('macho')
    expect(written.forcedWindowsViaBottle).toBe(true)
  })

  it('QCN-01: a legacy entry with no platformsCapturedAt is writable', () => {
    mockedGet.mockReturnValue({
      platformsCaptured: true,
      is_windows_native: false
    })

    mergePlatformCapture('444', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })

    expect(mockedSet).toHaveBeenCalledTimes(1)
  })

  // ── WR-01: mergePlatformCapture reports its own outcome ──────────────────

  it('WR-01: returns true when the write is genuinely persisted', () => {
    mockedGet.mockReturnValue(undefined)

    const result = mergePlatformCapture('555', {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: false
    })

    expect(result).toBe(true)
    expect(mockedSet).toHaveBeenCalledTimes(1)
  })

  it('WR-01: returns false (not true) when resolvePlatformWrite declines the write -- no .set() call', () => {
    mockedGet.mockReturnValue({
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: true,
      platformsSource: 'appdetails',
      platformsCapturedAt: Date.now() + 60_000
    })

    const result = mergePlatformCapture('666', {
      is_windows_native: false,
      is_mac_native: true,
      is_linux_native: false
    })

    expect(result).toBe(false)
    expect(mockedSet).not.toHaveBeenCalled()
  })
})

// ── captureOwnedAppPlatforms (Task 3, D-03/D-04) ─────────────────────────────

describe('captureOwnedAppPlatforms (D-03/D-04)', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedSet.mockReset()
    jest.useRealTimers()
  })

  function capturedEntry(isWindowsNative: boolean) {
    return { platformsCaptured: true, is_windows_native: isWindowsNative }
  }

  it('D-04 scoping: excludes already-captured appIds from the getProductInfo argument array', async () => {
    mockedGet.mockImplementation((appId: string) => {
      if (appId === '1') return capturedEntry(true)
      return undefined
    })

    const getProductInfo = jest.fn().mockResolvedValue({ apps: {} })
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppPlatforms(client, [1, 2, 3])

    expect(getProductInfo).toHaveBeenCalledTimes(1)
    expect(getProductInfo).toHaveBeenCalledWith([2, 3], [], true)
    expect(result.scopedCount).toBe(2)
  })

  it('zero-scope short-circuit: all captured -> getProductInfo is not called at all', async () => {
    mockedGet.mockReturnValue(capturedEntry(false))

    const getProductInfo = jest.fn()
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppPlatforms(client, [1, 2])

    expect(getProductInfo).not.toHaveBeenCalled()
    expect(result).toEqual({
      scopedCount: 0,
      capturedCount: 0,
      skippedCount: 0,
      failed: false
    })
  })

  it('zero chunking: 500 uncaptured ids -> getProductInfo called exactly ONCE with all 500', async () => {
    mockedGet.mockReturnValue(undefined)
    const ids = Array.from({ length: 500 }, (_, i) => i + 1)

    const getProductInfo = jest.fn().mockResolvedValue({ apps: {} })
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppPlatforms(client, ids)

    expect(getProductInfo).toHaveBeenCalledTimes(1)
    expect(getProductInfo).toHaveBeenCalledWith(ids, [], true)
    expect(result.scopedCount).toBe(500)
    expect(result.skippedCount).toBe(500)
  })

  it('missing entry / unknownApps / missing appinfo / missing common / empty oslist all skip without throwing or writing', async () => {
    mockedGet.mockReturnValue(undefined)

    const getProductInfo = jest.fn().mockResolvedValue({
      apps: {
        // 1: missing entirely from `apps`
        2: { appinfo: {} }, // missing common
        3: { appinfo: { common: {} } }, // missing oslist
        4: { appinfo: { common: { oslist: '' } } }, // empty oslist
        5: { appinfo: { common: { oslist: 'windows' } } } // in unknownApps below
      },
      unknownApps: [5]
    })
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppPlatforms(client, [1, 2, 3, 4, 5])

    expect(mockedSet).not.toHaveBeenCalled()
    expect(result.skippedCount).toBe(5)
    expect(result.capturedCount).toBe(0)
    expect(result.failed).toBe(false)
  })

  it('a well-formed entry is captured via mergePlatformCapture', async () => {
    mockedGet.mockReturnValue(undefined)

    const getProductInfo = jest.fn().mockResolvedValue({
      apps: {
        7: { appinfo: { common: { oslist: 'windows,linux' } } }
      }
    })
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppPlatforms(client, [7])

    expect(mockedSet).toHaveBeenCalledTimes(1)
    const [key, written] = mockedSet.mock.calls[0]
    expect(key).toBe('7')
    expect(written.is_windows_native).toBe(true)
    expect(written.is_linux_native).toBe(true)
    expect(written.platformsCaptured).toBe(true)
    expect(result.capturedCount).toBe(1)
    expect(result.skippedCount).toBe(0)
  })

  it('WR-01: a precedence-declined merge during the bulk loop is NOT counted as captured -- lands in skippedCount instead', async () => {
    let getCallCount = 0
    mockedGet.mockImplementation(() => {
      getCallCount += 1
      if (getCallCount === 1) {
        // Scoping snapshot: appId 1 had no captured signal yet, so it is
        // included in `scoped`.
        return undefined
      }
      // By the time mergePlatformCapture's own read runs, a concurrent
      // per-game appdetails write has already landed a strictly newer,
      // complete capture for this appId -- the exact race WR-01 describes
      // (a concurrent writer lands between the PICS response arriving and
      // this loop reaching the id). resolvePlatformWrite must decline.
      return {
        is_windows_native: true,
        is_mac_native: false,
        is_linux_native: true,
        platformsSource: 'appdetails',
        platformsCapturedAt: Date.now() + 60_000
      }
    })

    const getProductInfo = jest.fn().mockResolvedValue({
      apps: {
        1: { appinfo: { common: { oslist: 'windows,linux' } } }
      }
    })
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppPlatforms(client, [1])

    // The declined merge must never call .set() and must never be counted
    // as "captured" -- pre-fix, capturedCount incremented unconditionally
    // after mergePlatformCapture() regardless of whether it actually wrote.
    expect(mockedSet).not.toHaveBeenCalled()
    expect(result.scopedCount).toBe(1)
    expect(result.capturedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
  })

  it('fail-soft on rejection: a rejecting getProductInfo resolves to failed:true, never throws, and never writes', async () => {
    mockedGet.mockReturnValue(undefined)

    const getProductInfo = jest
      .fn()
      .mockRejectedValue(new Error('CM socket dropped'))
    const client: PlatformCapturePicsClient = { getProductInfo }

    const result = await captureOwnedAppPlatforms(client, [1])

    expect(result.failed).toBe(true)
    expect(mockedSet).not.toHaveBeenCalled()
  })

  it('fail-soft on timeout: a never-settling getProductInfo resolves to failed:true after STEAM_PICS_BULK_TIMEOUT_MS, never throws', async () => {
    mockedGet.mockReturnValue(undefined)
    jest.useFakeTimers()

    const getProductInfo = jest.fn().mockReturnValue(new Promise(() => {}))
    const client: PlatformCapturePicsClient = { getProductInfo }

    const resultPromise = captureOwnedAppPlatforms(client, [1])
    await jest.advanceTimersByTimeAsync(STEAM_PICS_BULK_TIMEOUT_MS)
    const result = await resultPromise

    expect(result.failed).toBe(true)
    expect(mockedSet).not.toHaveBeenCalled()

    jest.useRealTimers()
  })

  it('34.15-09 reconciliation (D-07 finding #2): fail-soft even when the depotSignalCaptured/steamMetadataStore.get FILTER STEP itself throws -- never getProductInfo, proving the try/catch now covers the filter, not just the PICS call', async () => {
    mockedGet.mockImplementation(() => {
      throw new Error('store read exploded')
    })

    const getProductInfo = jest.fn()
    const client: PlatformCapturePicsClient = { getProductInfo }

    // Must not reject -- a rejection here is exactly the unhandled-rejection
    // hole D-07 exists to close, since library.ts's call site has no
    // try/catch of its own around this call.
    const result = await captureOwnedAppPlatforms(client, [1, 2])

    expect(result.failed).toBe(true)
    expect(result.capturedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    // The PICS call must never be reached -- the throw happened during
    // scoping, before there was anything to fetch.
    expect(getProductInfo).not.toHaveBeenCalled()
    expect(mockedSet).not.toHaveBeenCalled()
  })

  // ── Quick task 260816-qcn (D-C): serialised bulk critical section ────────

  it("QCN-01 serialisation: two concurrent captureOwnedAppPlatforms calls for the same appIds issue exactly ONE getProductInfo -- the second observes the first's writes and scopes to zero", async () => {
    // A real in-memory store (not a jest.fn() returning a fixed value) so
    // writes from the first call are actually visible to the second call's
    // scoping filter -- without the lock, the second run would scope BOTH
    // ids and re-write, the exact F-2 shape (34.15 D-16 UAT finding) this
    // proves impossible.
    const store = new Map<string, unknown>()
    mockedGet.mockImplementation((appId: string) => store.get(appId))
    mockedSet.mockImplementation((appId: string, value: unknown) => {
      store.set(appId, value)
    })

    let resolveDeferred: (value: {
      apps: Record<number, { appinfo: unknown }>
    }) => void = () => {}
    const deferred = new Promise<{
      apps: Record<number, { appinfo: unknown }>
    }>((resolve) => {
      resolveDeferred = resolve
    })
    const getProductInfo = jest.fn().mockReturnValue(deferred)
    const client: PlatformCapturePicsClient = { getProductInfo }

    const first = captureOwnedAppPlatforms(client, [1, 2])
    const second = captureOwnedAppPlatforms(client, [1, 2])

    resolveDeferred({
      apps: {
        1: { appinfo: { common: { oslist: 'windows' } } },
        2: { appinfo: { common: { oslist: 'linux' } } }
      }
    })

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(getProductInfo).toHaveBeenCalledTimes(1)
    expect(firstResult.scopedCount).toBe(2)
    expect(secondResult.scopedCount).toBe(0)
  })

  it('QCN-01 lock does not wedge: a throwing locked section still lets the NEXT section run', async () => {
    await expect(
      withPlatformCaptureLock(async () => {
        throw new Error('x')
      })
    ).rejects.toThrow('x')

    const result = await withPlatformCaptureLock(async () => 'ok')
    expect(result).toBe('ok')
  })

  it('QCN-01 fail-soft with the lock in place: a captureOwnedAppPlatforms call made immediately after a failing one still resolves (no rejection, no wedge)', async () => {
    mockedGet.mockReturnValue(undefined)

    const failingClient: PlatformCapturePicsClient = {
      getProductInfo: jest
        .fn()
        .mockRejectedValue(new Error('CM socket dropped'))
    }
    const healthyClient: PlatformCapturePicsClient = {
      getProductInfo: jest.fn().mockResolvedValue({ apps: {} })
    }

    const failing = captureOwnedAppPlatforms(failingClient, [1])
    const healthy = captureOwnedAppPlatforms(healthyClient, [2])

    const [failingResult, healthyResult] = await Promise.all([failing, healthy])

    expect(failingResult.failed).toBe(true)
    expect(healthyResult.failed).toBe(false)
  })
})
