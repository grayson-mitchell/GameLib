import type { PollOptions } from './installRoot'
import type { ManagerDeps } from 'backend/services/types'
import {
  invokeSteamPoll,
  pollRootsFor,
  titleFor
} from '../pollRust/rustSteamPoll'
import {
  RUST_STEAMPOLL_INSTALL_START,
  RUST_STEAMPOLL_INSTALL_CANCEL_DELEGATED,
  RUST_STEAMPOLL_STATUS
} from 'common/types/sidecarTransport'
import type { PollStatus } from '../pollRust/steamPollTypes'

// ── Install polling lifecycle (D-07) ─────────────────────────────────────────
// Phase 80 (D-01): the poll loop is Rust (steampoll); these are the thin API calls.

/**
 * Starts the Rust install poll for appId. Idempotent on the Rust side; the second parameter is
 * either a plain intervalMs number (ignored, Rust owns the cadence) or a PollOptions object
 * (`source`, `isNativeHandoff`, `skippedDepots`, `delegatedToSteamClient`, ...).
 */
export async function startInstallPolling(
  deps: ManagerDeps,
  appId: string,
  intervalMsOrOptions: number | PollOptions = 3000
): Promise<void> {
  // D-16: Rust owns the poll; no TS timer. Resolves once Rust registered it.
  const options =
    typeof intervalMsOrOptions === 'number' ? {} : intervalMsOrOptions
  await invokeSteamPoll(deps, RUST_STEAMPOLL_INSTALL_START, {
    appId,
    title: titleFor(deps, appId),
    roots: pollRootsFor(deps, appId, options.source),
    options
  })
}

/**
 * True while a Steam-owned (delegated) install poll is active for `appId`.
 * Its one caller is `gamedetails/dispatch.kill()`, which skips the abort
 * controller lookup for it (a delegated install has none by design;
 * quick 261106-pvk).
 */
export async function isDelegatedInstallPolling(
  deps: Pick<ManagerDeps, 'requestRustInvoke'>,
  appId: string
): Promise<boolean> {
  const status = (await invokeSteamPoll(
    deps,
    RUST_STEAMPOLL_STATUS
  )) as PollStatus
  return (
    status.installs.find((i) => i.appId === appId)?.delegatedToSteamClient ===
    true
  )
}

/**
 * Cancel for a Steam-owned (delegated) install (quick 261105-vfq, CONTEXT
 * D-Cancel): stops GameLib's wait and reverts the status at once. Nothing is
 * cancelled inside Steam. Returns true when a delegated poll was stopped;
 * false when there is no poll or it is not delegated. Rust stops the poll and
 * sends the terminal status itself.
 */
export async function cancelDelegatedInstall(
  deps: Pick<ManagerDeps, 'requestRustInvoke'>,
  appId: string
): Promise<boolean> {
  return (await invokeSteamPoll(deps, RUST_STEAMPOLL_INSTALL_CANCEL_DELEGATED, {
    appId
  })) as boolean
}
