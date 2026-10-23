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

    it('a scan miss wins; one notice, per the scan-miss acknowledgement only', () => {
      const result = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run',
        verdict: missVerdict({ noticeAcknowledgedFor: 'known-bad' })
      })
      expect(result.route).toBe('bottle')
      expect(result.reason).toBe('scan-miss')
      expect(result.knownBadReason).toBe('does-not-run')
      expect(result.noticeRequired).toBe(true)
      const acked = resolveBridgeRoute({
        ...baseInput,
        knownBadReason: 'does-not-run',
        verdict: missVerdict({ noticeAcknowledgedFor: 'scan-miss' })
      })
      expect(acked.noticeRequired).toBe(false)
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

  it('row 5: a persisted scan miss, not covered, userRoute not bridge -> bottle / scan-miss (D-51-11 offers the override)', () => {
    const verdict: SteamBridgeVerdict = {
      scan: {
        status: 'miss',
        arch: 'x86',
        missingSymbols: ['NotARealSymbol_v999'],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'irrelevant',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.route).toBe('bottle')
    expect(result.reason).toBe('scan-miss')
    expect(result.missingSymbols).toEqual(['NotARealSymbol_v999'])
    expect(result.noticeRequired).toBe(true)
  })

  it('row 5: scan-miss notice NOT required when already acknowledged for scan-miss', () => {
    const verdict: SteamBridgeVerdict = {
      noticeAcknowledgedFor: 'scan-miss',
      scan: {
        status: 'miss',
        arch: 'x86',
        missingSymbols: ['NotARealSymbol_v999'],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'irrelevant',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    }
    const result = resolveBridgeRoute({ ...baseInput, verdict })
    expect(result.noticeRequired).toBe(false)
  })

  it('row 5: D-51-07 auto-clear -- a persisted miss whose symbols are ALL now covered by the real shim does not route to bottle', () => {
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
  })

  it('row 6: x64 import, no Win64 shim target -> bottle / win64-no-shim (D-51-13 fail-closed)', () => {
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

  it('row 6: fail-closed also derives x64-ness from a persisted scan.arch, not just steamApi', () => {
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

  it('row 6: win64-no-shim fail-closed overrides EVEN a user-forced-bridge override -- never bypassable', () => {
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

  it('row 6: win64-no-shim notice NOT required when already acknowledged', () => {
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

  it('row 6: x64 import WITH a Win64 shim target present does not fail closed', () => {
    const verdict: SteamBridgeVerdict = { steamApi: 'x64' }
    const result = resolveBridgeRoute({
      ...baseInput,
      verdict,
      win64ShimPresent: true
    })
    expect(result.route).toBe('bridge')
  })

  it('row 7: verdict.userRoute bridge -> bridge / user-forced-bridge (D-51-11)', () => {
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

  it('missingSymbols is [] on every route except scan-miss', () => {
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
