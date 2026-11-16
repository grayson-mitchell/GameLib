import { logInfo, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import { clearSteamRestartHold } from '../steamRestartHold'
import { pollsImpl } from './pollsFlag'
import { invokeSteamPoll } from '../pollRust/rustSteamPoll'
import { RUST_STEAMPOLL_INSTALL_STOP } from 'common/types/sidecarTransport'

/**
 * Stops the active polling loop for appId (clears the interval and removes the
 * activePolls entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export async function stopInstallPolling(
  deps: Pick<ManagerDeps, 'steamProcesses' | 'steamInstallRuntime'> &
    Pick<ManagerDeps, 'requestRustInvoke'>,
  appId: string
): Promise<void> {
  if (pollsImpl() === 'rust') {
    await invokeSteamPoll(deps, RUST_STEAMPOLL_INSTALL_STOP, { appId })
    return
  }
  const { activePolls } = deps.steamInstallRuntime.polls
  const poll = activePolls.get(appId)
  if (!poll) return
  // quick 261029-pkp: a stopped holding poll (cancel, uninstall, manifest
  // vanished) must not leave a record that re-arms at the next boot.
  if (poll.steamHold === 'holding')
    clearSteamRestartHold(appId, poll.restartHoldStore)
  clearInterval(poll.timer)
  activePolls.delete(appId)
  deps.steamProcesses.downloadMonitor.stop(appId)
  logInfo(`Steam: stopped install polling for appId ${appId}`, LogPrefix.Steam)
}
