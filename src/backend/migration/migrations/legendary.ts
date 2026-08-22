import { app } from 'electron'
import { access, cp, rename, rm } from 'fs/promises'
import { join } from 'path'

import { isLinux } from 'backend/constants/environment'
import { userHome } from 'backend/constants/paths'
import { legendaryConfigPath } from 'backend/storeManagers/legendary/constants'

import type { PathLike } from 'fs'
import type { Migration } from '..'

const exists = async (path: PathLike) =>
  access(path).then(
    () => true,
    () => false
  )

export class LegendaryGlobalConfigFolderMigration implements Migration {
  identifier = 'legendary-move-global-config-folder'
  async run(): Promise<boolean> {
    const hasHeroicSpecificConfig = await exists(legendaryConfigPath)
    // Don't overwrite existing configuration
    if (hasHeroicSpecificConfig) return true

    const globalLegendaryConfig = isLinux
      ? join(app.getPath('appData'), 'legendary')
      : join(userHome, '.config', 'legendary')

    const hasGlobalConfig = await exists(globalLegendaryConfig)
    // Nothing to migrate
    if (!hasGlobalConfig) return true

    // Staged copy, then a rename into place. This is NOT a stylistic preference --
    // copying straight into `legendaryConfigPath` created a FAILURE-LOCK, closed here
    // as a precondition for wiring this migration into the Tauri sidecar (quick task
    // 260822-s8y), where it is about to run for the first time ever.
    //
    // The previous shape was `mkdir(legendaryConfigPath)` followed by `cp` into it. Any
    // failure after that mkdir -- partial copy, EACCES, disk full, a crash mid-copy --
    // left the destination directory EXISTING. On the next launch the
    // `hasHeroicSpecificConfig` check at the top of this function then answered `true`,
    // so `run()` returned `true` on its first line and `MigrationSystem` recorded the
    // migration as applied FOREVER, over a partial or empty config. The failure was
    // indistinguishable from success and could never retry.
    //
    // The `mkdir` was also redundant: `cp(..., { recursive: true })` creates the
    // destination and its intermediate directories itself (verified against the
    // installed Node, not assumed).
    //
    // Staging sibling, not a tmpdir: `rename` is only atomic within a filesystem, and
    // `os.tmpdir()` is frequently a different one (`EXDEV`).
    const stagingPath = `${legendaryConfigPath}.migrating`
    try {
      // A staging directory surviving from a previously interrupted attempt is stale by
      // definition -- the source is the authority, so discard rather than merge into it.
      await rm(stagingPath, { recursive: true, force: true })
      await cp(globalLegendaryConfig, stagingPath, { recursive: true })
      await rename(stagingPath, legendaryConfigPath)
    } catch (error) {
      // Leave NO destination behind, so `hasHeroicSpecificConfig` is still false next
      // launch and this migration retries. Rethrow: `MigrationSystem.applyMigration`
      // catches it, logs it, and does not record the identifier as applied.
      await rm(stagingPath, { recursive: true, force: true }).catch(() => {})
      throw error
    }
    return true
  }
}
