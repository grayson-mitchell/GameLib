/**
 * Phase 80 (D-16): the app-side steampoll boundary. `invokeSteamPoll` is the one rustInvoke call; a
 * rejection propagates. Only the channel is logged, never the args (T-80-68).
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import { logDebug, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import {
  RUST_STEAMPOLL_STATUS,
  type RustSteamPollChannel
} from 'common/types/sidecarTransport'
import type { ManagerDeps } from 'backend/services/types'
import {
  getBottleSteamappsRoot,
  getBridgeBottleSteamappsRoot,
  type AcfSource
} from '../library/installRoot'
import type { PollRoots, PollStatus } from './steamPollTypes'

export function invokeSteamPoll<C extends RustSteamPollChannel>(
  deps: RustInvokeDeps,
  channel: C,
  args?: Record<string, unknown>
): Promise<unknown> {
  logDebug(`[steampoll] rust ${channel}`, LogPrefix.Steam)
  // A channel with an empty-tuple schema (steampoll_status) is called without args: `[]`, not `[{}]`.
  return deps.requestRustInvoke(
    channel,
    (args === undefined ? [] : [args]) as RustInvokeArgsOf<C>
  )
}

function resolveOrNull(resolve: () => string): string | null {
  try {
    return resolve()
  } catch {
    return null
  }
}

/** The native Steam root as the poll roots carry it (quotes stripped). */
export function nativeSteamRoot(deps: {
  config: Pick<ManagerDeps['config'], 'getSettings'>
}): string {
  return deps.config.getSettings().defaultSteamPath.replaceAll("'", '')
}

/**
 * The roots Rust polls, from the existing resolvers. `source` picks which non-native root must
 * resolve; the others are best effort (null when this host has no such bottle).
 */
export function pollRootsFor(
  deps: { config: Pick<ManagerDeps['config'], 'getSettings'> } & Parameters<
    typeof getBottleSteamappsRoot
  >[0] &
    Parameters<typeof getBridgeBottleSteamappsRoot>[0],
  appId: string,
  source: AcfSource = 'native'
): PollRoots {
  const steamRoot = nativeSteamRoot(deps)
  const bottle = (): string => getBottleSteamappsRoot(deps)
  const bridge = (): string => getBridgeBottleSteamappsRoot(deps, appId)
  return {
    steamRoot,
    bottleSteamappsRoot: source === 'bottle' ? bottle() : resolveOrNull(bottle),
    bridgeSteamappsRoot: source === 'bridge' ? bridge() : resolveOrNull(bridge)
  }
}

export function titleFor(
  deps: Pick<ManagerDeps, 'steamSession'>,
  appId: string
): string {
  return deps.steamSession.libraryState.library.get(appId)?.title ?? ''
}

/**
 * Drops every app that is holding for a Steam restart from an ACF-derived installed map, mutating
 * and returning it. buildInstalledMap reads StateFlags only, and a fast-path manifest already reads
 * 4 while the running Steam client is still unaware of it, so without this the window-focus
 * reconcile (refreshInstallState) and a full refresh() would flip the badge to installed the moment
 * the user alt-tabs to Steam to restart it. D-01: Rust owns the registry; its holding[] includes the
 * pending boot rearm (fail closed, T-80-70). Moved here in Phase 80.
 */
export async function withoutSteamRestartHolds<T>(
  deps: RustInvokeDeps,
  installed: Map<number, T>,
  // A status the caller already read, so one reconcile makes one status call (80-REVIEW C-WR-07).
  knownStatus?: PollStatus
): Promise<Map<number, T>> {
  const status =
    knownStatus ??
    ((await invokeSteamPoll(deps, RUST_STEAMPOLL_STATUS)) as PollStatus)
  const holding = new Set(status.holding)
  for (const appId of [...installed.keys()]) {
    if (holding.has(String(appId))) installed.delete(appId)
  }
  return installed
}
