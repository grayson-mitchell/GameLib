import type { GameInfo } from 'common/types'
import {
  RUST_INFO_RECENT_ADD,
  RUST_INFO_RECENT_REMOVE
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * Recent games lives in Rust (Phase 86, `gamelib-info` `recent::add` / `recent::remove`): the store
 * write, the `recentGamesChanged` push and the tray refresh all happen there. These two shims are
 * the only TS path to it, kept so the launch and uninstall callers keep their call shape until the
 * phases that own them (90 and 92) call Rust directly. Each body is one typed call (D-06); the
 * shim schedule in `infoShimSchedule.test.ts` pins that and the phase that deletes them.
 */
export async function addRecentGame(
  deps: RustInvokeDeps,
  game: Pick<GameInfo, 'app_name' | 'title' | 'runner'>
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_RECENT_ADD, [
    { appName: game.app_name, title: game.title, runner: game.runner }
  ])
}

export async function removeRecentGame(
  deps: RustInvokeDeps,
  appName: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_INFO_RECENT_REMOVE, [{ appName }])
}
