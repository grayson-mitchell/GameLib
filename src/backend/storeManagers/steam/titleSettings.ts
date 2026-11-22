/**
 * Per-title settings stored in GamesConfig/<appId>.json, read for bottle-eligible
 * Steam titles whose getSettings() would otherwise return only the bottle/global
 * settings (todo 2026-11-04 bridge-game-settings-read-write-split).
 */
import { join } from 'path'
import type { AppPaths } from 'backend/process/context'
import {
  readSettingsDoc,
  type SettingsDocRoot
} from 'backend/stores/settingsDocs'
import type { GameSettings } from 'common/types'

/**
 * The title's stored GamesConfig entry, read through the settings-document seam:
 * the per-game config's `.config` is filled asynchronously after construction
 * (59-UAT G11), and fetching that config creates a missing file. When the shell
 * owns the settings family the read is the mirror's view, pending writes included,
 * so a setting the Settings screen wrote a moment ago reads back (85-15); otherwise
 * it is the file. Values are unvalidated. Returns undefined on a bad appId, missing
 * or corrupt file, or a missing/non-object entry.
 */
export function readStoredTitleConfig(
  appId: string,
  deps: {
    paths: Pick<AppPaths, 'gamesConfigPath'>
    /** The boot's store root (85-15). Absent (a test), the document is read from disk. */
    storeRoot?: SettingsDocRoot
  }
): Record<string, unknown> | undefined {
  if (!/^[0-9]{1,10}$/.test(appId)) return undefined
  const path = join(deps.paths.gamesConfigPath, `${appId}.json`)
  try {
    const raw = readSettingsDoc(deps.storeRoot ?? {}, path)
    if (raw === undefined) return undefined
    const entry = raw[appId]
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return undefined
    }
    return entry as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Identity helper: keeps the literal tuple type while checking every key against
 * GameSettings. Stands in for `as const satisfies readonly (keyof GameSettings)[]`,
 * whose `satisfies`/`readonly` tokens ts-prune reports as unreachable exports.
 */
function settingsKeys<const T extends readonly (keyof GameSettings)[]>(
  keys: T
): T {
  return keys
}

/**
 * Keys where the title file wins over bottle/global settings when present
 * (LD-1). Never bottle-shaped keys (wineVersion/wineCrossoverBottle/winePrefix):
 * the title file can hold stale ones, so the bottle stays authoritative (LD-2).
 * steamBottleConfigStore holds only wineVersion/wineCrossoverBottle/provisioned,
 * so these keys otherwise resolve from global defaults. The planned names
 * `alternativeExe` and `preferedLanguage` were Settings component names; the
 * real keys are `targetExe` and `language`.
 */
export const TITLE_AUTHORITATIVE_KEYS = settingsKeys([
  'launcherArgs',
  'targetExe',
  'enviromentOptions',
  'wrapperOptions',
  'beforeLaunchScriptPath',
  'afterLaunchScriptPath',
  'language',
  'verboseLogs',
  'showFps',
  'showMangohud',
  'lastUsedLaunchOption',
  // quick 261117-q1t live gate: without this a bridge game's toggle read as off at Play.
  'launchWithoutSteam'
])

/** Only the allowlisted keys present (`!== undefined`) in the entry. */
export function pickTitleSettings(
  entry: Record<string, unknown> | undefined
): Partial<GameSettings> {
  const out: Record<string, unknown> = {}
  if (!entry) return out as Partial<GameSettings>
  for (const key of TITLE_AUTHORITATIVE_KEYS) {
    if (entry[key] !== undefined) out[key] = entry[key]
  }
  return out as Partial<GameSettings>
}
