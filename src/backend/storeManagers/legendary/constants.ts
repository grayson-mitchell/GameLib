import { isSnap } from 'backend/constants/environment'
import type { AppPaths } from 'backend/process/context'
import { join } from 'path'
import { env } from 'process'

/**
 * The Legendary on-disk locations, derived from the boot's paths (D-66.4-04). Nothing is computed at
 * import: every importer calls this with `deps.paths`.
 */
export function deriveLegendaryPaths(
  paths: Pick<AppPaths, 'appFolder' | 'toolsPath'>
) {
  const legendaryConfigPath = isSnap
    ? join(env.XDG_CONFIG_HOME!, 'legendary')
    : join(paths.appFolder, 'legendaryConfig', 'legendary')
  return Object.freeze({
    legendaryConfigPath,
    legendaryUserInfo: join(legendaryConfigPath, 'user.json'),
    legendaryInstalled: join(legendaryConfigPath, 'installed.json'),
    thirdPartyInstalled: join(
      legendaryConfigPath,
      'third-party-installed.json'
    ),
    legendaryMetadata: join(legendaryConfigPath, 'metadata'),
    epicRedistPath: join(paths.toolsPath, 'redist', 'legendary')
  })
}
