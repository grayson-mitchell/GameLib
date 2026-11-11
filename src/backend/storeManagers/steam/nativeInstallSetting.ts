/**
 * D-13 opt-in setting — the single backend read seam for whether GameLib is
 * allowed to depot-download MAC-NATIVE Steam games in-process instead of
 * delegating to `steam://install`. Bottle-routed (non-native) titles always
 * use GameLib's depot installer regardless of this setting (quick 261030-o77). Reads the same `enableSteamNativeInstall` GlobalConfig
 * key the frontend toggle (EnableSteamNativeInstall.tsx) writes via
 * `useSetting`. Defaults to ON when unset (quick 261024-exo); an explicit
 * persisted false is respected, and the `steam://install` path remains the
 * OFF safety valve.
 *
 * This is the ONLY place that should read `enableSteamNativeInstall` — the
 * install() branch point (Plan 07) and the bottle branch (Plan 11) both
 * consult this accessor rather than duplicating the read inline.
 *
 * quick 261106-s3n: `isSteamNativeDeleteEnabled()` is the matching single
 * read seam for `enableSteamNativeDelete` ("Delete Steam games directly in
 * GameLib").
 */
import type { GlobalConfigSlice } from 'backend/config'

type SettingsReader = Pick<GlobalConfigSlice, 'getSettings'>

export function isSteamNativeInstallEnabled(config: SettingsReader): boolean {
  return config.getSettings().enableSteamNativeInstall ?? true
}

/**
 * quick 261106-s3n: whether GameLib uninstalls native Steam games itself
 * (UninstallApp, then a guarded file delete) instead of `steam://uninstall`.
 * An absent key means the user never chose, so it follows the downloader
 * setting; a persisted value wins either way. This is the ONLY reader of
 * `enableSteamNativeDelete` (it is intentionally not in config.ts defaults).
 */
export function isSteamNativeDeleteEnabled(config: SettingsReader): boolean {
  return (
    config.getSettings().enableSteamNativeDelete ??
    isSteamNativeInstallEnabled(config)
  )
}
