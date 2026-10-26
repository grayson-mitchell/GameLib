/**
 * Unit tests for the pure route resolver (Phase 51 Plan 07, ROADMAP
 * sub-decision 2 / D-51-07). One test per precedence row, in order, plus
 * the copied-field and D-17-pin prohibition assertions.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  resolveBridgeRoute,
  NOTICE_REASONS,
  type BridgeRouteInput
} from '../bridgeRoute'
import type { SteamBridgeVerdict } from '../../electronStores'

const baseInput: BridgeRouteInput = {
  platformsBottleEligible: true,
  isSeed: false,
  knownBadReason: null,
  knownFixDrm: null,
  verdict: undefined,
  failedThisSession: false,
  win64ShimPresent: false
}

describe('resolveBridgeRoute', () => {
  it('row 1: platformsBottleEligible false -> not-eligible, reason null', () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      platformsBottleEligible: false
    })
    expect(result.route).toBe('not-eligible')
    expect(result.reason).toBeNull()
  })

  it('row 2: failedThisSession -> bottle / failed-this-session, noticeRequired false', () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      failedThisSession: true
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('failed-this-session')
    expect(result.noticeRequired).toBe(false)
  })

  it("row 3: verdict.userRoute 'bottle' -> bottle / user-forced-bottle, noticeRequired false (D-51-10)", () => {
    const verdict: SteamBridgeVerdict = { userRoute: 'bottle' }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('user-forced-bottle')
    expect(result.noticeRequired).toBe(false)
  })

  it('row 4: knownBadReason set, userRoute not bridge -> bottle / known-bad, notice required (D-51-08)', () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      knownBadReason: 'drm-wrapped'
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.knownBadReason).toBe('drm-wrapped')
    expect(result.noticeRequired).toBe(true)
  })

  it('row 4: known-bad notice NOT required when already acknowledged for known-bad', () => {
    const verdict: SteamBridgeVerdict = { noticeAcknowledgedFor: 'known-bad' }
    const result = resolveBridgeRoute({
      ...baseInput,
      knownBadReason: 'drm-wrapped',
      verdict
    })
    expect(result.noticeRequired).toBe(false)
  })

  it('row 4: known-bad is bypassed when userRoute is forced to bridge (D-51-11)', () => {
    const verdict: SteamBridgeVerdict = { userRoute: 'bridge' }
    const result = resolveBridgeRoute({
      ...baseInput,
      knownBadReason: 'drm-wrapped',
      verdict
    })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('user-forced-bridge')
    expect(result.knownBadReason).toBe('drm-wrapped')
    expect(result.noticeRequired).toBe(false)
  })

  describe('row 4 amendment 2026-10-23: only drm-wrapped routes to bottle', () => {
    const missVerdict = (
      extra: SteamBridgeVerdict = {}
    ): SteamBridgeVerdict => ({
      scan: {
        status: 'miss',
        arch: 'x86',
        missingSymbols: ['NotARealSymbol_v999'],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'irrelevant',
        scannedAt: '2026-01-01T00:00:00.000Z'
      },
      ...extra
    })

    it('does-not-run, no verdict -> bridge / pending-scan with the notice required', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run'
      })
      expect(result.route).toBe('bridge')
      expect(result.reason).toBe('pending-scan')
      expect(result.knownBadReason).toBe('does-not-run')
      expect(result.noticeRequired).toBe(true)
    })

    it('keeps the seed reason and carries knownBadReason', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        isSeed: true,
        knownBadReason: 'does-not-run'
      })
      expect(result.route).toBe('bridge')
      expect(result.reason).toBe('seed')
      expect(result.knownBadReason).toBe('does-not-run')
      expect(result.noticeRequired).toBe(true)
    })

    it('keeps scan-clean and carries knownBadReason', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run',
        verdict: {
          scan: {
            status: 'clean',
            arch: 'x86',
            missingSymbols: [],
            interfaceVersions: {},
            stubbedInterfaces: [],
            shimExportSetVersion: 'irrelevant',
            scannedAt: '2026-01-01T00:00:00.000Z'
          }
        }
      })
      expect(result.route).toBe('bridge')
      expect(result.reason).toBe('scan-clean')
      expect(result.knownBadReason).toBe('does-not-run')
      expect(result.noticeRequired).toBe(true)
    })

    it.each(['does-not-run', 'win64-only', 'p2p-required'] as const)(
      '%s: stays on the bridge; acknowledged -> notice no longer required',
      (reason) => {
        const pending = resolveBridgeRoute({
          ...baseInput,
          knownBadReason: reason
        })
        expect(pending.route).toBe('bridge')
        expect(pending.noticeRequired).toBe(true)
        const acked = resolveBridgeRoute({
          ...baseInput,
          knownBadReason: reason,
          verdict: { noticeAcknowledgedFor: 'known-bad' }
        })
        expect(acked.route).toBe('bridge')
        expect(acked.knownBadReason).toBe(reason)
        expect(acked.noticeRequired).toBe(false)
      }
    )

    it('drm-wrapped still routes to bottle / known-bad (XCOM)', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'drm-wrapped'
      })
      expect(result.route).toBe('bottle')
      expect(result.reason).toBe('known-bad')
      expect(result.noticeRequired).toBe(true)
    })

    it('userRoute bottle wins over a non-DRM known-bad (row 3)', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run',
        verdict: { userRoute: 'bottle' }
      })
      expect(result.route).toBe('bottle')
      expect(result.reason).toBe('user-forced-bottle')
    })

    it('a scan miss routes to the bridge with one combined notice, cleared only by the scan-miss acknowledgement', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run',
        verdict: missVerdict({ noticeAcknowledgedFor: 'known-bad' })
      })
      expect(result.route).toBe('bridge')
      expect(result.reason).toBe('scan-miss')
      expect(result.knownBadReason).toBe('does-not-run')
      expect(result.missingSymbols).toEqual(['NotARealSymbol_v999'])
      expect(result.noticeRequired).toBe(true)
      const acked = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run',
        verdict: missVerdict({ noticeAcknowledgedFor: 'scan-miss' })
      })
      expect(acked.noticeRequired).toBe(false)
    })

    it('drm-wrapped + an uncovered miss still lands on bottle / known-bad', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'drm-wrapped',
        verdict: missVerdict()
      })
      expect(result.route).toBe('bottle')
      expect(result.reason).toBe('known-bad')
    })

    it('x64 with no Win64 shim lands on bottle / win64-no-shim (T-og0-02)', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run',
        verdict: { steamApi: 'x64' }
      })
      expect(result.route).toBe('bottle')
      expect(result.reason).toBe('win64-no-shim')
      expect(result.knownBadReason).toBe('does-not-run')
      expect(result.noticeRequired).toBe(true)
    })

    it.each(['does-not-run', 'win64-only', 'p2p-required'] as const)(
      '%s + userRoute bridge -> user-forced-bridge, no notice',
      (reason) => {
        const result = resolveBridgeRoute({
          ...baseInput,
          knownBadReason: reason,
          verdict: { userRoute: 'bridge' }
        })
        expect(result.route).toBe('bridge')
        expect(result.reason).toBe('user-forced-bridge')
        expect(result.knownBadReason).toBe(reason)
        expect(result.noticeRequired).toBe(false)
      }
    )
  })

  const uncoveredMiss = (
    extra: SteamBridgeVerdict = {},
    arch: 'x86' | 'x64' = 'x86'
  ): SteamBridgeVerdict => ({
    scan: {
      status: 'miss',
      arch,
      missingSymbols: ['NotARealSymbol_v999'],
      interfaceVersions: {},
      stubbedInterfaces: [],
      shimExportSetVersion: 'irrelevant',
      scannedAt: '2026-01-01T00:00:00.000Z'
    },
    ...extra
  })

  it('row 7: a persisted scan miss, not covered, no userRoute -> bridge / scan-miss with its symbols (amended 2026-10-23)', () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict: uncoveredMiss()
    })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('scan-miss')
    expect(result.missingSymbols).toEqual(['NotARealSymbol_v999'])
    expect(result.knownBadReason).toBeNull()
    expect(result.noticeRequired).toBe(true)
  })

  it('row 7: scan-miss notice NOT required when acknowledged for scan-miss, still required when acknowledged for known-bad only', () => {
    const acked = resolveBridgeRoute({
      ...baseInput,
      verdict: uncoveredMiss({ noticeAcknowledgedFor: 'scan-miss' })
    })
    expect(acked.noticeRequired).toBe(false)
    const other = resolveBridgeRoute({
      ...baseInput,
      verdict: uncoveredMiss({ noticeAcknowledgedFor: 'known-bad' })
    })
    expect(other.noticeRequired).toBe(true)
  })

  it('row 7: precedes seed', () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      isSeed: true,
      verdict: uncoveredMiss()
    })
    expect(result.reason).toBe('scan-miss')
  })

  it('row 3/2/6: user-forced-bottle, failed-this-session and user-forced-bridge all beat an uncovered miss', () => {
    expect(
      resolveBridgeRoute({
        ...baseInput,
        verdict: uncoveredMiss({ userRoute: 'bottle' })
      }).reason
    ).toBe('user-forced-bottle')
    expect(
      resolveBridgeRoute({
        ...baseInput,
        failedThisSession: true,
        verdict: uncoveredMiss()
      }).reason
    ).toBe('failed-this-session')
    const forced = resolveBridgeRoute({
      ...baseInput,
      verdict: uncoveredMiss({ userRoute: 'bridge' })
    })
    expect(forced.route).toBe('bridge')
    expect(forced.reason).toBe('user-forced-bridge')
    expect(forced.noticeRequired).toBe(false)
    expect(forced.missingSymbols).toEqual(['NotARealSymbol_v999'])
  })

  it('row 5: an x64 uncovered miss with no Win64 shim -> bottle / win64-no-shim carrying the symbols; with a shim -> bridge / scan-miss', () => {
    const noShim = resolveBridgeRoute({
      ...baseInput,
      verdict: uncoveredMiss({ steamApi: 'x64' }, 'x64')
    })
    expect(noShim.route).toBe('bottle')
    expect(noShim.reason).toBe('win64-no-shim')
    expect(noShim.missingSymbols).toEqual(['NotARealSymbol_v999'])
    const shim = resolveBridgeRoute({
      ...baseInput,
      win64ShimPresent: true,
      verdict: uncoveredMiss({ steamApi: 'x64' }, 'x64')
    })
    expect(shim.route).toBe('bridge')
    expect(shim.reason).toBe('scan-miss')
  })

  it('row 7: D-51-07 auto-clear -- a persisted miss whose symbols are ALL now covered by the real shim is never scan-miss and carries no symbols', () => {
    const verdict: SteamBridgeVerdict = {
      scan: {
        status: 'miss',
        // SteamAPI_Init is a real, always-exported flat symbol -- a stale
        // miss naming only covered symbols must be auto-cleared.
        arch: 'x86',
        missingSymbols: ['SteamAPI_Init'],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'irrelevant',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('pending-scan')
    expect(result.missingSymbols).toEqual([])
  })

  it('row 5: x64 import, no Win64 shim target -> bottle / win64-no-shim (D-51-13 fail-closed)', () => {
    const verdict: SteamBridgeVerdict = { steamApi: 'x64' }
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict,
      win64ShimPresent: false
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('win64-no-shim')
    expect(result.noticeRequired).toBe(true)
  })

  it('row 5: fail-closed also derives x64-ness from a persisted scan.arch, not just steamApi', () => {
    const verdict: SteamBridgeVerdict = {
      scan: {
        status: 'clean',
        arch: 'x64',
        missingSymbols: [],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'irrelevant',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    }
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict,
      win64ShimPresent: false
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('win64-no-shim')
  })

  it('row 5: win64-no-shim fail-closed overrides EVEN a user-forced-bridge override -- never bypassable', () => {
    const verdict: SteamBridgeVerdict = {
      userRoute: 'bridge',
      steamApi: 'x64'
    }
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict,
      win64ShimPresent: false
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('win64-no-shim')
  })

  it('row 5: win64-no-shim notice NOT required when already acknowledged', () => {
    const verdict: SteamBridgeVerdict = {
      noticeAcknowledgedFor: 'win64-no-shim',
      steamApi: 'x64'
    }
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict,
      win64ShimPresent: false
    })
    expect(result.noticeRequired).toBe(false)
  })

  it('row 5: x64 import WITH a Win64 shim target present does not fail closed', () => {
    const verdict: SteamBridgeVerdict = { steamApi: 'x64' }
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict,
      win64ShimPresent: true
    })
    expect(result.route).toBe('bridge')
  })

  it('row 6: verdict.userRoute bridge -> bridge / user-forced-bridge (D-51-11)', () => {
    const verdict: SteamBridgeVerdict = { userRoute: 'bridge' }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('user-forced-bridge')
  })

  it('row 8: isSeed -> bridge / seed', () => {
    const result = resolveBridgeRoute({ ...baseInput, isSeed: true })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('seed')
  })

  it("row 9: verdict.steamApi 'none' -> bridge / no-steam-api", () => {
    const verdict: SteamBridgeVerdict = { steamApi: 'none' }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('no-steam-api')
  })

  it("row 10: scan.status 'clean' -> bridge / scan-clean", () => {
    const verdict: SteamBridgeVerdict = {
      scan: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: { SteamUser: 'SteamUser023' },
        stubbedInterfaces: [],
        shimExportSetVersion: 'irrelevant',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('scan-clean')
  })

  it('row 11: no verdict at all, not a seed, no known-bad -> bridge / pending-scan (never scanned)', () => {
    const result = resolveBridgeRoute({ ...baseInput })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('pending-scan')
  })

  it('copies stubbedInterfaces (from verdict.scan), identityFallback, and userRoute from the verdict verbatim on a bridge route', () => {
    const verdict: SteamBridgeVerdict = {
      identityFallback: true,
      scan: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: {},
        stubbedInterfaces: ['SteamUserStats'],
        shimExportSetVersion: 'irrelevant',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.stubbedInterfaces).toEqual(['SteamUserStats'])
    expect(result.identityFallback).toBe(true)
    expect(result.userRoute).toBeNull()
  })

  it('defaults stubbedInterfaces to [], identityFallback to false, userRoute to null, and installedIn to null when verdict is undefined', () => {
    const result = resolveBridgeRoute({ ...baseInput })
    expect(result.stubbedInterfaces).toEqual([])
    expect(result.identityFallback).toBe(false)
    expect(result.userRoute).toBeNull()
    expect(result.installedIn).toBeNull()
  })

  it('missingSymbols is non-empty only when an uncovered miss exists', () => {
    const miss = resolveBridgeRoute({ ...baseInput, verdict: uncoveredMiss() })
    expect(miss.missingSymbols).not.toEqual([])
    const seedResult = resolveBridgeRoute({ ...baseInput, isSeed: true })
    expect(seedResult.missingSymbols).toEqual([])

    const notEligibleResult = resolveBridgeRoute({
      ...baseInput,
      platformsBottleEligible: false
    })
    expect(notEligibleResult.missingSymbols).toEqual([])
  })

  it('exports NOTICE_REASONS as exactly known-bad, scan-miss, win64-no-shim', () => {
    expect(NOTICE_REASONS).toEqual(
      new Set(['known-bad', 'scan-miss', 'win64-no-shim'])
    )
  })

  it('D-17 pin: a fully-populated BridgeRouteInput fixture has no key matching /forced/i', () => {
    const fixture: BridgeRouteInput = {
      platformsBottleEligible: true,
      isSeed: true,
      knownBadReason: 'drm-wrapped',
      knownFixDrm: 'ceg',
      verdict: {
        userRoute: 'bridge',
        steamApi: 'x64',
        noticeAcknowledgedFor: 'known-bad',
        limitedNoticeShown: true,
        identityFallback: true,
        scan: {
          status: 'clean',
          arch: 'x86',
          missingSymbols: [],
          interfaceVersions: {},
          stubbedInterfaces: [],
          shimExportSetVersion: 'irrelevant',
          scannedAt: '2026-01-01T00:00:00.000Z'
        }
      },
      failedThisSession: true,
      win64ShimPresent: true
    }
    const forcedKeys = Object.keys(fixture).filter((key) => /forced/i.test(key))
    expect(forcedKeys).toEqual([])
  })

  it('D-17 pin: bridgeRoute.ts source contains no forcedWindowsViaBottle token and never imports steamMetadataStore', () => {
    const source = readFileSync(
      join(__dirname, '..', 'bridgeRoute.ts'),
      'utf-8'
    )
    expect(source).not.toMatch(/forcedWindowsViaBottle/)
    expect(source).not.toMatch(/steamMetadataStore/)
  })
})

describe('quick 261024-br4: detected CEG (verdict.drm)', () => {
  it("drm 'ceg' with no bundled reason -> bottle / known-bad / drm-wrapped, notice required", () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict: { drm: 'ceg' }
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.knownBadReason).toBe('drm-wrapped')
    expect(result.noticeRequired).toBe(true)
  })

  it("drm 'ceg' acknowledged for known-bad -> notice not required", () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict: { drm: 'ceg', noticeAcknowledgedFor: 'known-bad' }
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.noticeRequired).toBe(false)
  })

  it("drm 'ceg' with userRoute 'bridge' -> bridge / user-forced-bridge, drm-wrapped carried, no notice", () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict: { drm: 'ceg', userRoute: 'bridge' }
    })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('user-forced-bridge')
    expect(result.knownBadReason).toBe('drm-wrapped')
    expect(result.noticeRequired).toBe(false)
  })

  it("drm 'ceg' beats a bundled does-not-run reason", () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      knownBadReason: 'does-not-run',
      verdict: { drm: 'ceg' }
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.knownBadReason).toBe('drm-wrapped')
  })

  it("drm 'ceg' survives a scan miss the current shim auto-clears", () => {
    const result = resolveBridgeRoute({
      ...baseInput,
      isSeed: true,
      verdict: {
        drm: 'ceg',
        scan: {
          status: 'miss',
          arch: 'x86',
          // exported by the shipped shim, so isScanVerdictNowCovered is true
          missingSymbols: ['SteamUser'],
          interfaceVersions: {},
          stubbedInterfaces: [],
          shimExportSetVersion: 'older',
          scannedAt: '2026-01-01T00:00:00.000Z'
        }
      }
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.knownBadReason).toBe('drm-wrapped')
  })

  it('rows 1-3 still take precedence over a detected CEG', () => {
    expect(
      resolveBridgeRoute({
        ...baseInput,
        platformsBottleEligible: false,
        verdict: { drm: 'ceg' }
      }).route
    ).toBe('not-eligible')
    expect(
      resolveBridgeRoute({
        ...baseInput,
        failedThisSession: true,
        verdict: { drm: 'ceg' }
      }).reason
    ).toBe('failed-this-session')
    expect(
      resolveBridgeRoute({
        ...baseInput,
        verdict: { drm: 'ceg', userRoute: 'bottle' }
      }).reason
    ).toBe('user-forced-bottle')
  })
})

describe('quick 261027-gtd: known-fix drm "ceg" (knownFixDrm)', () => {
  const ceg: BridgeRouteInput = { ...baseInput, knownFixDrm: 'ceg' }

  it('no other signal -> bottle / known-bad / drm-wrapped, notice required', () => {
    const result = resolveBridgeRoute(ceg)
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.knownBadReason).toBe('drm-wrapped')
    expect(result.noticeRequired).toBe(true)
  })

  it('acknowledged for known-bad -> notice not required', () => {
    const result = resolveBridgeRoute({
      ...ceg,
      verdict: { noticeAcknowledgedFor: 'known-bad' }
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.noticeRequired).toBe(false)
  })

  it("userRoute 'bridge' still wins (row 6)", () => {
    const result = resolveBridgeRoute({
      ...ceg,
      verdict: { userRoute: 'bridge' }
    })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('user-forced-bridge')
    expect(result.knownBadReason).toBe('drm-wrapped')
    expect(result.noticeRequired).toBe(false)
  })

  it("userRoute 'bottle' still wins earlier (row 3)", () => {
    expect(
      resolveBridgeRoute({ ...ceg, verdict: { userRoute: 'bottle' } }).reason
    ).toBe('user-forced-bottle')
  })

  it("beats a bundled non-DRM reason ('does-not-run')", () => {
    const result = resolveBridgeRoute({
      ...ceg,
      knownBadReason: 'does-not-run'
    })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
    expect(result.knownBadReason).toBe('drm-wrapped')
  })

  it('row 4 precedes the seed row', () => {
    const result = resolveBridgeRoute({ ...ceg, isSeed: true })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('known-bad')
  })

  it('knownFixDrm null is a no-op', () => {
    const result = resolveBridgeRoute({ ...baseInput, knownFixDrm: null })
    expect(result.route).toBe('bridge')
    expect(result.reason).toBe('pending-scan')
  })
})
