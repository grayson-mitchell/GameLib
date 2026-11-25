import type { GameSettings, Runner, WrapperEnv } from 'common/types'
import {
  RUST_LAUNCH_KNOWN_FIX_ENV,
  RUST_LAUNCH_SETUP_ENV_VARS,
  RUST_LAUNCH_SETUP_WINE_ENV_VARS,
  RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS,
  RUST_LAUNCH_SETUP_WRAPPERS,
  RUST_LAUNCH_VERIFY_WINE_PREFIX
} from 'common/types/sidecarTransport'
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

/**
 * The game's environment from its settings: GPU offload, the HUD, `STEAM_COMPAT_INSTALL_PATH`, the user's own
 * variables and an empty `LD_PRELOAD` when none is set anywhere, as a string map. `installPath` is absent for a game
 * with none. The shell appends the process environment itself (T-88.1-14), so none crosses from here.
 */
export async function setupEnvVars(
  deps: RustInvokeDeps,
  gameSettings: GameSettings,
  installPath?: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_SETUP_ENV_VARS, [
    gameSettings,
    installPath
  ])
}

/**
 * The wine environment of a game from its settings (`WINEPREFIX`, `STEAM_COMPAT_DATA_PATH`, `CX_BOTTLE`, the wine's
 * library folders and the rest), as a string map. `gameId` is absent when the caller has none. The shell appends the
 * process environment and the Darwin release itself (T-88.1-14), so none crosses from here.
 */
export async function setupWineEnvVars(
  deps: RustInvokeDeps,
  gameSettings: GameSettings,
  gameId?: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_SETUP_WINE_ENV_VARS, [
    gameSettings,
    gameId
  ])
}

/**
 * Creates the game's wine prefix when it is missing, with a `wineboot --init` (or umu's `createprefix`) that Rust runs
 * as a Helper, and answers `{ res: { stdout, stderr } }`. A crossover bottle and an invalid wine answer an empty
 * result without running anything. The wineboot of a cold prefix is awaited, which can pass the 60 s transport bound,
 * so the channel is unbounded (`UNBOUNDED_RUST_CHANNELS`). Rejects when the prefix directory cannot be made.
 */
export async function verifyWinePrefix(
  deps: RustInvokeDeps,
  gameSettings: GameSettings
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_VERIFY_WINE_PREFIX, [gameSettings])
}

/**
 * The wrapper words of a launch in order, gamescope first: the gamescope command, the user's wrapper options (each
 * `args` split like a shell would), mangohud behind an empty gamescope command and gamemode. Each of the three
 * commands is absent when the caller has none. Rejects when a wrapper option has an unterminated quote.
 */
export async function setupWrappers(
  deps: RustInvokeDeps,
  gameSettings: GameSettings,
  mangoHudCommand?: string[],
  gameModeBin?: string,
  gameScopeCommand?: string[]
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_SETUP_WRAPPERS, [
    gameSettings,
    mangoHudCommand,
    gameModeBin,
    gameScopeCommand
  ])
}

/**
 * The tier-1 known-fix `envVariables` of a game as its file holds them (`{}` when there is none), local over bundled
 * over remote.
 */
export async function getKnownFixesEnvVariables(
  deps: RustInvokeDeps,
  appName: string,
  runner: Runner
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_KNOWN_FIX_ENV, [appName, runner])
}
