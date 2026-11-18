/**
 * Phase 80 (D-16): the app-side steampoll boundary. `invokeSteamPoll` is the one rustInvoke call; a
 * rejection propagates. Only the channel is logged, never the args (T-80-68).
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import { logDebug, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustSteamPollChannel } from 'common/types/sidecarTransport'
import type { ManagerDeps } from 'backend/services/types'
import {
  getBottleSteamappsRoot,
  getBridgeBottleSteamappsRoot,
  type AcfSource
} from '../library/installRoot'
import type { PollRoots } from './steamPollTypes'

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
