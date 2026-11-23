/**
 * The bottle shims (Phase 87, 87-42, D-03, D-15): each is one typed call carrying exactly what the caller resolved.
 * The shape of every shim is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what comes
 * back.
 */
import { RUST_ENGINE_BOTTLE_PREPARE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { EngineSelection } from 'backend/engine/engineTypes'
import { prepareBottleForEngine } from '../bottles'

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

const NEXT: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: '26.3',
  binDir: '/cx/bin'
}

describe('prepareBottleForEngine', () => {
  it('sends the values the TS callbacks used to supply and resolves the reply untouched', async () => {
    const reply = { ok: true, changed: false, selection: NEXT }
    const deps = fakeTransport(reply)
    const request = {
      key: '620',
      bottleName: 'GameLibSteamBridge-620',
      next: NEXT,
      monitorPhase: 'running' as const,
      ownBottle: { name: 'GameLibSteamBridge-620' },
      crossoverSettings: { winePrefix: '/p' } as never,
      crossoverHealthy: false,
      fallbackSettings: {} as never,
      registerSelection: true
    }
    expect(await prepareBottleForEngine(deps, request)).toBe(reply)
    expect(deps.calls).toEqual([[RUST_ENGINE_BOTTLE_PREPARE, [request]]])
  })

  it("rejects with Rust's category word when the call could not be made", async () => {
    const deps: RustInvokeDeps = {
      requestRustInvoke: (() =>
        Promise.reject(
          new Error('engine_bottle_prepare:bad-args')
        )) as unknown as RustInvokeDeps['requestRustInvoke']
    }
    await expect(
      prepareBottleForEngine(deps, { key: 'x', bottleName: 'b', next: NEXT })
    ).rejects.toThrow('engine_bottle_prepare:bad-args')
  })
})
