import type { EngineSelection } from 'backend/engine/engineTypes'
import type { GameSettings } from 'common/types'
import { RUST_ENGINE_BOTTLE_PREPARE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The engine's bottle, ledger and marker operations live in Rust (Phase 87, `gamelib-engine` `bottles`): the engine
 * switch (the wineserver stop, DXVK, the marker through the version gate, every refusal), the fallback bottle
 * creation, the guarded removal of a bottle this process created, the markers a creation records, the running-games
 * ledger and the selection registry. The shims in this file are the only TS path to them, kept so the Steam bridge
 * and the still-TS engine decision and launch step keep their call shape until the phases that own them (88 and 96)
 * call Rust directly. Each body is one returned typed call (D-06): everything the TS callbacks used to supply
 * (`getMonitorPhase`, `ownBottleName`, `crossoverSettings`, `crossoverHealthy`) is resolved by the caller into a
 * value first, and the pin download, the status update and the selection view are the caller's work around the
 * call (`engine/prepareBottle.ts`). The shim schedule in `engineWineShimSchedule.test.ts` pins the shape and the
 * phase that deletes each shim.
 */

/** The values `prepareBottleForEngine` needs, the TS callbacks already resolved (D-03). */
export interface PrepareBottleRequest {
  key: string
  bottleName: string
  next: EngineSelection
  /** The monitor's phase for the title: a game is starting or running in this bottle. */
  monitorPhase?: 'starting' | 'running' | null
  /** Present when the store has an own-bottle notion (Steam); `name` is `null` for a title with no own bottle. */
  ownBottle?: { name: string | null }
  /** The stored CrossOver settings the restore runs with; required when `next` is CrossOver. */
  crossoverSettings?: GameSettings
  /** False when CrossOver cannot run (expired or missing): the restore then uses the built-in engine. */
  crossoverHealthy?: boolean
  /** The global game settings the DXVK step's fallback settings are built over. */
  fallbackSettings?: GameSettings
  /** Record the selection in Rust's registry once the bottle is on that engine (the reply carries it). */
  registerSelection?: boolean
}

/** What `engine_bottle_prepare` answers: the TS `PrepareResult`, plus the selection the bottle is now on. */
export type PrepareBottleReply =
  | { ok: true; changed: boolean; selection?: EngineSelection }
  | {
      ok: false
      reason:
        | 'game-running'
        | 'dxvk-failed'
        | 'invalid-bottle'
        | 'shared-bottle'
        | 'bottle-busy'
        | 'marker-newer'
        | 'pins-unavailable'
      detail: string
    }

/**
 * Makes the bottle's engine `args.next`: stops the previous engine's wineserver, installs the next engine's DXVK and
 * writes the marker. Resolves a {@link PrepareBottleReply}; rejects with Rust's category word when the call could not
 * be made (an argument the crate refused, the shutdown).
 */
export async function prepareBottleForEngine(
  deps: RustInvokeDeps,
  args: PrepareBottleRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_PREPARE, [args])
}
