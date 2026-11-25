import type { WrapperEnv } from 'common/types'
import { RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The launch builders live in Rust (Phase 88.1, `gamelib-launch`): the wrapper, game and wine environments, the
 * wrapper list and the tier-1 known-fix env. The store managers keep their own `launch()` flow until 91 and 92 and
 * reach the builders through the shims in this file (D-01), so each builder has one owner. Each body is one returned
 * typed call (D-06); the schedule in `engineWineShimSchedule.test.ts` pins that and the phase that deletes each one.
 *
 * Each answer is `unknown`, because the transport is untyped; `launcher.ts` narrows it in `launchBuilderReply.ts`
 * before a manager sees it. There is no TypeScript fallback (D-19): a rejected call (an argument the crate refused,
 * the shell not ready, the timeout) fails the launch that asked.
 */

/**
 * The environment a wrapper (gamescope, gamemode, a user's script) reads: `HEROIC_APP_NAME`, `HEROIC_APP_RUNNER`,
 * `GAMEID` and the store's own variables, as a string map. Pure, so it stays inside the 60 s transport bound.
 */
export async function setupWrapperEnvVars(
  deps: RustInvokeDeps,
  wrapperEnv: WrapperEnv
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS, [
    wrapperEnv
  ])
}
