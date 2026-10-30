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
 */
import { GlobalConfig } from 'backend/config'

export function isSteamNativeInstallEnabled(): boolean {
  return GlobalConfig.get().getSettings().enableSteamNativeInstall ?? true
}
