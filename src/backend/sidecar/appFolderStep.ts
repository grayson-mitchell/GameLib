/**
 * The 'app-folder' boot step (D-66.4-04): the one filesystem side effect that used to run as
 * `backend/constants/paths.ts` loaded, now an explicit, pinned FIRST step of the boot.
 *
 * The one-time move of the upstream Heroic config dir. GameLib started as a fork of Heroic,
 * which kept its config in `<appData>/heroic`. On the first launch after the rebrand the
 * folder moves to `<appData>/GameLib` so existing settings and library data carry over.
 * Skipped when `GameLib` already exists. Non-fatal: the worst case is an app that starts with a
 * fresh config. (The `CI=e2e` temp-folder branch was deleted in Phase 82, D-19.)
 *
 * It runs before 'logger', 'stores', 'migrations', 'config' and 'secret-vault', because every one
 * of them reads under the app folder; `pathsBootOrder.test.ts` pins that.
 *
 * Exit contract: synchronous and bounded (two existsSync and one renameSync). No timer, watcher,
 * socket or child handle; no in-flight work at boot.
 */
import { dirname, join } from 'path'
import type { AppPaths } from '../process/context'

export interface AppFolderDeps {
  fs: {
    existsSync(path: string): boolean
    renameSync(from: string, to: string): void
  }
  logError: (line: string) => void
}

export function prepareAppFolder(
  paths: Pick<AppPaths, 'appFolder'>,
  deps: AppFolderDeps
): void {
  const configRoot = dirname(paths.appFolder)
  const legacyAppFolder = join(configRoot, 'heroic')
  if (
    deps.fs.existsSync(legacyAppFolder) &&
    !deps.fs.existsSync(paths.appFolder)
  ) {
    try {
      deps.fs.renameSync(legacyAppFolder, paths.appFolder)
    } catch (error) {
      deps.logError(
        `Failed to migrate legacy Heroic config folder to GameLib: ${error}`
      )
    }
  }
}
