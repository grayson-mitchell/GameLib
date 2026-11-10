/**
 * Unit tests for the persisted bridge verdict field family (Phase 51 Plan
 * 03, D-51-07/D-51-10).
 *
 * `steamMetadataStore` is a real, stateful in-memory Map passed through the
 * deps slice (not a bare per-call jest.fn() mockReturnValue) -- the behavior under test IS a
 * read-modify-write round trip (writeBridgeScanVerdict then
 * readBridgeVerdict; two sequential writes preserving each other's
 * sibling fields), which a stateless mock cannot model.
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { logInfo, logWarning } from 'backend/logger'
import type { SteamStoresDeps } from '../../library/installRoot'
import type { SteamBridgeScanVerdict } from '../../stores'
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
  writeBridgeDrmVerdict,
  writeBridgeModeVerdict,
  readBridgeModeVerdict
} from '../bridgeVerdict'

const backing = new Map<string, unknown>()
const mockedStore = {
  get: (appId: string) =>
    backing.get(appId) as Record<string, unknown> | undefined,
  set: (appId: string, value: unknown) => {
    backing.set(appId, value)
  },
  __resetForTests: () => backing.clear()
}
const DEPS = {
  stores: { steam: { steamMetadataStore: mockedStore } }
} as unknown as SteamStoresDeps
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

    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())

    const stored = mockedStore.get(APP_ID) as Record<string, unknown>
    expect(stored.art_cover).toBe('cover.jpg')
    expect(stored.art_square).toBe('square.jpg')
    expect(stored.forcedWindowsViaBottle).toBe(true)
    expect(stored.bridge).toEqual({ scan: makeScanVerdict() })
  })

  it('a second write replaces bridge.scan but keeps bridge.userRoute', () => {
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())
    setBridgeUserRoute(DEPS, APP_ID, 'bottle')

    writeBridgeScanVerdict(
      DEPS,
      APP_ID,
      makeScanVerdict({ status: 'clean', missingSymbols: [] })
    )

    const verdict = readBridgeVerdict(DEPS, APP_ID)
    expect(verdict?.scan?.status).toBe('clean')
    expect(verdict?.scan?.missingSymbols).toEqual([])
    expect(verdict?.userRoute).toBe('bottle')
  })

  it('rejects a non-numeric appId without touching the store', () => {
    writeBridgeScanVerdict(DEPS, NON_NUMERIC_APP_ID, makeScanVerdict())

    expect(mockedStore.get(NON_NUMERIC_APP_ID)).toBeUndefined()
    expect(mockedLogWarning).toHaveBeenCalled()
  })
})

describe('setBridgeUserRoute', () => {
  it('persists the user override; readBridgeVerdict reflects it', () => {
    setBridgeUserRoute(DEPS, APP_ID, 'bottle')

    expect(readBridgeVerdict(DEPS, APP_ID)?.userRoute).toBe('bottle')
  })

  it('removes the key entirely when passed undefined', () => {
    setBridgeUserRoute(DEPS, APP_ID, 'bottle')
    setBridgeUserRoute(DEPS, APP_ID, undefined)

    const verdict = readBridgeVerdict(DEPS, APP_ID)
    expect(verdict?.userRoute).toBeUndefined()
    expect(verdict ? 'userRoute' in verdict : false).toBe(false)
  })

  it('rejects a non-numeric appId without touching the store', () => {
    setBridgeUserRoute(DEPS, NON_NUMERIC_APP_ID, 'bridge')

    expect(mockedStore.get(NON_NUMERIC_APP_ID)).toBeUndefined()
  })
})

describe('writers on an appId with no prior entry', () => {
  it('create a minimal entry (library.ts:884 precedent) and log once', () => {
    setBridgeIdentityFallback(DEPS, APP_ID, true)

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

    expect(readBridgeVerdict(DEPS, APP_ID)).toBeUndefined()
    expect(mockedLogWarning).toHaveBeenCalled()
  })

  it('returns undefined for a non-numeric appId, never throws', () => {
    expect(() => readBridgeVerdict(DEPS, NON_NUMERIC_APP_ID)).not.toThrow()
    expect(readBridgeVerdict(DEPS, NON_NUMERIC_APP_ID)).toBeUndefined()
  })

  it('returns undefined when no entry exists at all', () => {
    expect(readBridgeVerdict(DEPS, '999999999')).toBeUndefined()
  })

  it('returns undefined when an entry exists but has no bridge field', () => {
    mockedStore.set(APP_ID, {
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })

    expect(readBridgeVerdict(DEPS, APP_ID)).toBeUndefined()
  })
})

describe('readBridgeVerdict: a scan stamped with a pre-D-20 export-set version', () => {
  it('still parses and keeps its stamp (the stamp is diagnostic only)', () => {
    // 0e9480d1f340 is the SHIM_EXPORT_SET_VERSION before 56-14 (D-20).
    const stale = makeScanVerdict({ shimExportSetVersion: '0e9480d1f340' })
    mockedStore.set(APP_ID, { bridge: { scan: stale } })

    const read = readBridgeVerdict(DEPS, APP_ID)

    expect(read?.scan).toEqual(stale)
    expect(mockedLogWarning).not.toHaveBeenCalled()
  })
})

describe('clearBridgeScanVerdict', () => {
  it('removes scan but keeps the rest of the bridge verdict', () => {
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())
    setBridgeUserRoute(DEPS, APP_ID, 'bridge')

    clearBridgeScanVerdict(DEPS, APP_ID)

    const verdict = readBridgeVerdict(DEPS, APP_ID)
    expect(verdict?.scan).toBeUndefined()
    expect(verdict?.userRoute).toBe('bridge')
  })

  it('51-REVIEW WR-01: retains the cleared scan interfaceVersions pool at the top level, and it survives a read', () => {
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())

    clearBridgeScanVerdict(DEPS, APP_ID)

    const verdict = readBridgeVerdict(DEPS, APP_ID)
    expect(verdict?.scan).toBeUndefined()
    expect(verdict?.interfaceVersions).toEqual({ SteamUtils: 'SteamUtils005' })
  })

  it('51-REVIEW WR-01: an empty cleared pool does not overwrite a previously retained one', () => {
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())
    clearBridgeScanVerdict(DEPS, APP_ID)
    writeBridgeScanVerdict(
      DEPS,
      APP_ID,
      makeScanVerdict({ interfaceVersions: {} })
    )

    clearBridgeScanVerdict(DEPS, APP_ID)

    expect(readBridgeVerdict(DEPS, APP_ID)?.interfaceVersions).toEqual({
      SteamUtils: 'SteamUtils005'
    })
  })

  it('quick 261026-u1a: retains the cleared scan originalFingerprints (and interfaceVersions) at the top level', () => {
    const fps = { 'drive_c/game/steam_api64.dll': { size: 1, sha1: 'aa' } }
    writeBridgeScanVerdict(
      DEPS,
      APP_ID,
      makeScanVerdict({ originalFingerprints: fps })
    )

    clearBridgeScanVerdict(DEPS, APP_ID)

    const verdict = readBridgeVerdict(DEPS, APP_ID)
    expect(verdict?.scan).toBeUndefined()
    expect(verdict?.originalFingerprints).toEqual(fps)
    expect(verdict?.interfaceVersions).toEqual({ SteamUtils: 'SteamUtils005' })
  })

  it('quick 261026-u1a: scan.originalFingerprints survives a read (not stripped by the schema)', () => {
    const fps = { 'drive_c/game/steam_api64.dll': { size: 1, sha1: 'aa' } }
    writeBridgeScanVerdict(
      DEPS,
      APP_ID,
      makeScanVerdict({ originalFingerprints: fps })
    )

    expect(readBridgeVerdict(DEPS, APP_ID)?.scan?.originalFingerprints).toEqual(
      fps
    )
  })

  it('quick 261026-u1a: an absent or empty cleared fingerprint map does not overwrite a retained one', () => {
    const fps = { 'drive_c/game/steam_api64.dll': { size: 1, sha1: 'aa' } }
    writeBridgeScanVerdict(
      DEPS,
      APP_ID,
      makeScanVerdict({ originalFingerprints: fps })
    )
    clearBridgeScanVerdict(DEPS, APP_ID)
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())
    clearBridgeScanVerdict(DEPS, APP_ID)
    writeBridgeScanVerdict(
      DEPS,
      APP_ID,
      makeScanVerdict({ originalFingerprints: {} })
    )

    clearBridgeScanVerdict(DEPS, APP_ID)

    expect(readBridgeVerdict(DEPS, APP_ID)?.originalFingerprints).toEqual(fps)
  })

  it('quick 261026-u1a: clearing a scan with no fingerprints fabricates no originalFingerprints key', () => {
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())

    clearBridgeScanVerdict(DEPS, APP_ID)

    expect(readBridgeVerdict(DEPS, APP_ID)).not.toHaveProperty(
      'originalFingerprints'
    )
  })

  it('is a no-op when no entry exists at all', () => {
    clearBridgeScanVerdict(DEPS, APP_ID)

    expect(mockedStore.get(APP_ID)).toBeUndefined()
  })

  it('is a no-op when an entry exists but has no scan to clear', () => {
    setBridgeUserRoute(DEPS, APP_ID, 'bottle')

    clearBridgeScanVerdict(DEPS, APP_ID)

    expect(readBridgeVerdict(DEPS, APP_ID)?.userRoute).toBe('bottle')
  })
})

describe('setBridgeSteamApiPrescreen', () => {
  it('persists the pre-install prescreen signal', () => {
    setBridgeSteamApiPrescreen(DEPS, APP_ID, 'x64')

    expect(readBridgeVerdict(DEPS, APP_ID)?.steamApi).toBe('x64')
  })
})

describe('setBridgeNoticeAcknowledged', () => {
  it('persists the acknowledged reason', () => {
    setBridgeNoticeAcknowledged(DEPS, APP_ID, 'known-bad')

    expect(readBridgeVerdict(DEPS, APP_ID)?.noticeAcknowledgedFor).toBe(
      'known-bad'
    )
  })
})

describe('markBridgeLimitedNoticeShown', () => {
  it('sets limitedNoticeShown true', () => {
    markBridgeLimitedNoticeShown(DEPS, APP_ID)

    expect(readBridgeVerdict(DEPS, APP_ID)?.limitedNoticeShown).toBe(true)
  })

  it('is idempotent -- a second call does not needlessly rewrite the store', () => {
    markBridgeLimitedNoticeShown(DEPS, APP_ID)
    mockedLogInfo.mockClear()

    markBridgeLimitedNoticeShown(DEPS, APP_ID)

    expect(mockedLogInfo).not.toHaveBeenCalled()
    expect(readBridgeVerdict(DEPS, APP_ID)?.limitedNoticeShown).toBe(true)
  })
})

describe('setBridgeIdentityFallback', () => {
  it('persists the identity-fallback flag', () => {
    setBridgeIdentityFallback(DEPS, APP_ID, true)

    expect(readBridgeVerdict(DEPS, APP_ID)?.identityFallback).toBe(true)
  })
})

describe('setBridgeLaunchTarget', () => {
  it('round-trips the launch target through readBridgeVerdict', () => {
    setBridgeLaunchTarget(DEPS, APP_ID, {
      executable: 'Binaries\\Win32\\Game.exe',
      installdir: 'Game'
    })

    expect(readBridgeVerdict(DEPS, APP_ID)?.launchTarget).toEqual({
      executable: 'Binaries\\Win32\\Game.exe',
      installdir: 'Game'
    })
  })

  it('round-trips an optional workingdir and still reads a target stored without one', () => {
    setBridgeLaunchTarget(DEPS, APP_ID, {
      executable: 'x64\\Grim Dawn.exe',
      installdir: 'Grim Dawn',
      workingdir: 'x64'
    })
    expect(readBridgeVerdict(DEPS, APP_ID)?.launchTarget).toEqual({
      executable: 'x64\\Grim Dawn.exe',
      installdir: 'Grim Dawn',
      workingdir: 'x64'
    })

    setBridgeLaunchTarget(DEPS, APP_ID, {
      executable: 'x64\\Grim Dawn.exe',
      installdir: 'Grim Dawn'
    })
    expect(readBridgeVerdict(DEPS, APP_ID)?.launchTarget).toEqual({
      executable: 'x64\\Grim Dawn.exe',
      installdir: 'Grim Dawn'
    })
  })

  it('rejects a non-numeric appId without touching the store', () => {
    setBridgeLaunchTarget(DEPS, NON_NUMERIC_APP_ID, {
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
    setBridgeLaunchTarget(DEPS, APP_ID, target)

    expect(readBridgeVerdict(DEPS, APP_ID)?.launchTarget).toBeUndefined()
  })
})

describe('every writer rejects a non-numeric appId without touching the store', () => {
  it.each([
    [
      'writeBridgeScanVerdict',
      () => writeBridgeScanVerdict(DEPS, NON_NUMERIC_APP_ID, makeScanVerdict())
    ],
    [
      'clearBridgeScanVerdict',
      () => clearBridgeScanVerdict(DEPS, NON_NUMERIC_APP_ID)
    ],
    [
      'setBridgeSteamApiPrescreen',
      () => setBridgeSteamApiPrescreen(DEPS, NON_NUMERIC_APP_ID, 'x86')
    ],
    [
      'setBridgeUserRoute',
      () => setBridgeUserRoute(DEPS, NON_NUMERIC_APP_ID, 'bottle')
    ],
    [
      'setBridgeNoticeAcknowledged',
      () => setBridgeNoticeAcknowledged(DEPS, NON_NUMERIC_APP_ID, 'known-bad')
    ],
    [
      'markBridgeLimitedNoticeShown',
      () => markBridgeLimitedNoticeShown(DEPS, NON_NUMERIC_APP_ID)
    ],
    [
      'setBridgeIdentityFallback',
      () => setBridgeIdentityFallback(DEPS, NON_NUMERIC_APP_ID, true)
    ],
    [
      'writeBridgeDrmVerdict',
      () => writeBridgeDrmVerdict(DEPS, NON_NUMERIC_APP_ID, 'ceg')
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

    writeBridgeDrmVerdict(DEPS, APP_ID, 'ceg')

    const stored = mockedStore.get(APP_ID) as Record<string, unknown>
    expect(stored.art_cover).toBe('cover.jpg')
    expect(readBridgeVerdict(DEPS, APP_ID)).toEqual({
      scan: makeScanVerdict(),
      userRoute: 'bottle',
      noticeAcknowledgedFor: 'known-bad',
      identityFallback: true,
      drm: 'ceg'
    })
  })

  it('removes the key entirely when passed undefined', () => {
    writeBridgeDrmVerdict(DEPS, APP_ID, 'ceg')
    setBridgeUserRoute(DEPS, APP_ID, 'bridge')

    writeBridgeDrmVerdict(DEPS, APP_ID, undefined)

    const stored = mockedStore.get(APP_ID) as {
      bridge: Record<string, unknown>
    }
    expect('drm' in stored.bridge).toBe(false)
    expect(readBridgeVerdict(DEPS, APP_ID)).toEqual({ userRoute: 'bridge' })
  })

  it('undefined is a no-op (no fabricated entry) when nothing is stored', () => {
    writeBridgeDrmVerdict(DEPS, APP_ID, undefined)

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

    expect(readBridgeVerdict(DEPS, APP_ID)).toBeUndefined()
    expect(mockedLogWarning).toHaveBeenCalled()
  })
})

describe('bridge mode verdict (59-15 WR-04)', () => {
  it('round-trips and survives strip-on-read', () => {
    writeBridgeModeVerdict(DEPS, APP_ID, 'steamclient-layer')
    expect(readBridgeModeVerdict(DEPS, APP_ID)).toBe('steamclient-layer')
    expect(readBridgeVerdict(DEPS, APP_ID)?.mode).toBe('steamclient-layer')
  })
  it('leaves drm, steamApi and launchTarget unchanged', () => {
    writeBridgeDrmVerdict(DEPS, APP_ID, 'ceg')
    setBridgeSteamApiPrescreen(DEPS, APP_ID, 'x64')
    const target = { executable: 'a.exe', installdir: 'A' }
    setBridgeLaunchTarget(DEPS, APP_ID, target)
    const before = readBridgeVerdict(DEPS, APP_ID)
    writeBridgeModeVerdict(DEPS, APP_ID, 'tcp')
    expect(readBridgeVerdict(DEPS, APP_ID)).toEqual({ ...before, mode: 'tcp' })
  })
  it('rejects a non-numeric appId', () => {
    writeBridgeModeVerdict(DEPS, NON_NUMERIC_APP_ID, 'tcp')
    expect(mockedStore.get(NON_NUMERIC_APP_ID)).toBeUndefined()
  })
  it('an invalid stored value reads as undefined', () => {
    mockedStore.set(APP_ID, {
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      bridge: { mode: 'bogus' }
    })
    expect(readBridgeModeVerdict(DEPS, APP_ID)).toBeUndefined()
  })
})

describe('scan.drmWrapper round trip (Phase 52 Pitfall 2)', () => {
  it('reads back drmWrapper steamstub intact', () => {
    writeBridgeScanVerdict(
      DEPS,
      APP_ID,
      makeScanVerdict({ drmWrapper: 'steamstub' })
    )
    expect(readBridgeVerdict(DEPS, APP_ID)?.scan?.drmWrapper).toBe('steamstub')
  })
  it('leaves the key absent when not set', () => {
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict())
    const scan = readBridgeVerdict(DEPS, APP_ID)?.scan
    expect(scan).toBeDefined()
    expect('drmWrapper' in (scan as object)).toBe(false)
  })
  it('rejects an unknown drmWrapper value (whole verdict undefined)', () => {
    mockedStore.set(APP_ID, {
      bridge: { scan: { ...makeScanVerdict(), drmWrapper: 'ceg' } }
    })
    expect(readBridgeVerdict(DEPS, APP_ID)).toBeUndefined()
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
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict({ managedScan }))
    expect(readBridgeVerdict(DEPS, APP_ID)?.scan?.managedScan).toEqual(
      managedScan
    )
  })

  it('reads back an il2cpp managedScan intact', () => {
    const managedScan = {
      kind: 'il2cpp' as const,
      reason: 'il2cpp: not scanned' as const
    }
    writeBridgeScanVerdict(DEPS, APP_ID, makeScanVerdict({ managedScan }))
    expect(readBridgeVerdict(DEPS, APP_ID)?.scan?.managedScan).toEqual(
      managedScan
    )
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
    expect(readBridgeVerdict(DEPS, APP_ID)).toBeUndefined()
  })
})
