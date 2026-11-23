/**
 * The engine state shims (Phase 87, 87-54, D-03, D-15): each is one typed call carrying exactly what the caller
 * resolved. The shape of every shim is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what
 * comes back untouched.
 */
import {
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE,
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE,
  RUST_ENGINE_STATE_RECORD_DECISION
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  publishOverlayExitNotice,
  publishOverlayNotice,
  recordLaunchDecision
} from '../state'

function fakeTransport(answer: unknown): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(answer)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

describe('recordLaunchDecision', () => {
  it('sends the decision with the bridge facts as values and resolves the answer untouched', async () => {
    const deps = fakeTransport(true)
    const request = {
      runner: 'steam',
      appName: '620',
      bottleName: 'GameLib-Bridge-620',
      override: 'automatic',
      selection: {
        kind: 'crossover' as const,
        reason: 'cx-healthy' as const,
        crossoverBuild: '26.3',
        binDir: '/cx/bin'
      },
      preflight: null,
      facts: {
        bottle: 'GameLib-Bridge-620',
        overrideEligible: true,
        overlayEligible: true,
        wineToolsEligible: true,
        prefixKind: 'bottle' as const,
        perGameBottleName: 'GameLib-Bridge-620'
      }
    }
    await expect(recordLaunchDecision(deps, request)).resolves.toBe(true)
    expect(deps.calls).toEqual([[RUST_ENGINE_STATE_RECORD_DECISION, [request]]])
  })
})

describe('publishOverlayNotice', () => {
  it('sends the game and the failed step', async () => {
    const deps = fakeTransport(false)
    const request = { runner: 'steam', appName: '620', step: 'shim' as const }
    await expect(publishOverlayNotice(deps, request)).resolves.toBe(false)
    expect(deps.calls).toEqual([
      [RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE, [request]]
    ])
  })
})

describe('publishOverlayExitNotice', () => {
  it('sends the game', async () => {
    const deps = fakeTransport(true)
    const request = { runner: 'steam', appName: '620' }
    await expect(publishOverlayExitNotice(deps, request)).resolves.toBe(true)
    expect(deps.calls).toEqual([
      [RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE, [request]]
    ])
  })
})
