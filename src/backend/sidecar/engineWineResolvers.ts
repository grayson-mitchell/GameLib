import type { GameConfigs } from '../game_config'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import { RUST_WINE_DXVK_INSTALL_REMOVE } from 'common/types/sidecarTransport'
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
}
