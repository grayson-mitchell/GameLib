import type { GameConfigs } from '../game_config'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import type { Runner } from 'common/types'
import {
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_WINETRICKS_APPLY,
  RUST_WINE_WINETRICKS_AVAILABLE,
  RUST_WINE_WINETRICKS_INSTALLED
} from 'common/types/sidecarTransport'
import type { WinetricksTarget } from '../services/winetricksTarget'
import type { IpcRegistry } from './ipcRegistry'

/**
 * The scheduled resolvers of the engine and wine services (Phase 87, D-23).
 *
 * A resolver is the one shape a renderer-facing channel keeps in TypeScript once its work is Rust's: it
 * gathers the inputs only TypeScript holds (here the game's merged settings, which live in the sidecar's
 * game-config store) as `const` declarations, then makes exactly one typed `requestRustInvoke` call and
 * returns it. `engineWineShimSchedule.test.ts` pins that shape, its channel and the phase that deletes each
 * resolver (Phase 98, with the config and the stores it reads), so none can grow a second call or a branch.
 *
 * 87-34 lands the DXVK family: the renderer's three toggles. Every writer of a prefix's DXVK DLLs now runs
 * the one Rust op (`wine_dxvk_install_remove`): these toggles, the launcher's DXVK step and the still-TS
 * engine's `installRemove`, the last two through the `dxvkInstallRemove` shim (`enginewine/tools.ts`). The
 * Winetricks resolvers (87-35) and the wine-command resolvers (87-36) join this file as their families
 * flip, so a family never has a TS and a Rust writer at once (D-06).
 *
 * The zod entries for `toggleDXVK`, `toggleDXVKNVAPI` and `toggleVKD3D` stay: the sidecar still receives
 * these three as renderer invokes, and `{ appName, action }` is untrusted until the registry validates it.
 */

/** What a renderer DXVK toggle sends. */
export interface DxvkToggleArgs {
  appName: string
  action: 'backup' | 'restore'
}

/** The slice every resolver of this file reads: the game configs and the one Rust transport. */
export interface EngineWineResolverDeps extends RustInvokeDeps {
  ipc: Pick<IpcRegistry, 'handle'>
  gameConfigs: Pick<GameConfigs, 'get'>
  /**
   * The Wine environment a game's Winetricks calls act on: the tool settings, or the reason there are none
   * (`services/winetricksTarget.ts`). `ensureBottle` is true when the call creates the bottle (an apply, a catalog
   * read) and false for a read of the installed list. It never rejects.
   */
  winetricksTarget: (
    runner: Runner,
    appName: string,
    opts: { ensureBottle: boolean }
  ) => Promise<WinetricksTarget>
}

/** What a renderer Winetricks read sends: the game. */
export interface WinetricksGameArgs {
  runner: Runner
  appName: string
}

/**
 * The `toggleDXVK` channel: installs (`backup`) or removes (`restore`) DXVK in the game's prefix. Resolves
 * the boolean `installRemove` answered; rejects with Rust's category word when the install failed.
 */
export async function toggleDXVK(
  deps: EngineWineResolverDeps,
  { appName, action }: DxvkToggleArgs
): Promise<unknown> {
  const gameSettings = await deps.gameConfigs.get(appName).getSettings()
  return deps.requestRustInvoke(RUST_WINE_DXVK_INSTALL_REMOVE, [
    { settings: gameSettings, tool: 'dxvk', action }
  ])
}

/**
 * The `toggleDXVKNVAPI` channel: DXVK-NVAPI in the game's prefix. macOS refuses it before any file is
 * touched (the crate keeps the TS platform guard).
 */
export async function toggleDXVKNVAPI(
  deps: EngineWineResolverDeps,
  { appName, action }: DxvkToggleArgs
): Promise<unknown> {
  const gameSettings = await deps.gameConfigs.get(appName).getSettings()
  return deps.requestRustInvoke(RUST_WINE_DXVK_INSTALL_REMOVE, [
    { settings: gameSettings, tool: 'dxvk-nvapi', action }
  ])
}

