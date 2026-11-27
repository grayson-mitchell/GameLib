import type {
  ExecResult,
  GameSettings,
  LaunchParams,
  Runner,
  StatusPromise,
  WrapperEnv
} from 'common/types'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import type { GlobalConfigSlice } from '../config'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import type { StoreManagers } from '../services/types'
import {
  prepareLaunch as prepareLaunchAdapter,
  prepareWineLaunch as prepareWineLaunchAdapter
} from '../launchAdapters'
import {
  settleEnvMap,
  settleKnownFixEnv,
  settleLaunchStatus,
  settleVerifyPrefixReply,
  settleWordList
} from '../launchBuilderReply'
import {
  getKnownFixesEnvVariables as getKnownFixesEnvVariablesShim,
  setupEnvVars as setupEnvVarsShim,
  setupWineEnvVars as setupWineEnvVarsShim,
  setupWrapperEnvVars as setupWrapperEnvVarsShim,
  setupWrappers as setupWrappersShim,
  verifyWinePrefix as verifyWinePrefixShim
} from './builders'
import { launchRun } from './funnel'
import type { LaunchRunRequest } from './funnel'

/**
 * The `Launcher` the TypeScript managers call until 91 and 92 (Phase 88.3, 88.3-16, D-01, D-25): every member is a scheduled
 * Rust shim or the 88.1 prepare adapter over shims, so the module holds no launch logic. It was `createLauncher` in
 * `backend/launcher.ts`, which was the TS funnel body until the Rust funnel took every Play (88.3-10); what is left of that
 * file is test-facing and is deleted in 88.3-17.
 */

/**
 * What the launcher is built from (66.1, D-02): constructed once per boot by createStoreManagers. Only what a member or a
 * prepare adapter reads: the Rust transport, the library managers and the store hooks the adapters ask, and the global
 * settings the wine prepare step reads one flag from.
 */
export interface LauncherDeps extends RustInvokeDeps {
  /** Late-bound: filled by createStoreManagers after the launcher is built, read at call time only. */
  libraryManagers: StoreManagers['library']
  launchHooks: Record<Runner, StoreLaunchHooks>
  config: Pick<GlobalConfigSlice, 'getSettings'>
}

type DropFirst<T extends unknown[]> = T extends [unknown, ...infer R]
  ? R
  : never

/** Launcher members; pure helpers stay module-level because they need no deps. */
export interface Launcher {
  prepareLaunch(
    ...a: DropFirst<Parameters<typeof prepareLaunchAdapter>>
  ): ReturnType<typeof prepareLaunchAdapter>
  prepareWineLaunch(
    ...a: DropFirst<Parameters<typeof prepareWineLaunchAdapter>>
  ): ReturnType<typeof prepareWineLaunchAdapter>
  setupEnvVars(
    gameSettings: GameSettings,
    installPath?: string
  ): Promise<Record<string, string>>
  setupWrapperEnvVars(wrapperEnv: WrapperEnv): Promise<Record<string, string>>
  setupWineEnvVars(
    gameSettings: GameSettings,
    gameId?: string
  ): Promise<Record<string, string>>
  setupWrappers(
    gameSettings: GameSettings,
    mangoHudCommand?: string[],
    gameModeBin?: string,
    gameScopeCommand?: string[]
  ): Promise<string[]>
  launchEventCallback(params: LaunchParams): StatusPromise
  getKnownFixesEnvVariables(
    appName: string,
    runner: Runner
  ): Promise<Record<string, string>>
  verifyWinePrefix(gameSettings: GameSettings): Promise<{ res: ExecResult }>
  /**
   * The boot's sidecar -> Rust request leg, which the launcher already holds (LauncherDeps extends
   * RustInvokeDeps). Exposed so a flow that builds `RustInvokeDeps` for a Rust-backed shim (the
   * recent-games writes in the Steam launch dispatch) reads it from the launcher it already receives.
   */
  readonly requestRustInvoke: RustInvokeDeps['requestRustInvoke']
}

/** The Play as the `launch_run` schema takes it: the chosen launch option copied to a plain object, an absent one left out. */
function toLaunchRunRequest(params: LaunchParams): LaunchRunRequest {
  const { launchArguments, ...rest } = params
  return launchArguments
    ? { ...rest, launchArguments: { ...launchArguments } }
    : rest
}

/** The launcher, built once per boot with its own deps (D-02). */
export function createLauncher(deps: LauncherDeps): Launcher {
  return {
    prepareLaunch: (...a) => prepareLaunchAdapter(deps, ...a),
    prepareWineLaunch: (...a) => prepareWineLaunchAdapter(deps, ...a),
    setupEnvVars: async (gameSettings, installPath) =>
      settleEnvMap(
        await setupEnvVarsShim(deps, gameSettings, installPath),
        'setupEnvVars'
      ),
    setupWrapperEnvVars: async (wrapperEnv) =>
      settleEnvMap(
        await setupWrapperEnvVarsShim(deps, wrapperEnv),
        'setupWrapperEnvVars'
      ),
    setupWineEnvVars: async (gameSettings, gameId) =>
      settleEnvMap(
        await setupWineEnvVarsShim(deps, gameSettings, gameId),
        'setupWineEnvVars'
      ),
    setupWrappers: async (
      gameSettings,
      mangoHudCommand,
      gameModeBin,
      gameScopeCommand
    ) =>
      settleWordList(
        await setupWrappersShim(
          deps,
          gameSettings,
          mangoHudCommand,
          gameModeBin,
          gameScopeCommand
        ),
        'setupWrappers'
      ),
    // D-01, D-04, D-25: every non-Steam Play runs in the Rust funnel; nothing of the TS sequence runs here.
    launchEventCallback: async (params) =>
      settleLaunchStatus(await launchRun(deps, toLaunchRunRequest(params))),
    getKnownFixesEnvVariables: async (appName, runner) =>
      settleKnownFixEnv(
        await getKnownFixesEnvVariablesShim(deps, appName, runner)
      ),
    verifyWinePrefix: async (gameSettings) =>
      settleVerifyPrefixReply(
        await verifyWinePrefixShim(deps, gameSettings),
        'verifyWinePrefix'
      ),
    // A getter, so a getter-backed deps object stays call-time like the members above.
    get requestRustInvoke() {
      return deps.requestRustInvoke
    }
  }
}
