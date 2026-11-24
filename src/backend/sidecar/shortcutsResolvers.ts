import type { GlobalConfigSlice } from 'backend/config'
import {
  resolveAddShortcut,
  resolveAddToSteam,
  resolveIsAddedToSteam,
  resolveRemoveFromSteam,
  resolveRemoveShortcut,
  resolveShortcutsExists,
  type ShortcutResolverDeps
} from 'backend/humbleshortcuts/shortcuts'
import type { StoreManagers } from 'backend/services/types'
import type { Runner } from 'common/types'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import type { IpcRegistry } from './ipcRegistry'

/**
 * The renderer-facing handles of the desktop and Steam shortcut resolvers (Phase 94, SVC-05, 86 D-24).
 *
 * The resolvers themselves live in `humbleshortcuts/shortcuts.ts`: each gathers the inputs only TypeScript
 * holds as `const` declarations and makes exactly one typed `requestRustInvoke` call
 * (`humbleShortcutsShimSchedule.test.ts` pins that shape, its channel and the phase that deletes it, 92).
 * This module only installs the six channels the renderer calls, keeping their names, arguments and results:
 * `shortcutsExists`, `addShortcut`, `removeShortcut`, `addToSteam`, `removeFromSteam` and `isAddedToSteam`.
 * The path rules, the writers and the Steam `shortcuts.vdf` edit are Rust's (`gamelib-shortcuts`); `addShortcut`
 * and `removeShortcut` have Rust raise the result notification and answer the disk re-check (`existsAfter`) the
 * renderer sets its state from.
 */

/** The slice every handle of this file reads: the library, the settings and the one Rust transport. */
export interface ShortcutsResolverDeps extends RustInvokeDeps {
  ipc: Pick<IpcRegistry, 'handle'>
  managers: Pick<StoreManagers, 'library'>
  config: Pick<GlobalConfigSlice, 'getSettings'>
}

/** What an add or remove op answers: the files and whether any shortcut is on disk once it has settled. */
function existsAfter(outcome: unknown): boolean {
  return (
    typeof outcome === 'object' &&
    outcome !== null &&
    'existsAfter' in outcome &&
    outcome.existsAfter === true
  )
}

/**
 * Registers the renderer-facing handle of each resolver. Called once from `handlers.ts` (single-run is owned
 * by the 'register-handlers' boot step).
 */
export function registerShortcutsResolvers(deps: ShortcutsResolverDeps): void {
  const resolverDeps: ShortcutResolverDeps = {
    libraryManagers: deps.managers.library,
    config: deps.config,
    requestRustInvoke: deps.requestRustInvoke
  }
  deps.ipc.handle(
    'shortcutsExists',
    async (_event: unknown, ...args: unknown[]) =>
      resolveShortcutsExists(resolverDeps, args[0] as string, args[1] as Runner)
  )
  // Resolves whether shortcuts exist on disk once the add has settled, never before (261012-ca6).
  deps.ipc.handle('addShortcut', async (_event: unknown, ...args: unknown[]) =>
    existsAfter(
      await resolveAddShortcut(
        resolverDeps,
        args[0] as string,
        args[1] as Runner,
        (args[2] ?? undefined) as boolean | undefined
      )
    )
  )
  deps.ipc.handle(
    'removeShortcut',
    async (_event: unknown, ...args: unknown[]) =>
      existsAfter(
        await resolveRemoveShortcut(
          resolverDeps,
          args[0] as string,
          args[1] as Runner
        )
      )
  )
  deps.ipc.handle(
    'addToSteam',
    async (_event: unknown, ...args: unknown[]) =>
      (await resolveAddToSteam(
        resolverDeps,
        args[0] as string,
        args[1] as Runner
      )) === true
  )
  deps.ipc.handle(
    'removeFromSteam',
    async (_event: unknown, ...args: unknown[]): Promise<void> => {
      await resolveRemoveFromSteam(
        resolverDeps,
        args[0] as string,
        args[1] as Runner
      )
    }
  )
  deps.ipc.handle(
    'isAddedToSteam',
    async (_event: unknown, ...args: unknown[]) =>
      (await resolveIsAddedToSteam(
        resolverDeps,
        args[0] as string,
        args[1] as Runner
      )) === true
  )
}
