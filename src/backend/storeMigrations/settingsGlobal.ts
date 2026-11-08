/**
 * `settings/global` (config.json) migration chain (Phase 68, D-10, D-11).
 *
 * v0 -> v1 folds the two ad hoc read-side fix-ups into one persisted step:
 * `darkTrayIcon` becomes `trayIconVariant` and the retired `libraryTopSection`
 * seeds `focusRow`. Both call the shared pure helpers so there is one source
 * of truth. The version stamp is written by the settings codec, not here.
 */
import { migrateFocusRowSelection } from 'common/focusRowMigration'
import { migrateTrayIconVariant } from 'common/trayIconVariant'
import type { Migration } from '../storeVersioning/types'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const settingsGlobalChain: readonly Migration[] = [
  {
    id: 'settings-global-v0-v1',
    to: 1,
    run(file) {
      const original = file['defaultSettings']
      if (!isPlainObject(original)) return file
      // Both helpers read the ORIGINAL object: the presence guard and the
      // legacy seed must see what is on disk, never a default-merged copy.
      const trayIconVariant = migrateTrayIconVariant(original)
      const focusRow = migrateFocusRowSelection(original)
      const next: Record<string, unknown> = {
        ...original,
        trayIconVariant,
        focusRow
      }
      // D-04 clean rewrite: the superseded fields do not stay beside the new.
      delete next['darkTrayIcon']
      delete next['libraryTopSection']
      return { ...file, defaultSettings: next }
    }
  }
]
