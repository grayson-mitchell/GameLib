import type { AppManagementStatus } from 'common/types'

/**
 * First-run detection and App Management view mapping for the welcome screen
 * (quick 261026-b9r). Pure, no React.
 *
 * Signal choice: `last_version` is written by HeroicVersion on every launch of
 * every build since the Heroic fork, and is read at module load before the
 * version effect overwrites it, so its presence is the most reliable "has run
 * before" evidence. `last_changelog` (written when any changelog was
 * dismissed) is a second, independent witness. An upgrade therefore always has
 * `last_version` and keeps the changelog. `WELCOME_SEEN_KEY` is the marker
 * written once the welcome is dismissed.
 *
 * Known residual: a pre-Tauri (Electron-era) install whose webview localStorage
 * did not carry over would be treated as a first run.
 */
export const WELCOME_SEEN_KEY = 'gamelib_welcome_seen'

function absent(value: string | null | undefined): boolean {
  return (
    value === null || value === undefined || value === '' || value === 'null'
  )
}

export function isFirstRun({
  welcomeSeen,
  lastVersion,
  lastChangelog
}: {
  welcomeSeen: string | null
  lastVersion: string | undefined | null
  lastChangelog: string | null
}): boolean {
  return absent(welcomeSeen) && absent(lastVersion) && absent(lastChangelog)
}

export interface AppManagementView {
  visible: boolean
  statusKey: string
  showOpenSettings: boolean
  showRelaunch: boolean
}

export function appManagementView(
  status: AppManagementStatus
): AppManagementView {
  switch (status) {
    case 'granted':
      return {
        visible: true,
        statusKey: 'welcome.appManagement.status.granted',
        showOpenSettings: false,
        showRelaunch: true
      }
    case 'denied':
      return {
        visible: true,
        statusKey: 'welcome.appManagement.status.denied',
        showOpenSettings: true,
        showRelaunch: false
      }
    case 'unknown':
      return {
        visible: true,
        statusKey: 'welcome.appManagement.status.unknown',
        showOpenSettings: true,
        showRelaunch: false
      }
    default:
      return {
        visible: false,
        statusKey: 'welcome.appManagement.status.notNeeded',
        showOpenSettings: false,
        showRelaunch: false
      }
  }
}
