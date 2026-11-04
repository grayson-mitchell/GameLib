/**
 * Per-title settings stored in GamesConfig/<appId>.json, read for bottle-eligible
 * Steam titles whose getSettings() would otherwise return only the bottle/global
 * settings (todo 2026-11-04 bridge-game-settings-read-write-split).
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { gamesConfigPath } from 'backend/constants/paths'
import type { GameSettings } from 'common/types'

/**
 * The title's stored GamesConfig entry, read straight from its file:
 * `GameConfig.get(id).config` is filled asynchronously after construction
 * (59-UAT G11), and `GameConfig.get` creates a missing file. Values are
 * unvalidated. Returns undefined on a bad appId, missing or corrupt file, or a
 * missing/non-object entry.
 */
// ts-prune-ignore-next
export function readStoredTitleConfig(
  appId: string
): Record<string, unknown> | undefined {
  if (!/^[0-9]{1,10}$/.test(appId)) return undefined
  const path = join(gamesConfigPath, `${appId}.json`)
  if (!existsSync(path)) return undefined
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >
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
 * Keys where the title file wins over bottle/global settings when present
 * (LD-1). Never bottle-shaped keys (wineVersion/wineCrossoverBottle/winePrefix):
 * the title file can hold stale ones, so the bottle stays authoritative (LD-2).
 * steamBottleConfigStore holds only wineVersion/wineCrossoverBottle/provisioned,
 * so these keys otherwise resolve from global defaults. The planned names
 * `alternativeExe` and `preferedLanguage` were Settings component names; the
 * real keys are `targetExe` and `language`.
 */
// ts-prune-ignore-next
export const TITLE_AUTHORITATIVE_KEYS: readonly (keyof GameSettings)[] = [
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
  'lastUsedLaunchOption'
]

/** Only the allowlisted keys present (`!== undefined`) in the entry. */
// ts-prune-ignore-next
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
