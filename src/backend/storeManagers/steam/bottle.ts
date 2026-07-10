/**
 * Phase 17 (17-02): dedicated Steam CrossOver bottle foundation.
 *
 * Pure path/guard/settings helpers only — NO provisioning, install-routing,
 * or IPC here. This is the single source of truth for bottle paths, names,
 * and the name-sanitizer (T-17-01 mitigation) that 17-03 (library ACF),
 * 17-04 (provisioning), and 17-05 (games routing) all build on.
 */
import { join } from 'path'
import { existsSync } from 'graceful-fs'
import type { GameSettings } from 'common/types'
import { userHome } from 'backend/constants/paths'
import { GlobalConfig } from 'backend/config'
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import { steamBottleConfigStore } from './electronStores'

/**
 * Directory of a named CrossOver bottle.
 * `<userHome>/Library/Application Support/CrossOver/Bottles/<bottleName>`
 */
export function getBottleDir(bottleName: string): string {
  return join(
    userHome,
    'Library/Application Support/CrossOver/Bottles',
    bottleName
  )
}

/**
 * The bottle's OWN steamapps ACF root — distinct from the native
 * `defaultSteamPath`. Windows Steam installs here inside the bottle's Wine
 * prefix, regardless of host OS.
 */
export function getBottleSteamappsDir(bottleName: string): string {
  return join(
    getBottleDir(bottleName),
    'drive_c',
    'Program Files (x86)',
    'Steam',
    'steamapps'
  )
}

/**
 * T-17-01 mitigation chokepoint: every bottle-name -> path/argv site must
 * pass the name through this guard first. Mirrors buildSteamProtocolUrl's
 * numeric-guard precedent (T-03-01). Rejects any name containing a path
 * separator, a parent-directory traversal sequence, a NUL byte, or an
 * empty/whitespace-only name. Returns the trimmed name when clean.
 */
export function sanitizeBottleName(name: string): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed) return null
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.includes('\0')
  ) {
    return null
  }
  return trimmed
}

/**
 * Reuses the launcher.ts:828-836 cxbottle.conf existence predicate (the
 * existing CrossOver bottle-exists gate) as the provisioned-state signal.
 * `bottleName` defaults to the stored bottle name, falling back to
 * DEFAULT_STEAM_BOTTLE_NAME.
 */
export function isBottleProvisioned(bottleName?: string): boolean {
  const name =
    bottleName ??
    steamBottleConfigStore.get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
  return existsSync(join(getBottleDir(name), 'cxbottle.conf'))
}

/**
 * Composes a GameSettings-shaped object for the dedicated Steam bottle,
 * sourced from steamBottleConfigStore and falling back to
 * DEFAULT_STEAM_BOTTLE_NAME / the global default Wine engine. Used wherever
 * a bottled Steam operation needs a GameSettings to hand to runWineCommand.
 */
export function getSteamBottleSettings(): GameSettings {
  const globalSettings = GlobalConfig.get().getSettings()
  const storedWineVersion =
    steamBottleConfigStore.get_nodefault('wineVersion')
  const storedBottleName = steamBottleConfigStore.get_nodefault(
    'wineCrossoverBottle'
  )

  return {
    ...globalSettings,
    wineCrossoverBottle: storedBottleName ?? DEFAULT_STEAM_BOTTLE_NAME,
    wineVersion: storedWineVersion ?? globalSettings.wineVersion
  }
}
