import type { GameSettings, Runner } from 'common/types'
import {
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_WINETRICKS_INSTALL,
  RUST_WINE_WINETRICKS_LIST_INSTALLED
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The wine tools live in Rust (Phase 87, `gamelib-wine` `tools` and `winetricks`): the DXVK family (DXVK,
 * DXVK-NVAPI, vkd3d and the macOS DXVK) with its release lookup, download, extraction and the prefix's DLL and
 * registry bookkeeping, and Winetricks with its catalog, its installs and its apply queue. This file is the
 * async TS reach into them for a caller that is not a renderer
 * channel: the launcher's DXVK step and the still-TS engine's `installRemove` (`services/engineServices.ts`,
 * alive until 87-56 deletes the engine TS). Its body is one typed call (D-06); the shim schedule in
 * `engineWineShimSchedule.test.ts` pins that and the phase that deletes it. The renderer's three toggles
 * are the scheduled resolvers in `sidecar/engineWineResolvers.ts` over the same op, so a prefix's DXVK DLLs
 * have one writer.
 *
 * `settings` are the game's merged settings the prefix is read from (the caller already holds them, no
 * Game object crosses). `source`, when given, is the engine's pinned `{ dir, version }`: the tools-dir
 * `latest_<tool>` lookup is skipped and the copy is synchronous, as the TS `installRemove` did.
 *
 * Resolves the boolean the TS `installRemove` resolved with; rejects with Rust's category word when the
 * install failed. The host facts (environment, public directory, online) are the shell's, never sent here.
 */
export async function dxvkInstallRemove(
  deps: RustInvokeDeps,
  {
    settings,
    tool,
    action,
    source
  }: {
    settings: GameSettings
    tool: 'dxvk' | 'dxvk-nvapi' | 'vkd3d' | 'dxvk-macOS'
    action: 'backup' | 'restore'
    source?: { dir: string; version: string }
  }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_DXVK_INSTALL_REMOVE, [
    { settings, tool, action, source }
  ])
}

/**
 * Installs Winetricks verbs for a game one after another, as the launcher's known-fix step and the Steam
 * bridge's known fixes did (87-35): never a batch, never parallel, a failed verb does not stop the rest. Its
 * body is one typed call (D-06); the shim schedule pins that and the phase that deletes it. The renderer's apply
 * is the scheduled `winetricksApply` resolver over the Rust queue, a different channel: these callers send no
 * queue events and own their own game status.
 *
 * `settings` are the tool settings the caller already holds (the launcher's launch settings, the Steam bridge
 * bottle's), so no Game object crosses and Rust never resolves a game's environment from the library. Resolves
 * one outcome word per verb, in order: `installed`, `failed`, or `refused` (another component was already
 * installing). A verb that is not the shape of a real one is `failed` and never reaches an argv. Rejects with
 * Rust's category word when the call could not be made. The wine host facts are the shell's, never sent here.
 */
export async function winetricksInstallVerbs(
  deps: RustInvokeDeps,
  {
    settings,
    runner,
    appName,
    verbs
  }: {
    settings: GameSettings
    runner: Runner
    appName: string
    verbs: string[]
  }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_INSTALL, [
    { runner, appName, settings },
    verbs
  ])
}

/**
 * The lines of a game's `winetricks.log`, for the launcher's installed-packages log line (87-35). One typed
 * call; a read that never creates a bottle. `settings` are the launch settings the caller holds. Resolves a
 * `string[]`, empty when there is no log.
 */
export async function winetricksListInstalled(
  deps: RustInvokeDeps,
  {
    settings,
    runner,
    appName
  }: { settings: GameSettings; runner: Runner; appName: string }
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_WINE_WINETRICKS_LIST_INSTALLED, [
    { runner, appName, settings }
  ])
}
