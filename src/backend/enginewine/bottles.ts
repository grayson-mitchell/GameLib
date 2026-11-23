import type {
  EngineSelection,
  NonCrossoverEngine
} from 'backend/engine/engineTypes'
import type { GameSettings } from 'common/types'
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

/**
 * `wineserver -k` against a per-game bottle with an explicit (non-CrossOver) wineserver, capped. Resolves `true` when
 * it ran to an exit; an unsafe bottle name spawns nothing and resolves `false`. `extraEnv` is the caller's own pairs
 * (`USER`, `CX_ROOT`); the bottle's `WINEPREFIX` is Rust's. Never rejects for a failed kill, only for an argument the
 * crate refused.
 */
export async function killBottleWineServerWith(
  deps: RustInvokeDeps,
  bottleName: string,
  wineserverBin: string,
  extraEnv: Record<string, string>,
  timeoutMs?: number
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_KILL_WINESERVER, [
    { bottleName, wineserverBin, extraEnv, timeoutMs }
  ])
}

/**
 * Removes a bottle only when this process created it, as a single safe segment directly under the Bottles root
 * (T-59-25, behind the safety crate's guard). Resolves `true` when the bottle is gone (an absent one counts), `false`
 * when the name or the guard refused or the delete failed. The TS version was a sync void; each call site awaits it.
 */
export async function removeCreatedBottleDir(
  deps: RustInvokeDeps,
  bottleName: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_REMOVE_CREATED, [
    { bottleName }
  ])
}

/** A fallback bottle creation: the built-in engine, the global settings its DXVK step builds over, and a cancel id. */
export interface CreateFallbackRequest {
  bottleName: string
  engine: NonCrossoverEngine
  fallbackSettings: GameSettings
  /** Names this creation so {@link cancelFallbackBottle} can end it (the TS `AbortSignal`). */
  cancelId?: string
}

/**
 * Creates the bottle with the built-in engine (`wineboot -i` 180 s, `wineserver -w` 60 s, its DXVK, then
 * `cxbottle.conf` last), cleaning up only what this call made on a failure or a cancel. Resolves
 * `{status, error?, errorCode?, createdHere?}`.
 */
export async function createFallbackBottle(
  deps: RustInvokeDeps,
  request: CreateFallbackRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_CREATE_FALLBACK, [request])
}

/** Ends the fallback creation that registered `cancelId`; resolves `true` when one was in flight. */
export async function cancelFallbackBottle(
  deps: RustInvokeDeps,
  cancelId: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_CANCEL_CREATE, [
    { cancelId }
  ])
}

/**
 * Persists the bottle's engine before a CrossOver probe touches its conf (76 CR-01), only for a provisioned bottle
 * whose marker is missing or contradicted by DXVK-macOS. Resolves `'crossover'`, `'pinned'` or `null` (nothing
 * written, a newer marker included).
 */
export async function reconcileBottleEngineMarker(
  deps: RustInvokeDeps,
  bottleName: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_RECONCILE_MARKER, [
    { bottleName }
  ])
}

/** The marker a pinned-engine bottle gets at creation (D-07a), through the version gate. Resolves whether it wrote. */
export async function recordPinnedBottleEngine(
  deps: RustInvokeDeps,
  bottleName: string,
  pinId: string,
  engine: NonCrossoverEngine
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_RECORD_PINNED, [
    { bottleName, pinId, engine }
  ])
}

/** The marker a CrossOver-created bottle gets at creation (D-07a), through the version gate. Resolves whether it wrote. */
export async function recordCrossoverBottleEngine(
  deps: RustInvokeDeps,
  bottleName: string,
  binDir: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_BOTTLE_RECORD_CROSSOVER, [
    { bottleName, binDir }
  ])
}

/** Records a game running in a bottle in Rust's ledger, which the switch reads. Resolves `false` for what it refuses. */
export async function markGameRunning(
  deps: RustInvokeDeps,
  bottleName: string,
  key: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_LEDGER_MARK_RUNNING, [
    { bottleName, key }
  ])
}

/** Drops a game from Rust's ledger; harmless for one that is not recorded. Resolves `null`. */
export async function markGameStopped(
  deps: RustInvokeDeps,
  bottleName: string,
  key: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_LEDGER_MARK_STOPPED, [
    { bottleName, key }
  ])
}

/** Drops the registry's selection for a title in Rust. Resolves `true` when one was removed. */
export async function clearEngineSelection(
  deps: RustInvokeDeps,
  key: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_SELECTION_CLEAR, [{ key }])
}
