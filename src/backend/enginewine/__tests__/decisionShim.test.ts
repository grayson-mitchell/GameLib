/**
 * The engine decision shims (Phase 87, 87-54, D-03, D-15): each is one typed call carrying exactly what the caller
 * resolved. The shape of every shim is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what
 * comes back untouched.
 */
import {
  RUST_ENGINE_CX_RESOLVE_BIN_DIR,
  RUST_ENGINE_DECIDE_CREATION,
  RUST_ENGINE_DECIDE_LAUNCH,
  RUST_ENGINE_IS_CROSSOVER_MISSING,
  RUST_ENGINE_PREFLIGHT_CROSSOVER
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  decideCreationEngine,
  decideLaunchEngine,
  isCrossoverMissing,
  preflightCrossover,
  resolveCrossoverBinDir
} from '../decision'

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

describe('decideLaunchEngine', () => {
  it('sends the override, the monitor phase and the wine-binary hints as values and resolves the reply untouched', async () => {
    const reply = { kind: 'unavailable', override: 'crossover', detail: 'x' }
    const deps = fakeTransport(reply)
    const request = {
      key: '620',
      bottleName: 'GameLib-Bridge-620',
      override: 'wine-manager:Wine-9',
      monitorPhase: 'running' as const,
      hintWineBins: ['/cx/bin/wine']
    }
    await expect(decideLaunchEngine(deps, request)).resolves.toBe(reply)
    expect(deps.calls).toEqual([[RUST_ENGINE_DECIDE_LAUNCH, [request]]])
  })

  it('rejects with the transport failure rather than answering a decision', async () => {
    const deps: RustInvokeDeps = {
      requestRustInvoke: (() =>
        Promise.reject(
          new Error('engine_decide_launch:bad-args')
        )) as unknown as RustInvokeDeps['requestRustInvoke']
    }
    await expect(
      decideLaunchEngine(deps, { key: '620', bottleName: 'b' })
    ).rejects.toThrow('engine_decide_launch:bad-args')
  })
})

describe('decideCreationEngine', () => {
  it('sends the key and resolves the wrapped decision untouched', async () => {
    const reply = {
      decision: { kind: 'crossover', createTimeoutMs: 120000 },
      createCapMs: 120000
    }
    const deps = fakeTransport(reply)
    await expect(decideCreationEngine(deps, { key: '620' })).resolves.toBe(
      reply
    )
    expect(deps.calls).toEqual([
      [RUST_ENGINE_DECIDE_CREATION, [{ key: '620' }]]
    ])
  })
})

describe('preflightCrossover', () => {
  it('sends the bottle and the hints and resolves the pre-flight untouched', async () => {
    const reply = { kind: 'missing', detail: 'CrossOver is not installed' }
    const deps = fakeTransport(reply)
    const request = { bottleName: 'GameLib-Steam', hintWineBins: ['/w'] }
    await expect(preflightCrossover(deps, request)).resolves.toBe(reply)
    expect(deps.calls).toEqual([[RUST_ENGINE_PREFLIGHT_CROSSOVER, [request]]])
  })
})

describe('isCrossoverMissing', () => {
  it('sends the hints and resolves the boolean untouched', async () => {
    const deps = fakeTransport(true)
    await expect(isCrossoverMissing(deps, { hintWineBins: [] })).resolves.toBe(
      true
    )
    expect(deps.calls).toEqual([
      [RUST_ENGINE_IS_CROSSOVER_MISSING, [{ hintWineBins: [] }]]
    ])
  })
})

describe('resolveCrossoverBinDir', () => {
  it('sends the hinted wine binaries as one object and resolves the reply untouched', async () => {
    const deps = fakeTransport('/Applications/CrossOver.app/bin')
    const request = { hintWineBins: ['/cx/bin/wine'] }
    await expect(resolveCrossoverBinDir(deps, request)).resolves.toBe(
      '/Applications/CrossOver.app/bin'
    )
    expect(deps.calls).toEqual([[RUST_ENGINE_CX_RESOLVE_BIN_DIR, [request]]])
  })

  it('resolves null for "not installed" without interpreting it', async () => {
    await expect(
      resolveCrossoverBinDir(fakeTransport(null), {})
    ).resolves.toBeNull()
  })
})
