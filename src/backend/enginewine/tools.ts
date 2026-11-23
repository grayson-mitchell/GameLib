import type { GameSettings } from 'common/types'
import { RUST_WINE_DXVK_INSTALL_REMOVE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The wine tools live in Rust (Phase 87, `gamelib-wine` `tools`): the DXVK family (DXVK, DXVK-NVAPI,
 * vkd3d and the macOS DXVK) with its release lookup, download, extraction and the prefix's DLL and
 * registry bookkeeping. This is the one async TS reach into it for a caller that is not a renderer
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
