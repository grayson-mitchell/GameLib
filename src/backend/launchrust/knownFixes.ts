import type { GameSettings, Runner } from 'common/types'
import type { KnownFixReportKey, KnownFixReportOp } from 'common/knownFixReport'
import {
  RUST_KNOWNFIX_APPLY_REGISTRY,
  RUST_KNOWNFIX_FETCH_REMOTE,
  RUST_KNOWNFIX_LAUNCH_OVERRIDES,
  RUST_KNOWNFIX_REPORT_DETECTED,
  RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV
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
 * The Steam bridge's registry step: the Steam tier-2 profile's `registry` then `dllOverrides` applied into the
 * bridge's bottle (88-14). Rust reads the profile itself, so only the app id, the log `label` (`Steam <appId>`),
 * the bridge settings and the bottle folder cross; `bottleDir` is `null` when the folder is unknown (the values
 * already in the bottle's registry files are then not skipped). Each `reg add` is a helper in Rust, the prefix
 * check skipped. Resolves `null` whatever a command did (a failed `reg add` is a warning in the Rust log).
 * Rejects with Rust's category word when the call could not be made (an argument the crate refused, the shell not
 * ready). The channel is unbounded on the sidecar side: several 15 s commands can pass the 60 s cap.
 */
export async function applyRegistryFixes(
  deps: RustInvokeDeps,
  appId: string,
  label: string,
  gameSettings: GameSettings,
  bottleDir: string | null
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_KNOWNFIX_APPLY_REGISTRY, [
    { appId, label, gameSettings, bottleDir }
  ])
}

/**
 * The Steam bridge's overlay env: the Steam tier-2 profile's `overlays` resolved against `baseValues`, an overlay
 * installed on demand in Rust (88-14). `baseValues` holds only `KNOWN_FIX_OVERLAY_BASE_ENV_KEYS` that have a value,
 * each read as the bridge's merged env first and the sidecar's own env second, so Rust computes the game
 * environment from the same values the TS callback read; `wineType` is `null` when the bridge settings carry none.
 * Resolves the env map `{KEY: value}` as `unknown`, because the transport is untyped. Rejects with Rust's category
 * word when the call could not be made. The channel is unbounded on the sidecar side: the overlay download can take
 * 120 s.
 */
export async function resolveKnownFixOverlayEnv(
  deps: RustInvokeDeps,
  appId: string,
  label: string,
  wineType: string | null,
  baseValues: Record<string, string>
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV, [
    { appId, label, wineType, baseValues }
  ])
}

/**
 * One detection a detector hook reports: the Steam app id, the fix key and whether it is to be added or is no
 * longer needed, and which detector found it (`macho` for the post-install Mach-O check, `ceg` for the DRM probe).
 */
export type DetectedFix = {
  appId: string
  key: KnownFixReportKey
  op: KnownFixReportOp
  detector: 'macho' | 'ceg'
}

/**
 * The opt-in report of a fix a detector found (88-15, D-03). `enabled` is the caller's `shareDetectedFixes === true`
 * setting fact: Rust reads no settings file, and nothing leaves the machine unless it is true and every gate in the
 * crate (platform, known fix, local layer, already sent, relay URL, the report's own schema) passes. Resolves the
 * outcome word as `unknown` (`sent`, `disabled`, `already-sent`, `retryable`, ...), because the transport is untyped;
 * the callers fire and forget it and log a rejection. Rejects with Rust's category word when the call could not be
 * made (an argument the crate refused, the shell not ready, the timeout). The one POST is bounded at 8 s in Rust, so
 * the channel stays inside the sidecar's 60 s cap.
 */
export async function reportDetectedFix(
  deps: RustInvokeDeps,
  fix: DetectedFix,
  enabled: boolean
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_KNOWNFIX_REPORT_DETECTED, [
    {
      appId: fix.appId,
      key: fix.key,
      op: fix.op,
      detector: fix.detector,
      enabled
    }
  ])
}
