/**
 * Unit tests for the persisted bridge verdict field family (Phase 51 Plan
 * 03, D-51-07/D-51-10).
 *
 * `steamMetadataStore` is faked with a real, stateful in-memory Map defined
 * INSIDE the jest.mock factory (not a bare per-call jest.fn() mockReturnValue,
 * platformCapture.test.ts's precedent) -- the behavior under test IS a
 * read-modify-write round trip (writeBridgeScanVerdict then
 * readBridgeVerdict; two sequential writes preserving each other's
 * sibling fields), which a stateless mock cannot model.
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('../../electronStores', () => {
  const backing = new Map<string, unknown>()
  return {
    steamMetadataStore: {
      get: (appId: string) => backing.get(appId),
      set: (appId: string, value: unknown) => {
        backing.set(appId, value)
      },
      __resetForTests: () => backing.clear()
    }
  }
})

import { logInfo, logWarning } from 'backend/logger'
import { steamMetadataStore } from '../../electronStores'
import type { SteamBridgeScanVerdict } from '../../electronStores'
import {
  readBridgeVerdict,
  writeBridgeScanVerdict,
  clearBridgeScanVerdict,
  setBridgeSteamApiPrescreen,
  setBridgeUserRoute,
  setBridgeNoticeAcknowledged,
  markBridgeLimitedNoticeShown,
  setBridgeIdentityFallback,
  writeBridgeDrmVerdict
} from '../bridgeVerdict'

const mockedStore = steamMetadataStore as unknown as {
  get: (appId: string) => Record<string, unknown> | undefined
  set: (appId: string, value: unknown) => void
  __resetForTests: () => void
}
const mockedLogWarning = logWarning as jest.Mock
const mockedLogInfo = logInfo as jest.Mock

const APP_ID = '63000'
const NON_NUMERIC_APP_ID = 'not-numeric'

function makeScanVerdict(
  overrides?: Partial<SteamBridgeScanVerdict>
): SteamBridgeScanVerdict {
  return {
    status: 'miss',
    arch: 'x86',
    missingSymbols: ['SteamUtils'],
    interfaceVersions: { SteamUtils: 'SteamUtils005' },
    stubbedInterfaces: [],
    shimExportSetVersion: 'abc123def456',
    scannedAt: '2026-10-17T00:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  mockedStore.__resetForTests()
  jest.clearAllMocks()
})

describe('writeBridgeScanVerdict', () => {
  it('keeps every prior field (art/forcedWindowsViaBottle) and sets bridge.scan', () => {
    mockedStore.set(APP_ID, {
      art_cover: 'cover.jpg',
      art_square: 'square.jpg',
      extra: { reqs: [] },
      forcedWindowsViaBottle: true
    })

    writeBridgeScanVerdict(APP_ID, makeScanVerdict())

    const stored = mockedStore.get(APP_ID) as Record<string, unknown>
    expect(stored.art_cover).toBe('cover.jpg')
    expect(stored.art_square).toBe('square.jpg')
    expect(stored.forcedWindowsViaBottle).toBe(true)
    expect(stored.bridge).toEqual({ scan: makeScanVerdict() })
  })

  it('a second write replaces bridge.scan but keeps bridge.userRoute', () => {
    writeBridgeScanVerdict(APP_ID, makeScanVerdict())
    setBridgeUserRoute(APP_ID, 'bottle')

    writeBridgeScanVerdict(
      APP_ID,
      makeScanVerdict({ status: 'clean', missingSymbols: [] })
    )

    const verdict = readBridgeVerdict(APP_ID)
    expect(verdict?.scan?.status).toBe('clean')
    expect(verdict?.scan?.missingSymbols).toEqual([])
    expect(verdict?.userRoute).toBe('bottle')
  })

  it('rejects a non-numeric appId without touching the store', () => {
    writeBridgeScanVerdict(NON_NUMERIC_APP_ID, makeScanVerdict())

    expect(mockedStore.get(NON_NUMERIC_APP_ID)).toBeUndefined()
    expect(mockedLogWarning).toHaveBeenCalled()
  })
})

describe('setBridgeUserRoute', () => {
  it('persists the user override; readBridgeVerdict reflects it', () => {
    setBridgeUserRoute(APP_ID, 'bottle')

    expect(readBridgeVerdict(APP_ID)?.userRoute).toBe('bottle')
  })

  it('removes the key entirely when passed undefined', () => {
    setBridgeUserRoute(APP_ID, 'bottle')
    setBridgeUserRoute(APP_ID, undefined)

    const verdict = readBridgeVerdict(APP_ID)
    expect(verdict?.userRoute).toBeUndefined()
    expect(verdict ? 'userRoute' in verdict : false).toBe(false)
  })

  it('rejects a non-numeric appId without touching the store', () => {
    setBridgeUserRoute(NON_NUMERIC_APP_ID, 'bridge')

    expect(mockedStore.get(NON_NUMERIC_APP_ID)).toBeUndefined()
  })
})

describe('writers on an appId with no prior entry', () => {
  it('create a minimal entry (library.ts:884 precedent) and log once', () => {
    setBridgeIdentityFallback(APP_ID, true)

    const stored = mockedStore.get(APP_ID) as Record<string, unknown>
    expect(stored.art_cover).toBe('')
    expect(stored.art_square).toBe('')
    expect(stored.extra).toEqual({ reqs: [] })
    expect(
      (stored.bridge as { identityFallback: boolean }).identityFallback
    ).toBe(true)
    expect(mockedLogInfo).toHaveBeenCalledTimes(1)
  })
})

describe('readBridgeVerdict: fail-safe on a malformed stored value', () => {
  it('returns undefined and logs a warning when scan.missingSymbols is not an array', () => {
    mockedStore.set(APP_ID, {
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      bridge: {
        scan: {
          ...makeScanVerdict(),
          missingSymbols: 'SteamUtils' // malformed: should be an array
        }
      }
    })

    expect(readBridgeVerdict(APP_ID)).toBeUndefined()
    expect(mockedLogWarning).toHaveBeenCalled()
  })

  it('returns undefined for a non-numeric appId, never throws', () => {
    expect(() => readBridgeVerdict(NON_NUMERIC_APP_ID)).not.toThrow()
    expect(readBridgeVerdict(NON_NUMERIC_APP_ID)).toBeUndefined()
  })

  it('returns undefined when no entry exists at all', () => {
    expect(readBridgeVerdict('999999999')).toBeUndefined()
  })

  it('returns undefined when an entry exists but has no bridge field', () => {
    mockedStore.set(APP_ID, {
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })

    expect(readBridgeVerdict(APP_ID)).toBeUndefined()
  })
})

describe('clearBridgeScanVerdict', () => {
  it('removes scan but keeps the rest of the bridge verdict', () => {
    writeBridgeScanVerdict(APP_ID, makeScanVerdict())
    setBridgeUserRoute(APP_ID, 'bridge')

    clearBridgeScanVerdict(APP_ID)

    const verdict = readBridgeVerdict(APP_ID)
    expect(verdict?.scan).toBeUndefined()
    expect(verdict?.userRoute).toBe('bridge')
  })

  it('is a no-op when no entry exists at all', () => {
    clearBridgeScanVerdict(APP_ID)

    expect(mockedStore.get(APP_ID)).toBeUndefined()
  })

  it('is a no-op when an entry exists but has no scan to clear', () => {
    setBridgeUserRoute(APP_ID, 'bottle')

    clearBridgeScanVerdict(APP_ID)

    expect(readBridgeVerdict(APP_ID)?.userRoute).toBe('bottle')
  })
})

describe('setBridgeSteamApiPrescreen', () => {
  it('persists the pre-install prescreen signal', () => {
    setBridgeSteamApiPrescreen(APP_ID, 'x64')

    expect(readBridgeVerdict(APP_ID)?.steamApi).toBe('x64')
  })
})

describe('setBridgeNoticeAcknowledged', () => {
  it('persists the acknowledged reason', () => {
    setBridgeNoticeAcknowledged(APP_ID, 'known-bad')

    expect(readBridgeVerdict(APP_ID)?.noticeAcknowledgedFor).toBe('known-bad')
  })
})

describe('markBridgeLimitedNoticeShown', () => {
  it('sets limitedNoticeShown true', () => {
    markBridgeLimitedNoticeShown(APP_ID)

    expect(readBridgeVerdict(APP_ID)?.limitedNoticeShown).toBe(true)
  })

  it('is idempotent -- a second call does not needlessly rewrite the store', () => {
    markBridgeLimitedNoticeShown(APP_ID)
    mockedLogInfo.mockClear()

    markBridgeLimitedNoticeShown(APP_ID)

    expect(mockedLogInfo).not.toHaveBeenCalled()
    expect(readBridgeVerdict(APP_ID)?.limitedNoticeShown).toBe(true)
  })
})

describe('setBridgeIdentityFallback', () => {
  it('persists the identity-fallback flag', () => {
    setBridgeIdentityFallback(APP_ID, true)

    expect(readBridgeVerdict(APP_ID)?.identityFallback).toBe(true)
  })
})

describe('every writer rejects a non-numeric appId without touching the store', () => {
  it.each([
    [
      'writeBridgeScanVerdict',
      () => writeBridgeScanVerdict(NON_NUMERIC_APP_ID, makeScanVerdict())
    ],
    [
      'clearBridgeScanVerdict',
      () => clearBridgeScanVerdict(NON_NUMERIC_APP_ID)
    ],
    [
      'setBridgeSteamApiPrescreen',
      () => setBridgeSteamApiPrescreen(NON_NUMERIC_APP_ID, 'x86')
    ],
    [
      'setBridgeUserRoute',
      () => setBridgeUserRoute(NON_NUMERIC_APP_ID, 'bottle')
    ],
    [
      'setBridgeNoticeAcknowledged',
      () => setBridgeNoticeAcknowledged(NON_NUMERIC_APP_ID, 'known-bad')
    ],
    [
      'markBridgeLimitedNoticeShown',
      () => markBridgeLimitedNoticeShown(NON_NUMERIC_APP_ID)
    ],
    [
      'setBridgeIdentityFallback',
      () => setBridgeIdentityFallback(NON_NUMERIC_APP_ID, true)
    ],
    [
      'writeBridgeDrmVerdict',
      () => writeBridgeDrmVerdict(NON_NUMERIC_APP_ID, 'ceg')
    ]
  ])('%s', (_name, fn) => {
    fn()

    expect(mockedStore.get(NON_NUMERIC_APP_ID)).toBeUndefined()
  })
})

describe('writeBridgeDrmVerdict (quick 261024-br4)', () => {
  it("persists bridge.drm 'ceg' and keeps scan, userRoute and the other fields", () => {
    mockedStore.set(APP_ID, {
      art_cover: 'cover.jpg',
      art_square: '',
      extra: { reqs: [] },
      bridge: {
        scan: makeScanVerdict(),
        userRoute: 'bottle',
        noticeAcknowledgedFor: 'known-bad',
        identityFallback: true
      }
    })

    writeBridgeDrmVerdict(APP_ID, 'ceg')

    const stored = mockedStore.get(APP_ID) as Record<string, unknown>
    expect(stored.art_cover).toBe('cover.jpg')
    expect(readBridgeVerdict(APP_ID)).toEqual({
      scan: makeScanVerdict(),
      userRoute: 'bottle',
      noticeAcknowledgedFor: 'known-bad',
      identityFallback: true,
      drm: 'ceg'
    })
  })

  it('removes the key entirely when passed undefined', () => {
    writeBridgeDrmVerdict(APP_ID, 'ceg')
    setBridgeUserRoute(APP_ID, 'bridge')

    writeBridgeDrmVerdict(APP_ID, undefined)

    const stored = mockedStore.get(APP_ID) as {
      bridge: Record<string, unknown>
    }
    expect('drm' in stored.bridge).toBe(false)
    expect(readBridgeVerdict(APP_ID)).toEqual({ userRoute: 'bridge' })
  })

  it('undefined is a no-op (no fabricated entry) when nothing is stored', () => {
    writeBridgeDrmVerdict(APP_ID, undefined)

    expect(mockedStore.get(APP_ID)).toBeUndefined()
    expect(mockedLogInfo).not.toHaveBeenCalled()
  })

  it('an unknown stored drm value makes the whole verdict read as invalid', () => {
    mockedStore.set(APP_ID, {
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      bridge: { userRoute: 'bridge', drm: 'denuvo' }
    })

    expect(readBridgeVerdict(APP_ID)).toBeUndefined()
    expect(mockedLogWarning).toHaveBeenCalled()
  })
})
