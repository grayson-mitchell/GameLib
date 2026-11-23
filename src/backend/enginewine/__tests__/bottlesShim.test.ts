/**
 * The bottle shims (Phase 87, 87-42, D-03, D-15): each is one typed call carrying exactly what the caller resolved.
 * The shape of every shim is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what comes
 * back.
 */
import {
  RUST_ENGINE_BOTTLE_CANCEL_CREATE,
  RUST_ENGINE_BOTTLE_CREATE_FALLBACK,
  RUST_ENGINE_BOTTLE_KILL_WINESERVER,
  RUST_ENGINE_BOTTLE_PREPARE,
  RUST_ENGINE_BOTTLE_RECONCILE_MARKER,
  RUST_ENGINE_BOTTLE_RECORD_CROSSOVER,
  RUST_ENGINE_BOTTLE_RECORD_PINNED,
  RUST_ENGINE_BOTTLE_REMOVE_CREATED,
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { EngineSelection } from 'backend/engine/engineTypes'
import {
  cancelFallbackBottle,
  clearEngineSelection,
  createFallbackBottle,
  killBottleWineServerWith,
  markGameRunning,
  markGameStopped,
  prepareBottleForEngine,
  reconcileBottleEngineMarker,
  recordCrossoverBottleEngine,
  recordPinnedBottleEngine,
  removeCreatedBottleDir
} from '../bottles'

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

describe('the other bottle, ledger and selection shims', () => {
  const ENGINE = {
    wineBin: '/engines/wine',
    wineserverBin: '/engines/wineserver',
    label: 'Pinned',
    version: '11.20',
    dxvk: null
  }

  it.each([
    [
      'killBottleWineServerWith',
      (d: RustInvokeDeps) =>
        killBottleWineServerWith(
          d,
          'GameLib-gog-1',
          '/engines/wineserver',
          { USER: 'crossover' },
          15_000
        ),
      RUST_ENGINE_BOTTLE_KILL_WINESERVER,
      {
        bottleName: 'GameLib-gog-1',
        wineserverBin: '/engines/wineserver',
        extraEnv: { USER: 'crossover' },
        timeoutMs: 15_000
      }
    ],
    [
      'removeCreatedBottleDir',
      (d: RustInvokeDeps) => removeCreatedBottleDir(d, 'GameLib-gog-1'),
      RUST_ENGINE_BOTTLE_REMOVE_CREATED,
      { bottleName: 'GameLib-gog-1' }
    ],
    [
      'createFallbackBottle',
      (d: RustInvokeDeps) =>
        createFallbackBottle(d, {
          bottleName: 'GameLib-gog-1',
          engine: ENGINE,
          fallbackSettings: {} as never,
          cancelId: 'c-1'
        }),
      RUST_ENGINE_BOTTLE_CREATE_FALLBACK,
      {
        bottleName: 'GameLib-gog-1',
        engine: ENGINE,
        fallbackSettings: {},
        cancelId: 'c-1'
      }
    ],
    [
      'cancelFallbackBottle',
      (d: RustInvokeDeps) => cancelFallbackBottle(d, 'c-1'),
      RUST_ENGINE_BOTTLE_CANCEL_CREATE,
      { cancelId: 'c-1' }
    ],
    [
      'reconcileBottleEngineMarker',
      (d: RustInvokeDeps) => reconcileBottleEngineMarker(d, 'GameLib-gog-1'),
      RUST_ENGINE_BOTTLE_RECONCILE_MARKER,
      { bottleName: 'GameLib-gog-1' }
    ],
    [
      'recordPinnedBottleEngine',
      (d: RustInvokeDeps) =>
        recordPinnedBottleEngine(
          d,
          'GameLib-gog-1',
          'wine-staging-11.20',
          ENGINE
        ),
      RUST_ENGINE_BOTTLE_RECORD_PINNED,
      {
        bottleName: 'GameLib-gog-1',
        pinId: 'wine-staging-11.20',
        engine: ENGINE
      }
    ],
    [
      'recordCrossoverBottleEngine',
      (d: RustInvokeDeps) =>
        recordCrossoverBottleEngine(d, 'GameLib-gog-1', '/cx/bin'),
      RUST_ENGINE_BOTTLE_RECORD_CROSSOVER,
      { bottleName: 'GameLib-gog-1', binDir: '/cx/bin' }
    ],
    [
      'markGameRunning',
      (d: RustInvokeDeps) => markGameRunning(d, 'GameLib-gog-1', 'gog:1'),
      RUST_ENGINE_LEDGER_MARK_RUNNING,
      { bottleName: 'GameLib-gog-1', key: 'gog:1' }
    ],
    [
      'markGameStopped',
      (d: RustInvokeDeps) => markGameStopped(d, 'GameLib-gog-1', 'gog:1'),
      RUST_ENGINE_LEDGER_MARK_STOPPED,
      { bottleName: 'GameLib-gog-1', key: 'gog:1' }
    ],
    [
      'clearEngineSelection',
      (d: RustInvokeDeps) => clearEngineSelection(d, '620'),
      RUST_ENGINE_SELECTION_CLEAR,
      { key: '620' }
    ]
  ])(
    '%s sends one typed call with what the caller resolved',
    async (_n, call, channel, arg) => {
      const deps = fakeTransport('answer')
      expect(await call(deps)).toBe('answer')
      expect(deps.calls).toEqual([[channel, [arg]]])
    }
  )
})
