/**
 * quick 261105-ord: the single backend read seam for the opt-in "Steam
 * Experimental InstallApp Feature". When on (macOS only), GameLib asks the
 * running Mac Steam client to install / adopt an app through its internal
 * IClientAppManager::InstallApp -- an undocumented Valve-internal API, hence
 * default OFF. Any non-macOS platform reports false whatever is persisted.
 *
 * This is the ONLY place that should read `steamExperimentalInstallApp`.
 */
import { GlobalConfig } from 'backend/config'
import { isMac } from 'backend/constants/environment'

export function isSteamExperimentalInstallAppEnabled(): boolean {
  return (
    isMac &&
    GlobalConfig.get().getSettings().steamExperimentalInstallApp === true
  )
}
