import type { EnginePin } from 'common/types/engine'
import type { EngineOverrideId } from 'backend/engine/engineIds'
import type {
  EngineSelection,
  FallbackReason
} from 'backend/engine/engineTypes'
import {
  RUST_ENGINE_DECIDE_CREATION,
  RUST_ENGINE_DECIDE_LAUNCH,
  RUST_ENGINE_IS_CROSSOVER_MISSING,
  RUST_ENGINE_PREFLIGHT_CROSSOVER
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The engine decision lives in Rust (Phase 87, `gamelib-engine` `decision`): which engine runs a launch (the stored
 * override, else CrossOver when its pre-flight is healthy, else the pinned fallback, never bottled Steam), which engine
 * a new bottle is created with, and the CrossOver pre-flight with the G29 two-probe rule. The Steam bridge reaches it
 * through the shims in this file until Phase 96 moves the bridge itself into Rust. Each body is one returned typed call
 * (D-06); everything the TS decision read through callbacks (the stored override, the process monitor's phase, the
 * persisted wine-binary hints, the CrossOver wineserver stop) is a value the caller resolved into the argument, or
 * Rust's own work. The shim schedule in `engineWineShimSchedule.test.ts` pins the shape and the phase that deletes each
 * shim.
 */

/** The CrossOver pre-flight's answer. */
export type CrossoverPreflight =
  | {
      kind: 'healthy'
      binDir: string
      build: string | null
      trialDaysRemaining: number | null
    }
  | { kind: 'expired'; binDir: string; build: string | null; daysAgo: number }
  | {
      kind: 'broken'
      binDir: string | null
      build: string | null
      detail: string
      /** A page read timed out without a retry; says nothing certain about CrossOver. */
      inconclusive?: boolean
    }
  | { kind: 'missing'; detail: string }

/** What a launch runs on: the selection, or why the stored override cannot run. */
export type LaunchDecision =
  | {
      kind: 'use'
      selection: EngineSelection
      preflight: CrossoverPreflight | null
      pin: EnginePin | null
      needsDownload: boolean
      override: EngineOverrideId
      logLines: string[]
    }
  | { kind: 'unavailable'; override: EngineOverrideId; detail: string }

/** The engine a new bottle is created with. */
export type CreationDecision =
  | {
      kind: 'crossover'
      createTimeoutMs: number
      probed: boolean
      build: string | null
    }
  | { kind: 'pinned'; reason: FallbackReason; pin: EnginePin }

/** The process monitor's phase for a title: a game is starting or running in its bottle. */
export type MonitorPhase = 'starting' | 'running'

/** The launch decision's arguments: the game, its bottle and the facts the TS callbacks used to supply. */
export interface DecideLaunchRequest {
  key: string
  bottleName: string
  /** The title's stored override as read from its config (any JSON; the closed grammar parses it in Rust). */
  override?: unknown
  monitorPhase?: MonitorPhase | null
  hintWineBins?: string[]
}

/**
 * Decides the engine of one launch. Resolves a {@link LaunchDecision}; rejects with Rust's category word when the call
 * could not be made (an argument the crate refused, an unreadable pin table, the shutdown).
 */
export async function decideLaunchEngine(
  deps: RustInvokeDeps,
  args: DecideLaunchRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_DECIDE_LAUNCH, [args])
}

/**
 * Decides the engine a bottle is created with: a presence check only (59-REVIEW WR-02/WR-03). Resolves
 * `{decision: CreationDecision, createCapMs}`.
 */
export async function decideCreationEngine(
  deps: RustInvokeDeps,
  args: { key: string }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_DECIDE_CREATION, [args])
}

/** The CrossOver pre-flight's arguments. */
export interface PreflightRequest {
  bottleName: string
  /** The title's engine key when a launch is the caller: a running game or a busy bottle is then never stopped. */
  key?: string
  /** `false` for a page read (never stops a wineserver). */
  killOnTimeout?: boolean
  monitorPhase?: MonitorPhase | null
  hintWineBins?: string[]
}

/** The CrossOver pre-flight (the G29 two-probe rule). Resolves a {@link CrossoverPreflight}. */
export async function preflightCrossover(
  deps: RustInvokeDeps,
  args: PreflightRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_PREFLIGHT_CROSSOVER, [args])
}

/**
 * G25: whether CrossOver is not installed; never probes. Resolves `true` or `false` (an error in the lookup is "unknown",
 * which never produces a refusal, so it is `false`).
 */
export async function isCrossoverMissing(
  deps: RustInvokeDeps,
  args: { hintWineBins?: string[] }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_IS_CROSSOVER_MISSING, [args])
}
