/**
 * `settings/global` (config.json) migration chain (Phase 68, D-10, D-11).
 *
 * v0 -> v1 folds the two ad hoc read-side fix-ups into one persisted step:
 * `darkTrayIcon` becomes `trayIconVariant` and the retired `libraryTopSection`
 * seeds `focusRow`. Both call the shared pure helpers so there is one source
 * of truth. The version stamp is written by the settings codec, not here.
 *
 * v1 -> v2 (Phase 70 gap G3, global half, WR-05) strips `defaultSettings` to
 * `appSettingsSchema.partial()`. (1) v2 removes what the strict schema cannot
 * hold: undeclared/retired keys (e.g. `useSteamRuntime`), rejected nulls and
 * invalid values. An invalid array element is removed on its own and its
 * valid siblings stay; an older-build `gamescope` is repaired, not dropped
 * (see settingsStrip.ts, WR-02). (2) The factory default then applies for
 * each removed value. (3) Valid values are untouched, including
 * `focusRow: null`. (4) Trade-off: an invalid user value is dropped from the
 * live file; the engine's 0600 pre-migration backup keeps the original, and
 * each removed or cleaned key is logged by name. v0 -> v1 stays first because the
 * strip removes both legacy keys.
 */
import { migrateFocusRowSelection } from 'common/focusRowMigration'
import { migrateTrayIconVariant } from 'common/trayIconVariant'
import { appSettingsSchema } from 'common/types/ipc/settingsSchema'
import type { Migration } from '../storeVersioning/types'
import { stripSettings } from './settingsStrip'

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
  },
  {
    id: 'settings-global-v1-v2',
    to: 2,
    run(file) {
      const original = file['defaultSettings']
      if (!isPlainObject(original)) return file
      return {
        ...file,
        defaultSettings: stripSettings(
          original,
          appSettingsSchema.partial(),
          'settings-global-v1-v2 defaultSettings'
        )
      }
    }
  }
]
