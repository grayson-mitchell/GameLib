import { readFileSync } from 'fs'
import { join } from 'path'

import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import { resolveBridgeRouteDisplay } from '../bridgeRouteDisplay'

/**
 * Phase 51, Plan 16 (D-51-09/D-51-02) -- the game page's route row next to
 * the AppleGamingWiki compatibility rating, as a pure, zero-React-import
 * module mirroring `steamBridgeRouteLine.ts`'s install-dialog sibling and
 * `steamBottleDefaults.ts`'s existing jsdom-free pattern in this same
 * directory.
 */

function makeVerdict(
  overrides: Partial<SteamBridgeRouteVerdict> = {}
): SteamBridgeRouteVerdict {
  return {
    route: 'bridge',
    reason: null,
    knownBadReason: null,
    missingSymbols: [],
    noticeRequired: false,
    stubbedInterfaces: [],
    identityFallback: false,
    userRoute: null,
    installedIn: null,
    ...overrides
  }
}

describe('resolveBridgeRouteDisplay', () => {
  it('is invisible when the verdict is undefined', () => {
    expect(resolveBridgeRouteDisplay(undefined).visible).toBe(false)
  })

  it('is invisible when the route is not-eligible', () => {
    expect(
      resolveBridgeRouteDisplay(makeVerdict({ route: 'not-eligible' })).visible
    ).toBe(false)
  })

  it('an install already living in the bridge always shows the native route, regardless of the live route verdict', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({ route: 'bottle', installedIn: 'bridge' })
    )
    expect(display.routeKey).toBe('native')
  })

  it('an install already living in the bottle shows the bottled route and suppresses the reason once the live route no longer agrees', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({
        route: 'bridge',
        reason: 'scan-clean',
        installedIn: 'bottle'
      })
    )
    expect(display.routeKey).toBe('bottled')
    expect(display.reasonKey).toBeNull()
  })

  it('an install already living in the bottle keeps the reason while the live route still agrees', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({
        route: 'bottle',
        reason: 'known-bad',
        knownBadReason: 'does-not-run',
        installedIn: 'bottle'
      })
    )
    expect(display.routeKey).toBe('bottled')
    expect(display.reasonKey).toBe('steam.bridge.route.reason.knownBad')
    expect(display.reasonParams).toEqual({
      reasonKey: 'steam.bridge.knownBad.doesNotRun'
    })
  })

  it('a not-yet-installed game takes its route and reason straight from the verdict', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({ route: 'bridge', reason: 'seed', installedIn: null })
    )
    expect(display.routeKey).toBe('native')
    expect(display.reasonKey).toBe('steam.bridge.route.reason.seed')
  })

  it('stubbed interfaces served through a live bridge install add the limited-features body line', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({
        installedIn: 'bridge',
        stubbedInterfaces: ['SteamRemoteStorage']
      })
    )
    expect(display.limitedLineKeys).toEqual(['steam.bridge.limited.body'])
  })

  it('an identity fallback on a live bridge install appends the identity-fallback line after the body line', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({
        installedIn: 'bridge',
        stubbedInterfaces: ['SteamRemoteStorage'],
        identityFallback: true
      })
    )
    expect(display.limitedLineKeys).toEqual([
      'steam.bridge.limited.body',
      'steam.bridge.limited.identityFallback'
    ])
  })

  it('limited-feature lines never appear for a bottle install, even with stubbed interfaces recorded', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({
        installedIn: 'bottle',
        stubbedInterfaces: ['SteamRemoteStorage'],
        identityFallback: true
      })
    )
    expect(display.limitedLineKeys).toEqual([])
  })

  it('passes missing symbols through verbatim', () => {
    const display = resolveBridgeRouteDisplay(
      makeVerdict({
        route: 'bottle',
        reason: 'scan-miss',
        missingSymbols: ['SteamUtils005']
      })
    )
    expect(display.missingSymbols).toEqual(['SteamUtils005'])
  })

  it('has at most one import statement, and it is the shared steam type -- zero React / frontend imports', () => {
    const source = readFileSync(
      join(__dirname, '..', 'bridgeRouteDisplay.ts'),
      'utf8'
    )
    const importStartLines = source
      .split('\n')
      .filter((line) => line.startsWith('import'))
    expect(importStartLines.length).toBeLessThanOrEqual(1)
    if (importStartLines.length === 1) {
      expect(source).toMatch(/^import[^;]*common\/types\/steam/m)
    }
  })
})
