import type { ManagerDeps } from 'backend/services/types'
import { invokeSteamPoll } from '../pollRust/rustSteamPoll'
import { RUST_STEAMPOLL_INSTALL_STOP } from 'common/types/sidecarTransport'

/**
 * Stops the Rust install poll for appId. Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export async function stopInstallPolling(
  deps: Pick<ManagerDeps, 'requestRustInvoke'>,
  appId: string
): Promise<void> {
  await invokeSteamPoll(deps, RUST_STEAMPOLL_INSTALL_STOP, { appId })
}
