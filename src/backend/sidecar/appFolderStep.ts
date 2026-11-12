/**
 * The 'app-folder' boot step (D-66.4-04): the two filesystem side effects that used to run as
 * `backend/constants/paths.ts` loaded, now an explicit, pinned FIRST step of the boot.
 *
 *   1. The one-time move of the upstream Heroic config dir. GameLib started as a fork of Heroic,
 *      which kept its config in `<appData>/heroic`. On the first launch after the rebrand the
 *      folder moves to `<appData>/GameLib` so existing settings and library data carry over.
 *      Skipped when `GameLib` already exists, and under e2e (isolated temp dir). Non-fatal: the
 *      worst case is an app that starts with a fresh config.
 *   2. Under `CI=e2e`, the temp config root the paths were derived from is created, with its
 *      `GameLib` folder. `CI === 'e2e'` IS CURRENTLY UNREACHABLE, and that is a recorded decision
 *      (D-35-14-01), not an oversight: Phase 35 Plan 14 deleted the Playwright suite and
 *      `test:e2e` was the only thing that set it. Kept as the hook a Tauri e2e path will want.
 *      `tmp`'s cleanup is a process 'exit' listener (tmp 0.2.4, lib/tmp.js:732), which holds no
 *      event-loop reference, so the step leaves nothing alive (RESEARCH A4).
 *
 * It runs before 'logger', 'stores', 'migrations', 'config' and 'secret-vault', because every one
 * of them reads under the app folder; `pathsBootOrder.test.ts` pins that.
 *
 * Exit contract: synchronous and bounded (two existsSync and one renameSync, or one dirSync and
 * one mkdirSync). No timer, watcher, socket or child handle; no in-flight work at boot.
 */
import { basename, dirname, join } from 'path'
import type { dirSync as DirSync } from 'tmp'
import type { AppPaths } from '../process/context'

export interface AppFolderDeps {
  env: NodeJS.ProcessEnv
  fs: {
    existsSync(path: string): boolean
    renameSync(from: string, to: string): void
    mkdirSync(path: string): unknown
  }
  dirSync: typeof DirSync
  log: (line: string) => void
  logError: (line: string) => void
}

export function prepareAppFolder(
  paths: Pick<AppPaths, 'appFolder'>,
  deps: AppFolderDeps
): void {
  const configRoot = dirname(paths.appFolder)
  if (deps.env.CI === 'e2e') {
    const temp = deps.dirSync({
      name: basename(configRoot),
      tmpdir: dirname(configRoot),
      unsafeCleanup: true
    })
    deps.log(`CI is set to "e2e", storing Heroic config files in ${temp.name}`)
    deps.fs.mkdirSync(paths.appFolder)
    return
  }

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
