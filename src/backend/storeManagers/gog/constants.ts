import { join } from 'path'
import type { AppPaths } from 'backend/process/context'

/**
 * The GOG on-disk locations, derived from the boot's paths (D-66.4-04). Nothing is computed at
 * import: every importer calls this with `deps.paths`.
 */
export function deriveGogPaths(
  paths: Pick<AppPaths, 'appFolder' | 'toolsPath' | 'userData'>
) {
  const gogdlConfigPath = join(paths.appFolder, 'gogdlConfig', 'heroic_gogdl')
  return Object.freeze({
    gogdlConfigPath,
    gogSupportPath: join(gogdlConfigPath, 'gog-support'),
    gogRedistPath: join(paths.toolsPath, 'redist', 'gog'),
    gogdlAuthConfig: join(paths.userData, 'gog_store', 'auth.json')
  })
}
