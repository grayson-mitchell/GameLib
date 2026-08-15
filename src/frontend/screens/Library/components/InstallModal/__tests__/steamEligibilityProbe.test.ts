import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { SteamBottleEligibilityVerdict } from 'common/types/steam'
import type { SteamSectionGatingVerdict } from '../steamSectionGating'
import {
  shouldProbeEligibility,
  initialEligibilityState,
  applyEligibilityResponse,
  applyEligibilityFailure,
  isEligibilityPending,
  applyEligibilityPending,
  type EligibilityState
} from '../steamEligibilityProbe'

/**
 * Phase 34.13, Plan 11, Task 1 -- D-25's eligibility state machine
 * (`34.13-CONTEXT.md` D-25, lines 277-286). This is the EXACT INVERSION of
 * the retired D-12 contract: under D-12 the probe ran BEFORE the dialog
 * opened and the busy state lived on the ORIGIN control; under D-25 the
 * dialog opens INSTANTLY and the probe runs AFTER, inside a `useEffect`,
 * with the busy state living in the wine-section slot and on the dialog's
 * OWN footer Install button (34.13-11's Task 3).
 *
 * The worst case is a cold metadata cache: `METADATA_FETCH_TIMEOUT_MS`
 * (15000ms, `state.ts:30`) is the bound `checkBottleEligibility()` inherits.
 * Under D-25 that 15s is spent with the dialog OPEN and its own Install
 * button disabled -- never with an origin button spinning.
 *
 * VACUITY BOUNDARY: every spec below is a pure function assertion. Nothing
 * here proves anything renders -- that is `EligibilityLoadingRow.test.tsx`
 * (Task 2, direct-invocation proof) and 34.13-13's blocking manual gate.
 */

const distinctiveVerdict: SteamSectionGatingVerdict = {
  platformRow: 'selectable',
  libraryDropdown: true,
  wineSection: true,
  freeSpaceLine: true,
  contentLightNotice: true,
  forceWindowsViaBottle: true
}

describe('shouldProbeEligibility / initialEligibilityState', () => {
  it('probes on macOS', () => {
    expect(
      shouldProbeEligibility({ platform: 'darwin', runner: 'steam', action: 'install' })
    ).toBe(true)
    const state = initialEligibilityState({
      platform: 'darwin',
      runner: 'steam',
      appName: '440',
      action: 'install'
    })
    expect(isEligibilityPending(state)).toBe(true)
  })

  it('skips on Windows and on Linux', () => {
    for (const platform of ['win32', 'linux'] as const) {
      expect(shouldProbeEligibility({ platform, runner: 'steam', action: 'install' })).toBe(
        false
      )
      const state = initialEligibilityState({
        platform,
        runner: 'steam',
        appName: '440',
        action: 'install'
      })
      expect(isEligibilityPending(state)).toBe(false)
      expect(state).toMatchObject({ bottleRequired: false })
    }
  })

  it("DISCRIMINATOR: an unknown platform still asks the backend — the gate is written as an explicit win32/linux skip, never as !== darwin", () => {
    // An implementation written as `platform === 'darwin'` or
    // `platform !== 'darwin'` passes the two specs above and fails ONLY
    // this one -- the inverted form is the historical shape of a cold-cache
    // "not eligible" false negative
    // (`.planning/debug/steam-bottle-guided-setup-never-fires.md`).
    for (const platform of [undefined, '', 'freebsd']) {
      expect(shouldProbeEligibility({ platform, runner: 'steam', action: 'install' })).toBe(
        true
      )
      const state = initialEligibilityState({
        platform,
        runner: 'steam',
        appName: '440',
        action: 'install'
      })
      expect(isEligibilityPending(state)).toBe(true)
    }
  })

  // 34.13 review WR-08: `InstallModal`'s consuming branch requires
  // `action === 'install'`, so the IMPORT dialog discards any verdict the
  // probe produces -- but the probe still cost a real `appdetails` fetch
  // and a poll bounded only by METADATA_FETCH_TIMEOUT_MS (15s).
  it("WR-08: a Steam IMPORT on macOS never probes -- the branch that would consume the verdict requires action === 'install'", () => {
    expect(
      shouldProbeEligibility({
        platform: 'darwin',
        runner: 'steam',
        action: 'import'
      })
    ).toBe(false)
    const state = initialEligibilityState({
      platform: 'darwin',
      runner: 'steam',
      appName: '440',
      action: 'import'
    })
    expect(isEligibilityPending(state)).toBe(false)
    expect(state).toMatchObject({ bottleRequired: false })
  })

  it('WR-08-RED: the pre-fix gate (platform+runner only) would have probed that same macOS import', () => {
    // The shipped implementation, written out so the discriminator is
    // visible rather than asserted: it answers `true` for exactly the case
    // the fixed gate refuses.
    const preFix = ({
      platform,
      runner
    }: {
      platform: string | undefined
      runner: string
    }) => runner === 'steam' && platform !== 'win32' && platform !== 'linux'
    expect(preFix({ platform: 'darwin', runner: 'steam' })).toBe(true)
    expect(
      shouldProbeEligibility({
        platform: 'darwin',
        runner: 'steam',
        action: 'import'
      })
    ).toBe(false)
  })

  it('a non-steam runner never probes', () => {
    expect(shouldProbeEligibility({ platform: 'darwin', runner: 'gog', action: 'install' })).toBe(
      false
    )
    const state = initialEligibilityState({
      platform: 'darwin',
      runner: 'gog',
      appName: '440',
      action: 'install'
    })
    expect(isEligibilityPending(state)).toBe(false)
  })
})

