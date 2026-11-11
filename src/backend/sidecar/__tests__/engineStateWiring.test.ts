/**
 * The 'engine-state' boot step (66.3-12, D-05): one engine-state owner per boot, built before
 * 'store-managers', whose publisher is the sidecar's frontend push (`engineStateChanged`).
 */
import { bootFresh } from './helpers/sidecarHarness'
import type { LaunchDecision } from '../../engine/engineDecision'

describe('boot-owned engine state (66.3-12)', () => {
  it("builds the owner in 'engine-state', before 'store-managers'", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BOOT_STEP_NAMES } = require('../bootstrap') as {
      BOOT_STEP_NAMES: readonly string[]
    }
    expect(BOOT_STEP_NAMES.indexOf('engine-state')).toBeGreaterThan(-1)
    expect(BOOT_STEP_NAMES.indexOf('engine-state')).toBeLessThan(
      BOOT_STEP_NAMES.indexOf('store-managers')
    )
  })

  it('one boot carries one owner whose publisher pushes engineStateChanged', () => {
    const { services, frames } = bootFresh()
    const decision = {
      kind: 'use',
      selection: { kind: 'builtin', label: 'Wine', reason: 'cx-missing' },
      override: 'automatic',
      preflight: null,
      logLines: []
    } as unknown as LaunchDecision

    services.engineState.recordLaunchDecision(
      { runner: 'legendary', appName: 'abc' },
      decision,
      'GameLib',
      {
        bottleFor: () => 'GameLib',
        stateWithoutBottle: true,
        overrideEligible: () => true,
        overlayEligible: false,
        effective: () => ({
          kind: 'override',
          id: 'automatic',
          source: 'derived'
        })
      }
    )

    const pushed = frames.filter((f) =>
      JSON.stringify(f).includes('engineStateChanged')
    )
    expect(pushed).toHaveLength(1)
  })
})
