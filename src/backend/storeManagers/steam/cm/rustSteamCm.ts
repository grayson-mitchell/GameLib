/**
 * Phase 79 (D-03): the app-side steamcm boundary. `invokeSteamCm` is the one typed rustInvoke call
 * for the lease-bound and anonymous CM channels. A rejection propagates; the adapters own the
 * mapping of `{ok:false}` results to errors.
 *
 * Exit contract: no timers, no handles, no work at import.
 * Logging: never logs args or results: they carry refresh tokens, passwords, guard codes, product
 * keys and request codes. The debug line names the channel only.
 */
import { logDebug, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type {
  RustSteamCmClientChannel,
  SteamCmArgsFor,
  SteamCmResultFor
} from './steamCmTypes'

export function invokeSteamCm<C extends RustSteamCmClientChannel>(
  deps: RustInvokeDeps,
  channel: C,
  args: SteamCmArgsFor<C>
): Promise<SteamCmResultFor<C>> {
  logDebug(`[steamcm] rust ${channel}`, LogPrefix.Steam)
  return deps.requestRustInvoke(channel, [
    args
  ] as unknown as RustInvokeArgsOf<C>) as Promise<SteamCmResultFor<C>>
}
