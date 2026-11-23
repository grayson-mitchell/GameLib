/**
 * The tool-settings shim (Phase 87, 87-56a, D-03, D-23): one typed call carrying exactly what the caller resolved. The
 * shape is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what comes back untouched.
 */
import {
  RUST_ENGINE_NON_CROSSOVER_ENGINE,
  RUST_ENGINE_RESOLVE_TOOL_SETTINGS
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  resolveEngineToolSettings,
  resolveNonCrossoverEngine
} from '../toolSettings'

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

describe('resolveEngineToolSettings', () => {
  it('sends the game, its stored settings and the bottle flag as one object and resolves the reply untouched', async () => {
    const reply = {
      kind: 'engine',
      key: 'gog:1',
      settings: { winePrefix: '/b' }
    }
    const deps = fakeTransport(reply)
    const request = {
      runner: 'gog' as const,
      appName: '1',
      platform: 'Windows' as const,
      stored: { winePrefix: '/old' } as never,
      ensureBottle: true
    }
    await expect(resolveEngineToolSettings(deps, request)).resolves.toBe(reply)
    expect(deps.calls).toEqual([[RUST_ENGINE_RESOLVE_TOOL_SETTINGS, [request]]])
  })

  it('rejects with the transport failure rather than answering a result', async () => {
    const deps: RustInvokeDeps = {
      requestRustInvoke: (() =>
        Promise.reject(
          new Error('engine_resolve_tool_settings:bad-args')
        )) as unknown as RustInvokeDeps['requestRustInvoke']
    }
    await expect(
      resolveEngineToolSettings(deps, {
        runner: 'gog',
        appName: '1',
        stored: {} as never,
        ensureBottle: false
      })
    ).rejects.toThrow('engine_resolve_tool_settings:bad-args')
  })
})

describe('resolveNonCrossoverEngine', () => {
  it('sends the engine id as one object and resolves the engine, or null, untouched', async () => {
    const engine = { wineBin: '/w/wine', wineserverBin: '/w/wineserver' }
    const deps = fakeTransport(engine)
    await expect(
      resolveNonCrossoverEngine(deps, { engineId: 'pinned:wine-staging-11.20' })
    ).resolves.toBe(engine)
    expect(deps.calls).toEqual([
      [
        RUST_ENGINE_NON_CROSSOVER_ENGINE,
        [{ engineId: 'pinned:wine-staging-11.20' }]
      ]
    ])
    await expect(
      resolveNonCrossoverEngine(fakeTransport(null), { engineId: 'automatic' })
    ).resolves.toBeNull()
  })

  it('rejects with the transport failure', async () => {
    const deps: RustInvokeDeps = {
      requestRustInvoke: (() =>
        Promise.reject(
          new Error('engine_non_crossover_engine:bad-args')
        )) as unknown as RustInvokeDeps['requestRustInvoke']
    }
    await expect(
      resolveNonCrossoverEngine(deps, { engineId: '' })
    ).rejects.toThrow('engine_non_crossover_engine:bad-args')
  })
})
