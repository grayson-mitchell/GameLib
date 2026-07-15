/**
 * D-13 opt-in setting — the single backend read seam for whether GameLib is
 * allowed to depot-download Steam games in-process instead of delegating to
 * `steam://install`. Reads the same `enableSteamNativeInstall` GlobalConfig
 * key the frontend toggle (EnableSteamNativeInstall.tsx) writes via
 * `useSetting`. Defaults to false (opt-in, safety valve) when unset.
 *
 * This is the ONLY place that should read `enableSteamNativeInstall` — the
 * install() branch point (Plan 07) and the bottle branch (Plan 11) both
 * consult this accessor rather than duplicating the read inline.
 */
import { GlobalConfig } from 'backend/config'

export function isSteamNativeInstallEnabled(): boolean {
  return GlobalConfig.get().getSettings().enableSteamNativeInstall ?? false
}
