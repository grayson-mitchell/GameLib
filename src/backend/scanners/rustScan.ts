/**
 * Phase 63 (D-03, D-08, D-11): the app-side scanner boundary. `invokeScan` is the one typed
 * rustInvoke call (a single all-string args object, so no byte array can be passed). Every
 * wrapper calls it directly; a rejection propagates and each wrapper owns its fail-closed mapping.
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustScanChannel } from 'common/types/sidecarTransport'
import type { ScanArgsFor, ScanResultFor } from './scanTypes'

export function invokeScan<C extends RustScanChannel>(
  channel: C,
  args: ScanArgsFor<C>
): Promise<ScanResultFor<C>> {
  return requestRustInvoke(channel, [args] as RustInvokeArgsOf<C>) as Promise<
    ScanResultFor<C>
  >
}
