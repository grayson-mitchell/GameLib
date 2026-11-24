import type { GameSettings, Runner } from 'common/types'
import {
  RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY,
  RUST_KNOWNFIX_FETCH_REMOTE,
  RUST_KNOWNFIX_LAUNCH_OVERRIDES,
  RUST_KNOWNFIX_PROFILE_OVERLAY_ENV
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The known-fix services live in Rust (Phase 88, `gamelib-knownfix`): the profile layers, the launch
 * overrides and the remote fixes. The store managers and the download manager keep their own flow until
 * 91 and 92 and reach Rust through the shims in this file (D-01, D-03), so the known-fix data has one
 * owner. Each body is one returned typed call (D-06); the shim schedule in `engineWineShimSchedule.test.ts`
 * pins that and the phase that deletes each one.
 */

/**
 * What a non-Steam launch applies from a game's known fix: `{launchArgs, exeOverride}`. `launchArgs` are the
 * fix's own, as they are; `exeOverride` is the install-relative executable checked against the install
 * folder (an existing regular file inside it), `null` when there is none or it did not pass. Resolves
 * `unknown`, because the transport is untyped: `settleKnownFixLaunchOverrides` narrows it. A game with no
 * fix answers `{launchArgs: [], exeOverride: null}`. `installPath` is `null` or absent when the install
 * folder is unknown, which drops an `exeOverride`. Rejects with Rust's category word when the call could not
 * be made (an argument the crate refused, the shell not ready, the timeout).
 */
export async function readKnownFixLaunchOverrides(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner,
  installPath: string | null | undefined
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_KNOWNFIX_LAUNCH_OVERRIDES, [
    { appName, runner, installPath }
  ])
}

/**
 * The install-time download of a game's remote known fixes: GameLib's feed first, then Heroic's on a 404,
 * written filtered into the fixes folder. Resolves `null` whatever happened (an indeterminate answer is a log
 * line in Rust, and a game with no remote fix is not a failure). Rejects with Rust's category word when the
 * call could not be made, which the download manager logs and carries on from.
 */
export async function fetchRemoteKnownFixes(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_KNOWNFIX_FETCH_REMOTE, [
    { appName, runner }
  ])
}

/**
 * The launcher's tier-2 registry step, every launch: the game's profile `registry` entries applied to its own
 * prefix, each `reg add` a helper in Rust. Resolves `null` whatever a command did (a failed `reg add` is a
 * warning in the Rust log). Rejects with Rust's category word when the call could not be made (an argument
 * the crate refused, the shell not ready). The channel is unbounded on the sidecar side: several 15 s commands
 * can pass the 60 s cap.
 */
export async function applyKnownFixProfileRegistry(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner,
  gameSettings: GameSettings
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_KNOWNFIX_APPLY_PROFILE_REGISTRY, [
    { appName, runner, gameSettings }
  ])
}

/**
 * The overlay env of a non-Steam launch: the game's tier-2 `overlays` resolved against the base values the
 * caller holds, an overlay installed on demand in Rust. `processEnvBase` is the sidecar's own env reduced to
 * `KNOWN_FIX_OVERLAY_BASE_ENV_KEYS` (`overlayBaseEnv(process.env)`), so Rust computes the game environment from
 * the same values the TS callback read. Resolves the env map `{KEY: value}` as `unknown`, because the transport
 * is untyped. Rejects with Rust's category word when the call could not be made. The channel is unbounded on the
 * sidecar side: the overlay download can take 120 s.
 */
export async function knownFixProfileOverlayEnv(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner,
  gameSettings: GameSettings,
  tier1Env: Record<string, string>,
  processEnvBase: Record<string, string>
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_KNOWNFIX_PROFILE_OVERLAY_ENV, [
    { appName, runner, gameSettings, tier1Env, processEnvBase }
  ])
}
