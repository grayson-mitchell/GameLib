/**
 * Phase 82 (FND-02, D-08): the protected-root list handed to the Rust guard. Built ONLY from
 * settings and app paths, never from the data being validated (a target, a manifest or a library
 * entry): a root derived from the thing under test would protect nothing. Filesystem, drive and
 * UNC roots are protected inside the crate.
 *
 * Exit contract: no timers, no handles, no work at import, no module-level mutable state.
 */
import { join } from 'path'
import type { GlobalConfigSlice } from 'backend/config'
import type { AppPaths } from 'backend/process/context'

export interface ProtectedRootsDeps {
  paths: Pick<
    AppPaths,
    | 'userHome'
    | 'appFolder'
    | 'heroicInstallPath'
    | 'defaultWinePrefixDir'
    | 'defaultWinePrefix'
    | 'sharedWinePrefix'
  >
  config: Pick<GlobalConfigSlice, 'getSettings'>
}

export function protectedRootsFor(deps: ProtectedRootsDeps): string[] {
  const { paths } = deps
  const settings = deps.config.getSettings()
  const candidates: (string | undefined)[] = [
    paths.userHome,
    paths.appFolder,
    paths.heroicInstallPath,
    paths.defaultWinePrefixDir,
    paths.defaultWinePrefix,
    paths.sharedWinePrefix,
    settings.defaultInstallPath,
    settings.sharedWinePrefix,
    ...['Desktop', 'Documents', 'Downloads', 'Applications'].map((name) =>
      paths.userHome ? join(paths.userHome, name) : undefined
    )
  ]
  return [
    ...new Set(candidates.filter((p): p is string => !!p && p.length > 0))
  ]
}
