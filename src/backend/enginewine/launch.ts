import type { GameSettings } from 'common/types'
import {
  RUST_ENGINE_DIALOG_DISPLAYED,
  RUST_ENGINE_LAUNCH_ARM_DEADLINE,
  RUST_ENGINE_LAUNCH_END,
  RUST_ENGINE_LAUNCH_SELECT,
  RUST_ENGINE_LAUNCH_SETTINGS_GET
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The launch-time engine step of every non-Steam launch lives in Rust (Phase 87, `gamelib-engine` `launch`): the
 * eligibility test, the effective engine, the prefix, the game's own bottle, the offline refusal, the decision with
 * the G29 rule, the first-need pinned-engine download, the bottle switch, the registry and the overlay context, and the
 * 180 s no-kill launch deadline with its process watch. The launcher and the GOG and Amazon setup reach it through
 * the shims in this file until Phase 88 moves the launch itself into Rust (they build the argv and the environment in
 * TypeScript until then). Each body is one returned typed call (D-06); everything the TS step read through callbacks
 * (the game's slice, its stored settings, whether the host is offline) is a value the caller resolved into the
 * argument. The shim schedule in `engineWineShimSchedule.test.ts` pins the shape and the phase that deletes each shim.
 */

/** The slice of the game and the launch options the Rust step reads (the TS `Game` and `LaunchEngineStep` opts). */
export interface SelectEngineRequest {
  runner: string
  appName: string
  title: string
  /** `getGameInfo().install?.install_path`: what the deadline's process watch matches. */
  installPath?: string
  /** `getGameInfo().install?.platform`; `Browser` is never engine-controlled. */
  platform?: string
  isNative: boolean
  /** `game.getSettings()`: the prefix is resolved from it and the launch overlay is built over it. */
  settings: GameSettings
  offline: boolean
  purpose?: 'launch' | 'setup'
}

/**
 * Runs the whole engine step of one launch. Resolves `{kind, key?, selection?, prefix?, logLines?, launchSettings?}`:
 * `skip` when the engine layer does not apply (native, Browser, a host that is not macOS, a bottle-runtime store),
 * `legacy` for a Wine outside the option list, `refused` when nothing may start (the dialog has been shown) and `use`
 * with the settings the launch runs with. Rejects with Rust's category word when the call could not be made (an
 * argument the crate refused, the shutdown).
 */
export async function selectEngineForLaunch(
  deps: RustInvokeDeps,
  args: SelectEngineRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_LAUNCH_SELECT, [args])
}

/** The game a launch deadline speaks for. */
export interface ArmEngineDeadlineRequest {
  runner: string
  appName: string
  title: string
  installPath?: string
}

/**
 * Arms the launch deadline of a bottle-backed launch and its process watch, after the prerequisite installers. Resolves
 * `{armed: false}` for a plain-prefix launch, a launch with no registered selection or a game with no engine key, else
 * `{armed: true, watching}`. A deadline that fires shows the no-kill notice and never raises the window.
 */
export async function armEngineLaunchDeadline(
  deps: RustInvokeDeps,
  args: ArmEngineDeadlineRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_LAUNCH_ARM_DEADLINE, [args])
}

/**
 * Releases everything a launch held: the process watch, the overlay context, the deadline, the ledger entry and the
 * registry selection of the key. Resolves `null`; harmless for a key that holds nothing.
 */
export async function endEngineLaunch(
  deps: RustInvokeDeps,
  key: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_LAUNCH_END, [{ key }])
}

/**
 * The settings a launch runs with: the stored settings with the running launch's engine overlaid, read from Rust's
 * registry and overlay context (`getLaunchSettings`). Resolves the settings object; a `null` key, or a key with no
 * registered selection, resolves the stored settings unchanged, and the input is never changed. Rejects with Rust's
 * category word for a key or settings the crate refused.
 */
export async function getLaunchSettings(
  deps: RustInvokeDeps,
  key: string | null,
  stored: GameSettings
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_LAUNCH_SETTINGS_GET, [
    { key, stored }
  ])
}

/**
 * Tells Rust the renderer has an engine dialog on screen (the renderer's `dialogDisplayed` send with an `engine:` ack
 * id, D-02). Resolves `true` when Rust was waiting on the id, `false` for a repeated or unknown one; rejects with
 * Rust's category word for an id the crate refused (a bad-shaped id).
 */
export async function engineDialogDisplayed(
  deps: RustInvokeDeps,
  ackId: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_DIALOG_DISPLAYED, [{ ackId }])
}
