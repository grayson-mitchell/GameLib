/**
 * Phase 63 (D-03, D-08, D-11): the app-side scanner boundary. `invokeScan` is the one typed
 * rustInvoke call (a single all-string args object, so no byte array can be passed); `runScanner`
 * picks the ts or rust implementation per scanner and logs which one served each caller.
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import { logInfo, LogPrefix } from 'backend/logger'
import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'
import {
  RUST_SCAN_CHANNELS,
  type RustScanChannel
} from 'common/types/sidecarTransport'
import { resolveScannerImpl, type ScannerName } from './scannerImpl'
import type { ScanArgsFor, ScanOp, ScanResultFor } from './scanTypes'

export function invokeScan<C extends RustScanChannel>(
  channel: C,
  args: ScanArgsFor<C>
): Promise<ScanResultFor<C>> {
  return requestRustInvoke(channel, [args]) as Promise<ScanResultFor<C>>
}

/** Keyed `scanner|op|caller`; bounded by the fixed number of call sites. */
const loggedTriples = new Set<string>()

function isScanChannel(op: string): op is RustScanChannel {
  return (RUST_SCAN_CHANNELS as readonly string[]).includes(op)
}

/**
 * `caller` is a short tag naming the calling function; it is used only for the per-caller
 * evidence log. A rejection propagates: each wrapper owns its fail-closed mapping.
 */
export async function runScanner<Op extends ScanOp>(
  scanner: ScannerName,
  op: Op,
  args: ScanArgsFor<Op>,
  legacy: () => Promise<ScanResultFor<Op>>,
  caller: string
): Promise<ScanResultFor<Op>> {
  const impl = resolveScannerImpl(scanner)
  const key = `${scanner}|${op}|${caller}`
  if (!loggedTriples.has(key)) {
    loggedTriples.add(key)
    logInfo(
      `scanner ${scanner} op=${op} caller=${caller}: impl=${impl}`,
      LogPrefix.Backend
    )
  }
  if (impl === 'ts') return legacy()
  if (!isScanChannel(op)) {
    throw new TypeError(`runScanner: ${op} has no rustInvoke channel`)
  }
  return invokeScan(op, args as never) as Promise<ScanResultFor<Op>>
}
