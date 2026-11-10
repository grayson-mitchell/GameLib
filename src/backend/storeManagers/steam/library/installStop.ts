import { logInfo, LogPrefix } from 'backend/logger'
import { stopSteamDownloadMonitor } from '../steamDownloadMonitor'
import { clearSteamRestartHold } from '../steamRestartHold'
import { activePolls } from './pollState'

/**
 * Stops the active polling loop for appId (clears the interval and removes the
 * activePolls entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export function stopInstallPolling(appId: string): void {
  const poll = activePolls.get(appId)
  if (!poll) return
  // quick 261029-pkp: a stopped holding poll (cancel, uninstall, manifest
  // vanished) must not leave a record that re-arms at the next boot.
  if (poll.steamHold === 'holding')
    clearSteamRestartHold(appId, poll.restartHoldStore)
  clearInterval(poll.timer)
  activePolls.delete(appId)
  stopSteamDownloadMonitor(appId)
  logInfo(`Steam: stopped install polling for appId ${appId}`, LogPrefix.Steam)
}