describe('applyEligibilityResponse / applyEligibilityFailure', () => {
  it('a resolved verdict for the current game ends the pending phase', () => {
    const pending: EligibilityState = { phase: 'pending', appName: '440' }
    const trueVerdict: SteamBottleEligibilityVerdict = { eligible: true }
    const falseVerdict: SteamBottleEligibilityVerdict = { eligible: false }

    const resolvedTrue = applyEligibilityResponse(pending, {
      appName: '440',
      verdict: trueVerdict
    })
    expect(isEligibilityPending(resolvedTrue)).toBe(false)
    expect(resolvedTrue).toMatchObject({ bottleRequired: true })

    const resolvedFalse = applyEligibilityResponse(pending, {
      appName: '440',
      verdict: falseVerdict
    })
    expect(isEligibilityPending(resolvedFalse)).toBe(false)
    expect(resolvedFalse).toMatchObject({ bottleRequired: false })
  })

  it('DISCRIMINATOR: a late verdict for a DIFFERENT game is discarded', () => {
    // T-34.13-11-02. An implementation that ignores `appName` passes every
    // other spec in this file and fails only this one.
    let state: EligibilityState = { phase: 'pending', appName: '440' }

    state = applyEligibilityResponse(state, {
      appName: '570',
      verdict: { eligible: true }
    })
    expect(isEligibilityPending(state)).toBe(true)
    expect(state).not.toHaveProperty('bottleRequired')

    state = applyEligibilityResponse(state, {
      appName: '440',
      verdict: { eligible: true }
    })
    expect(isEligibilityPending(state)).toBe(false)
    expect(state).toMatchObject({ bottleRequired: true })
  })

  it('a rejected probe resolves fail-closed, it does not stay pending forever', () => {
    // T-34.13-11-01. UI-SPEC: "a timeout is not modeled as its own error
    // state (falls back to 'not eligible')".
    const pending: EligibilityState = { phase: 'pending', appName: '440' }
    const resolved = applyEligibilityFailure(pending, { appName: '440' })
    expect(isEligibilityPending(resolved)).toBe(false)
    expect(resolved).toMatchObject({ bottleRequired: false })
  })

  it('a rejection for a different game is also discarded, matching the response reducer', () => {
    const pending: EligibilityState = { phase: 'pending', appName: '440' }
    const state = applyEligibilityFailure(pending, { appName: '570' })
    expect(isEligibilityPending(state)).toBe(true)
  })
})

describe('applyEligibilityPending', () => {
  it('applyEligibilityPending is identity when not pending', () => {
    expect(applyEligibilityPending(distinctiveVerdict, false)).toEqual(
      distinctiveVerdict
    )
  })

  it('applyEligibilityPending suppresses exactly three fields while pending', () => {
    const result = applyEligibilityPending(distinctiveVerdict, true)
    expect(result.wineSection).toBe(false)
    expect(result.libraryDropdown).toBe(false)
    expect(result.freeSpaceLine).toBe(false)
    expect(result.platformRow).toBe(distinctiveVerdict.platformRow)
    expect(result.contentLightNotice).toBe(distinctiveVerdict.contentLightNotice)
    expect(result.forceWindowsViaBottle).toBe(
      distinctiveVerdict.forceWindowsViaBottle
    )
  })

  it('DISCRIMINATOR: the platform row is NOT suppressed while pending', () => {
    // A saboteur that clears the whole verdict passes the previous spec's
    // first half and fails only here -- the platform row is synchronously
    // known (D-03/D-17/D-19) and hiding it would make the dialog look empty
    // on open, the D-20 corner this phase already decided not to create.
    const verdict: SteamSectionGatingVerdict = {
      ...distinctiveVerdict,
      platformRow: 'readonly-macos'
    }
    const result = applyEligibilityPending(verdict, true)
    expect(result.platformRow).toBe('readonly-macos')
  })
})

describe('source gates', () => {
  const MODULE_PATH = join(__dirname, '..', 'steamEligibilityProbe.ts')
  const stripped = stripSourceComments(readFileSync(MODULE_PATH, 'utf8'))

  it('zero matches of is_mac_native, mac_arch, steamPlatformsCaptured -- the D-09 no-renderer-re-derivation rule', () => {
    for (const token of [
      'is_mac_native',
      'mac_arch',
      'steamPlatformsCaptured'
    ]) {
      expect(stripped.includes(token)).toBe(false)
    }
  })

  it('the same three searches DO hit an inline known-bad specimen -- proving the gate above is non-vacuous', () => {
    const specimen = stripSourceComments(
      "const a = gameInfo?.is_mac_native\nconst b = mac_arch\nconst c = steamPlatformsCaptured"
    )
    for (const token of [
      'is_mac_native',
      'mac_arch',
      'steamPlatformsCaptured'
    ]) {
      expect(specimen.includes(token)).toBe(true)
    }
  })

  it('window.api.isSteamBottleEligible( appears exactly once -- the ONLY IPC call site', () => {
    expect(
      stripped.split('window.api.isSteamBottleEligible(').length - 1
    ).toBe(1)
  })

  it('zero matches of a second /^\\d+$/-style appId validation -- 34.13-07 owns the guard, never duplicated here', () => {
    expect(stripped.includes('^\\d+$')).toBe(false)
  })

  it("the effect's cleanup exists -- 'return () =>' inside the useEffect, and a cancelled flag (belt-and-braces over the reducer's own appName guard)", () => {
    expect(stripped).toContain('return () =>')
    expect(stripped).toContain('cancelled')
  })
})
