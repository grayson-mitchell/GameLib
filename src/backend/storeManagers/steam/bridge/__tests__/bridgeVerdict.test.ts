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
  setBridgeLaunchTarget,
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

describe('readBridgeVerdict: a scan stamped with a pre-D-20 export-set version', () => {
  it('still parses and keeps its stamp (the stamp is diagnostic only)', () => {
    // 0e9480d1f340 is the SHIM_EXPORT_SET_VERSION before 56-14 (D-20).
    const stale = makeScanVerdict({ shimExportSetVersion: '0e9480d1f340' })
    mockedStore.set(APP_ID, { bridge: { scan: stale } })

    const read = readBridgeVerdict(APP_ID)

    expect(read?.scan).toEqual(stale)
    expect(mockedLogWarning).not.toHaveBeenCalled()
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

  it('51-REVIEW WR-01: retains the cleared scan interfaceVersions pool at the top level, and it survives a read', () => {
    writeBridgeScanVerdict(APP_ID, makeScanVerdict())

    clearBridgeScanVerdict(APP_ID)

    const verdict = readBridgeVerdict(APP_ID)
    expect(verdict?.scan).toBeUndefined()
    expect(verdict?.interfaceVersions).toEqual({ SteamUtils: 'SteamUtils005' })
  })

  it('51-REVIEW WR-01: an empty cleared pool does not overwrite a previously retained one', () => {
    writeBridgeScanVerdict(APP_ID, makeScanVerdict())
    clearBridgeScanVerdict(APP_ID)
    writeBridgeScanVerdict(APP_ID, makeScanVerdict({ interfaceVersions: {} }))

    clearBridgeScanVerdict(APP_ID)

    expect(readBridgeVerdict(APP_ID)?.interfaceVersions).toEqual({
      SteamUtils: 'SteamUtils005'
    })
  })

  it('quick 261026-u1a: retains the cleared scan originalFingerprints (and interfaceVersions) at the top level', () => {
    const fps = { 'drive_c/game/steam_api64.dll': { size: 1, sha1: 'aa' } }
    writeBridgeScanVerdict(
      APP_ID,
      makeScanVerdict({ originalFingerprints: fps })
    )

    clearBridgeScanVerdict(APP_ID)

    const verdict = readBridgeVerdict(APP_ID)
    expect(verdict?.scan).toBeUndefined()
    expect(verdict?.originalFingerprints).toEqual(fps)
    expect(verdict?.interfaceVersions).toEqual({ SteamUtils: 'SteamUtils005' })
  })

  it('quick 261026-u1a: scan.originalFingerprints survives a read (not stripped by the schema)', () => {
    const fps = { 'drive_c/game/steam_api64.dll': { size: 1, sha1: 'aa' } }
    writeBridgeScanVerdict(
      APP_ID,
      makeScanVerdict({ originalFingerprints: fps })
    )

    expect(readBridgeVerdict(APP_ID)?.scan?.originalFingerprints).toEqual(fps)
  })

  it('quick 261026-u1a: an absent or empty cleared fingerprint map does not overwrite a retained one', () => {
    const fps = { 'drive_c/game/steam_api64.dll': { size: 1, sha1: 'aa' } }
    writeBridgeScanVerdict(
      APP_ID,
      makeScanVerdict({ originalFingerprints: fps })
    )
    clearBridgeScanVerdict(APP_ID)
    writeBridgeScanVerdict(APP_ID, makeScanVerdict())
    clearBridgeScanVerdict(APP_ID)
    writeBridgeScanVerdict(
      APP_ID,
      makeScanVerdict({ originalFingerprints: {} })
    )

    clearBridgeScanVerdict(APP_ID)

    expect(readBridgeVerdict(APP_ID)?.originalFingerprints).toEqual(fps)
  })

  it('quick 261026-u1a: clearing a scan with no fingerprints fabricates no originalFingerprints key', () => {
    writeBridgeScanVerdict(APP_ID, makeScanVerdict())

    clearBridgeScanVerdict(APP_ID)

    expect(readBridgeVerdict(APP_ID)).not.toHaveProperty('originalFingerprints')
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

describe('setBridgeLaunchTarget', () => {
  it('round-trips the launch target through readBridgeVerdict', () => {
    setBridgeLaunchTarget(APP_ID, {
      executable: 'Binaries\\Win32\\Game.exe',
      installdir: 'Game'
    })

    expect(readBridgeVerdict(APP_ID)?.launchTarget).toEqual({
      executable: 'Binaries\\Win32\\Game.exe',
      installdir: 'Game'
    })
  })

  it('rejects a non-numeric appId without touching the store', () => {
    setBridgeLaunchTarget(NON_NUMERIC_APP_ID, {
      executable: 'a.exe',
      installdir: 'a'
    })

    expect(mockedStore.get(NON_NUMERIC_APP_ID)).toBeUndefined()
  })

  it.each([
    ['empty executable', { executable: '', installdir: 'a' }],
    ['empty installdir', { executable: 'a.exe', installdir: '' }],
    ['overlong executable', { executable: 'x'.repeat(513), installdir: 'a' }],
    [
      'overlong installdir',
      { executable: 'a.exe', installdir: 'x'.repeat(513) }
    ]
  ])('rejects %s', (_label, target) => {
    setBridgeLaunchTarget(APP_ID, target)

    expect(readBridgeVerdict(APP_ID)?.launchTarget).toBeUndefined()
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

describe('scan.drmWrapper round trip (Phase 52 Pitfall 2)', () => {
  it('reads back drmWrapper steamstub intact', () => {
    writeBridgeScanVerdict(APP_ID, makeScanVerdict({ drmWrapper: 'steamstub' }))
    expect(readBridgeVerdict(APP_ID)?.scan?.drmWrapper).toBe('steamstub')
  })
  it('leaves the key absent when not set', () => {
    writeBridgeScanVerdict(APP_ID, makeScanVerdict())
    const scan = readBridgeVerdict(APP_ID)?.scan
    expect(scan).toBeDefined()
    expect('drmWrapper' in (scan as object)).toBe(false)
  })
  it('rejects an unknown drmWrapper value (whole verdict undefined)', () => {
    mockedStore.set(APP_ID, {
      bridge: { scan: { ...makeScanVerdict(), drmWrapper: 'ceg' } }
    })
    expect(readBridgeVerdict(APP_ID)).toBeUndefined()
    expect(mockedLogWarning).toHaveBeenCalled()
  })
})

describe('scan.managedScan round trip (Phase 53 D-53-04)', () => {
  it('reads back a mono managedScan intact', () => {
    const managedScan = {
      kind: 'mono' as const,
      assemblies: 3,
      unservedFamilyImports: 7
    }
    writeBridgeScanVerdict(APP_ID, makeScanVerdict({ managedScan }))
    expect(readBridgeVerdict(APP_ID)?.scan?.managedScan).toEqual(managedScan)
  })

  it('reads back an il2cpp managedScan intact', () => {
    const managedScan = {
      kind: 'il2cpp' as const,
      reason: 'il2cpp: not scanned' as const
    }
    writeBridgeScanVerdict(APP_ID, makeScanVerdict({ managedScan }))
    expect(readBridgeVerdict(APP_ID)?.scan?.managedScan).toEqual(managedScan)
  })

  it('rejects an unknown il2cpp reason (whole verdict undefined)', () => {
    mockedStore.set(APP_ID, {
      bridge: {
        scan: {
          ...makeScanVerdict(),
          managedScan: { kind: 'il2cpp', reason: 'other' }
        }
      }
    })
    expect(readBridgeVerdict(APP_ID)).toBeUndefined()
  })
})
