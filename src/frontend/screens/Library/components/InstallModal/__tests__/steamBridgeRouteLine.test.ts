import { readFileSync } from 'fs'
import { join } from 'path'

import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import {
  resolveBridgeRouteLine,
  resolveForceBottleDisplayed,
  resolveForceBottleWrite
} from '../steamBridgeRouteLine'

/**
 * Phase 51, Plan 16 (D-51-09/D-51-10) -- the install dialog's wine-section
 * route line + force-bottled toggle, as a pure zero-React-import module
 * (same jsdom-less-jest extraction pattern `steamSectionGating.ts` and
 * `steamPlatformRow.ts` already use -- see this module's own header).
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

describe('resolveBridgeRouteLine', () => {
  it('is invisible when the verdict is undefined', () => {
    expect(resolveBridgeRouteLine(undefined, true).visible).toBe(false)
  })

  it('is invisible when the route is not-eligible', () => {
    expect(
      resolveBridgeRouteLine(makeVerdict({ route: 'not-eligible' }), true)
        .visible
    ).toBe(false)
  })

  it('is invisible when the wine section itself is not visible, even with a real verdict', () => {
    expect(
      resolveBridgeRouteLine(
        makeVerdict({ route: 'bridge', reason: 'seed' }),
        false
      ).visible
    ).toBe(false)
  })

  it('a seeded bridge route shows the native label, the seed reason, and an unchecked toggle', () => {
    const line = resolveBridgeRouteLine(
      makeVerdict({ route: 'bridge', reason: 'seed' }),
      true
    )
    expect(line).toEqual({
      visible: true,
      routeKey: 'native',
      reasonKey: 'steam.bridge.route.reason.seed',
      reasonParams: {},
      missingSymbols: [],
      showForceBottleToggle: true,
      forceBottleChecked: false
    })
  })

  it('a user-forced-bottle route shows the bottled label and a checked toggle', () => {
    const line = resolveBridgeRouteLine(
      makeVerdict({
        route: 'bottle',
        reason: 'user-forced-bottle',
        userRoute: 'bottle'
      }),
      true
    )
    expect(line.routeKey).toBe('bottled')
    expect(line.showForceBottleToggle).toBe(true)
    expect(line.forceBottleChecked).toBe(true)
  })

  it('a known-bad route hides the toggle and surfaces the translated known-bad reason key', () => {
    const line = resolveBridgeRouteLine(
      makeVerdict({
        route: 'bottle',
        reason: 'known-bad',
        knownBadReason: 'win64-only'
      }),
      true
    )
    expect(line.showForceBottleToggle).toBe(false)
    expect(line.reasonParams).toEqual({
      reasonKey: 'steam.bridge.knownBad.win64Only'
    })
  })

  it('a scan-miss route carries the missing symbols through verbatim', () => {
    const line = resolveBridgeRouteLine(
      makeVerdict({
        route: 'bottle',
        reason: 'scan-miss',
        missingSymbols: ['SteamUtils005']
      }),
      true
    )
    expect(line.missingSymbols).toEqual(['SteamUtils005'])
  })

  it('a win64-no-shim route also hides the toggle (D-51-13 fail-closed default never offers an override)', () => {
    const line = resolveBridgeRouteLine(
      makeVerdict({ route: 'bottle', reason: 'win64-no-shim' }),
      true
    )
    expect(line.showForceBottleToggle).toBe(false)
  })

  it('every reason maps to its own steam.bridge.route.reason.* key', () => {
    const cases: Array<
      [NonNullable<SteamBridgeRouteVerdict['reason']>, string]
    > = [
      ['seed', 'steam.bridge.route.reason.seed'],
      ['scan-clean', 'steam.bridge.route.reason.scanClean'],
      ['pending-scan', 'steam.bridge.route.reason.pendingScan'],
      ['no-steam-api', 'steam.bridge.route.reason.noSteamApi'],
      ['user-forced-bridge', 'steam.bridge.route.reason.userForcedBridge'],
      ['scan-miss', 'steam.bridge.route.reason.scanMiss'],
      ['known-bad', 'steam.bridge.route.reason.knownBad'],
      ['win64-no-shim', 'steam.bridge.route.reason.win64NoShim'],
      ['user-forced-bottle', 'steam.bridge.route.reason.userForcedBottle'],
      ['failed-this-session', 'steam.bridge.route.reason.failedThisSession']
    ]
    for (const [reason, key] of cases) {
      expect(
        resolveBridgeRouteLine(makeVerdict({ route: 'bridge', reason }), true)
          .reasonKey
      ).toBe(key)
    }
  })

  it('has at most one import statement, and it is the shared steam type -- zero React / frontend imports', () => {
    const source = readFileSync(
      join(__dirname, '..', 'steamBridgeRouteLine.ts'),
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

// 51-REVIEW WR-11: the toggle's flip is held locally and only persisted with
// the Install action -- a cancelled dialog writes nothing, and a stored
// 'bridge' override is never clobbered by an unchecked toggle.
describe('resolveForceBottleWrite / resolveForceBottleDisplayed (WR-11)', () => {
  const lineFor = (userRoute: SteamBridgeRouteVerdict['userRoute']) =>
    resolveBridgeRouteLine(
      makeVerdict({ reason: 'pending-scan', userRoute }),
      true
    )

  it('untouched toggle (pending null) writes nothing and displays the persisted value', () => {
    expect(resolveForceBottleWrite(lineFor('bottle'), null)).toBe('unchanged')
    expect(resolveForceBottleDisplayed(lineFor('bottle'), null)).toBe(true)
    expect(resolveForceBottleDisplayed(lineFor(null), null)).toBe(false)
  })

  it("checking from no override writes 'bottle'", () => {
    expect(resolveForceBottleWrite(lineFor(null), true)).toBe('bottle')
  })

  it("unchecking a stored 'bottle' writes null", () => {
    expect(resolveForceBottleWrite(lineFor('bottle'), false)).toBeNull()
  })

  it('flipping and flipping back writes nothing', () => {
    expect(resolveForceBottleWrite(lineFor(null), false)).toBe('unchanged')
    expect(resolveForceBottleWrite(lineFor('bottle'), true)).toBe('unchanged')
  })

  it("a stored 'bridge' override displays unchecked and is never overwritten unless the user checks the box", () => {
    expect(resolveForceBottleDisplayed(lineFor('bridge'), null)).toBe(false)
    expect(resolveForceBottleWrite(lineFor('bridge'), null)).toBe('unchanged')
    expect(resolveForceBottleWrite(lineFor('bridge'), false)).toBe('unchanged')
    expect(resolveForceBottleWrite(lineFor('bridge'), true)).toBe('bottle')
  })

  it('a hidden toggle (known-bad) never writes, even with a stale pending flip', () => {
    const hidden = resolveBridgeRouteLine(
      makeVerdict({ reason: 'known-bad', knownBadReason: 'does-not-run' }),
      true
    )
    expect(hidden.showForceBottleToggle).toBe(false)
    expect(resolveForceBottleWrite(hidden, true)).toBe('unchanged')
  })
})