/**
 * The `toggleVKD3D` channel: vkd3d-proton in the game's prefix. macOS permits `dxvk` only and the crate
 * excludes vkd3d there before any file I/O, as the TS did, so this registers on every platform and no
 * platform branch lives here.
 */
export async function toggleVKD3D(
  deps: EngineWineResolverDeps,
  { appName, action }: DxvkToggleArgs
): Promise<unknown> {
  const gameSettings = await deps.gameConfigs.get(appName).getSettings()
  return deps.requestRustInvoke(RUST_WINE_DXVK_INSTALL_REMOVE, [
    { settings: gameSettings, tool: 'vkd3d', action }
  ])
}

/**
 * The `winetricksApply` channel: applies the renderer's verbs to the game through the Rust apply queue. The Rust
 * op runs the apply guard (the verbs against the game's catalog) before any verb reaches an argv and answers at
 * once with the state or the refusal; the verbs install detached and the queue's events (`winetricksQueueChanged`,
 * `progressOfWinetricks`, `installing-winetricks-component`) are Rust's. The verbs travel as the renderer sent
 * them: the guard, not this resolver, judges their shape.
 */
export async function winetricksApply(
  deps: EngineWineResolverDeps,
  runner: Runner,
  appName: string,
  verbs: unknown
): Promise<unknown> {
  const target = await deps.winetricksTarget(runner, appName, {
    ensureBottle: true
  })
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_APPLY, [target, verbs])
}

/**
 * The `winetricksAvailable` channel: the components winetricks can install for the game (the visible ones). Resolves
 * the list the Rust catalog read answered, which is empty when the game has no usable Wine environment, as the TS
 * handler's swallow-and-return-empty did.
 */
export async function winetricksAvailable(
  deps: EngineWineResolverDeps,
  { runner, appName }: WinetricksGameArgs
): Promise<unknown> {
  const target = await deps.winetricksTarget(runner, appName, {
    ensureBottle: true
  })
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_AVAILABLE, [target])
}

/**
 * The `winetricksInstalled` channel: the lines of the game's `winetricks.log`. A read: it never creates a bottle, and
 * a game with no usable environment has none.
 */
export async function winetricksInstalled(
  deps: EngineWineResolverDeps,
  { runner, appName }: WinetricksGameArgs
): Promise<unknown> {
  const target = await deps.winetricksTarget(runner, appName, {
    ensureBottle: false
  })
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_INSTALLED, [target])
}

/**
 * Registers every channel this file resolves, once per boot, from `handlers.ts` (pinned by
 * `registrationOncePerBoot.test.ts`). A channel is registered here or in `wineToolsFlowRegistration.ts`,
 * never both: the family moves in one commit.
 */
export function registerEngineWineResolvers(
  deps: EngineWineResolverDeps
): void {
  deps.ipc.handle('toggleDXVK', (_event: unknown, ...args: unknown[]) =>
    toggleDXVK(deps, args[0] as DxvkToggleArgs)
  )
  deps.ipc.handle('toggleDXVKNVAPI', (_event: unknown, ...args: unknown[]) =>
    toggleDXVKNVAPI(deps, args[0] as DxvkToggleArgs)
  )
  deps.ipc.handle('toggleVKD3D', (_event: unknown, ...args: unknown[]) =>
    toggleVKD3D(deps, args[0] as DxvkToggleArgs)
  )
  deps.ipc.handle('winetricksApply', (_event: unknown, ...args: unknown[]) =>
    winetricksApply(deps, args[0] as Runner, args[1] as string, args[2])
  )
  deps.ipc.handle(
    'winetricksAvailable',
    (_event: unknown, ...args: unknown[]) =>
      winetricksAvailable(deps, {
        runner: args[0] as Runner,
        appName: args[1] as string
      })
  )
  deps.ipc.handle(
    'winetricksInstalled',
    (_event: unknown, ...args: unknown[]) =>
      winetricksInstalled(deps, {
        runner: args[0] as Runner,
        appName: args[1] as string
      })
  )
}
