import type { StoreManagers } from 'backend/services/types'
import type { Runner } from 'common/types'
import { RUST_SHORTCUTS_EXIST } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import type { IpcRegistry } from './ipcRegistry'

/**
 * The scheduled resolvers of the desktop and Steam shortcut services (Phase 94, SVC-05, 86 D-24).
 *
 * A resolver is the one shape a renderer-facing channel keeps in TypeScript once its work is Rust's: it
 * gathers the inputs only TypeScript holds (here the game's title, which lives in a library manager's
 * memory) as `const` declarations, then makes exactly one typed `requestRustInvoke` call and returns it.
 * `humbleShortcutsShimSchedule.test.ts` pins that shape, its channel and the phase that deletes it (92, the
 * last store whose game data is TypeScript), so none can grow a second call or a branch.
 *
 * 94-11 lands `shortcutsExists`, the read-only tracer. The path rules, the sanitize port and the registry
 * Desktop read are Rust's (`gamelib-shortcuts`); `addShortcut` and `removeShortcut` keep their TypeScript
 * disk re-check in `shortcutsFlowRegistration.ts` until 94-22 moves them.
 */

/** The slice every resolver of this file reads: the library for a game's title and the one Rust transport. */
export interface ShortcutsResolverDeps extends RustInvokeDeps {
  ipc: Pick<IpcRegistry, 'handle'>
  managers: Pick<StoreManagers, 'library'>
}

/**
 * Whether a shortcut for the game exists on disk right now. A game the library holds no title for (the
 * `{}` sentinel of a double cache miss) has no `title`, and Rust answers `false` without a lookup rather
 * than building a path from a made-up name (260905-mv5). Resolves a boolean.
 */
export async function resolveShortcutsExists(
  deps: Pick<ShortcutsResolverDeps, 'managers' | 'requestRustInvoke'>,
  appName: string,
  runner: Runner
): Promise<unknown> {
  const title = deps.managers.library[runner].getGame(appName).getGameInfo()
    .title as string | undefined
  return deps.requestRustInvoke(RUST_SHORTCUTS_EXIST, [
    { appName, runner, title }
  ])
}

/**
 * Registers the renderer-facing handle of each resolver in this file. Called once from `handlers.ts`
 * (single-run is owned by the 'register-handlers' boot step).
 */
export function registerShortcutsResolvers(deps: ShortcutsResolverDeps): void {
  deps.ipc.handle(
    'shortcutsExists',
    async (_event: unknown, ...args: unknown[]) =>
      resolveShortcutsExists(deps, args[0] as string, args[1] as Runner)
  )
}
