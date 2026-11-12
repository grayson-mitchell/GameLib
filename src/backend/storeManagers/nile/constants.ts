import type { AppPaths } from 'backend/process/context'
import { join } from 'path'

/**
 * The Nile on-disk locations, derived from the boot's paths (D-66.4-04). Nothing is computed at
 * import: every importer calls this with `deps.paths`.
 */
export function deriveNilePaths(paths: Pick<AppPaths, 'appFolder'>) {
  const nileConfigPath = join(paths.appFolder, 'nile_config', 'nile')
  return Object.freeze({
    nileConfigPath,
    nileInstalled: join(nileConfigPath, 'installed.json'),
    nileLibrary: join(nileConfigPath, 'library.json'),
    nileUserData: join(nileConfigPath, 'current_user.json')
  })
}
