import type { EngineSelection } from 'backend/engine/engineTypes'
import type { EngineState, OverlayNoticeStep } from 'common/types/engine'
import {
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE,
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE,
  RUST_ENGINE_STATE_RECORD_DECISION
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { CrossoverPreflight } from './decision'

/**
 * The per-title engine state's recording and publishing live in Rust (Phase 87, `gamelib-engine` `state`): what a launch
 * used, cached and pushed to the renderer as `engineStateChanged`, and the in-app overlay notices built over the last
 * state it pushed for the game. The Steam bridge reaches them through the shims in this file until Phase 96 (the decision
 * record) and Phase 97 (the overlay notices) move the bridge's launch into Rust. Each body is one returned typed call
 * (D-06); the bridge's own facts (its install bottle and what applies to it) are values in the argument, never
 * callbacks. The shim schedule in `engineWineShimSchedule.test.ts` pins the shape and the phase that deletes each shim.
 */

/** The facts of a title's engine state the caller holds, as values (`getEngineState`'s facts, 87-52). */
export interface EngineStateFactsRequest {
  bottle: string | null
  stateWithoutBottle?: boolean
  overrideEligible: boolean
  overlayEligible: boolean
  wineToolsEligible: boolean
  prefixKind?: NonNullable<EngineState['prefixKind']>
  perGameBottleName?: string | null
}

/** What a launch used, with the facts of the game. */
export interface RecordDecisionRequest {
  runner: string
  appName: string
  bottleName: string
  /** The closed-grammar override id the decision resolved (`LaunchDecision.override`). */
  override: string
  /** The decision's selection; without one (an unavailable decision) nothing is recorded. */
  selection?: EngineSelection
  preflight?: CrossoverPreflight | null
  facts: EngineStateFactsRequest
}

/**
 * Records what a launch used (the selection and its pre-flight), refreshing the cached pre-flight and pushing the
 * title's state, with the launch notice when the launch dropped to the built-in engine. Resolves `true` when a decision
 * was recorded; rejects with Rust's category word for an argument the crate refused (an unclean bottle name, an
 * override outside the grammar).
 */
export async function recordLaunchDecision(
  deps: RustInvokeDeps,
  args: RecordDecisionRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_STATE_RECORD_DECISION, [args])
}

/** The game an overlay notice speaks for, and the setup step that failed. */
export interface OverlayNoticeRequest {
  runner: string
  appName: string
  step: OverlayNoticeStep
}

/**
 * Pushes the in-app "Steam overlay unavailable" notice for the step that failed, over the last state pushed for the
 * game. Resolves whether it published (`false` when the game has no pushed state yet or the key is not an engine key).
 */
export async function publishOverlayNotice(
  deps: RustInvokeDeps,
  args: OverlayNoticeRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE, [
    args
  ])
}

/**
 * Pushes the in-app "game closed soon after starting" notice for an overlay launch that exited abnormally. Resolves
 * whether it published.
 */
export async function publishOverlayExitNotice(
  deps: RustInvokeDeps,
  args: { runner: string; appName: string }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE, [
    args
  ])
}
