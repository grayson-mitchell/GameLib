/**
 * Phase 75 (P75-F, 63 D-08): the app-side steamfiles boundary. `invokeSteamFiles` is the one typed
 * rustInvoke call; its args types are strings, string arrays and a typed mutation, so a byte
 * buffer does not compile. A rejection propagates and each caller owns its fail-closed mapping.
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import { logDebug, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustSteamFilesChannel } from 'common/types/sidecarTransport'
import type { SteamFilesArgsFor, SteamFilesResultFor } from './steamFilesTypes'

export function invokeSteamFiles<C extends RustSteamFilesChannel>(
  deps: RustInvokeDeps,
  channel: C,
  args: SteamFilesArgsFor<C>
): Promise<SteamFilesResultFor<C>> {
  logDebug(`[steamfiles] rust ${channel}`, LogPrefix.Steam)
  return deps.requestRustInvoke(channel, [
    args
  ] as RustInvokeArgsOf<C>) as Promise<SteamFilesResultFor<C>>
}
