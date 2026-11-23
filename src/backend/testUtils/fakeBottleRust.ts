/**
 * A stand-in for Rust's bottle ops in a jest test (Phase 87, 87-42). The engine's bottle kill and guarded removal
 * are Rust's now, and a jest process has no shell to ask. Until 87-43 deletes `engine/bottlePrimitives.ts`, that file
 * still holds the TS reference these ops were ported from (the 87-16 goldens that Rust replays were recorded against
 * it), so this transport answers the two ops by running that reference over the test's own `spawnAsync` and paths: a
 * test that asserts a spawn trace or a bottle tree sees exactly what it saw when the TS ran them. Any other channel
 * is refused, naming itself, so a test never silently reaches a Rust op it did not mean to.
 */
import type { GameSettings } from 'common/types'
import {
  RUST_ENGINE_BOTTLE_CANCEL_CREATE,
  RUST_ENGINE_BOTTLE_CREATE_FALLBACK,
  RUST_ENGINE_BOTTLE_KILL_WINESERVER,
  RUST_ENGINE_BOTTLE_RECONCILE_MARKER,
  RUST_ENGINE_BOTTLE_RECORD_CROSSOVER,
  RUST_ENGINE_BOTTLE_RECORD_PINNED,
  RUST_ENGINE_BOTTLE_REMOVE_CREATED
} from 'common/types/sidecarTransport'
import type { EngineServices } from 'backend/engine/engineServices'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { SpawnAsync } from 'backend/spawnAsync'
import {
  createFallbackBottle,
  killBottleWineServerWith,
  removeCreatedBottleDir
} from 'backend/engine/bottlePrimitives'

export interface FakeBottleRust extends RustInvokeDeps {
  calls: Array<{ channel: string; arg: unknown }>
}

export function createFakeBottleRust(deps: {
  spawnAsync: SpawnAsync
  paths: { userHome: string }
  /** The DXVK installer the fallback creation runs (`services.installRemove`). */
  installRemove?: EngineServices['installRemove']
  /** Answers for other channels, by name. */
  others?: Record<string, (arg: unknown) => unknown>
}): FakeBottleRust {
  const calls: FakeBottleRust['calls'] = []
  const cancels = new Map<string, AbortController>()
  const requestRustInvoke = (async (channel: string, args: unknown[]) => {
    const arg = args[0]
    calls.push({ channel, arg })
    if (channel === RUST_ENGINE_BOTTLE_KILL_WINESERVER) {
      const a = arg as {
        bottleName: string
        wineserverBin: string
        extraEnv: Record<string, string>
        timeoutMs?: number
      }
      return killBottleWineServerWith(
        { spawnAsync: deps.spawnAsync, paths: deps.paths },
        a.bottleName,
        a.wineserverBin,
        a.extraEnv,
        a.timeoutMs ?? 15_000
      )
    }
    if (channel === RUST_ENGINE_BOTTLE_REMOVE_CREATED) {
      removeCreatedBottleDir(
        deps.paths,
        (arg as { bottleName: string }).bottleName
      )
      return true
    }
    if (channel === RUST_ENGINE_BOTTLE_CREATE_FALLBACK) {
      const a = arg as {
        bottleName: string
        engine: NonCrossoverEngine
        fallbackSettings: GameSettings
        cancelId?: string
      }
      const controller = new AbortController()
      if (a.cancelId) cancels.set(a.cancelId, controller)
      try {
        return await createFallbackBottle(
          {
            spawnAsync: deps.spawnAsync,
            paths: deps.paths,
            installRemove: deps.installRemove ?? (() => Promise.resolve(false)),
            globalGameSettings: () => a.fallbackSettings
          },
          a.bottleName,
          a.engine,
          controller.signal
        )
      } finally {
        if (a.cancelId) cancels.delete(a.cancelId)
      }
    }
    if (channel === RUST_ENGINE_BOTTLE_CANCEL_CREATE) {
      const id = (arg as { cancelId: string }).cancelId
      const controller = cancels.get(id)
      controller?.abort()
      return controller !== undefined
    }
    const other = deps.others?.[channel]
    if (other) return other(arg)
    // The creation-time markers are Rust's (replayed by its own goldens); a test that does not script them is told
    // they were written.
    if (
      channel === RUST_ENGINE_BOTTLE_RECORD_PINNED ||
      channel === RUST_ENGINE_BOTTLE_RECORD_CROSSOVER
    ) {
      return true
    }
    if (channel === RUST_ENGINE_BOTTLE_RECONCILE_MARKER) return null
    throw new Error(`fakeBottleRust: unexpected ${channel}`)
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  return { requestRustInvoke, calls }
}
