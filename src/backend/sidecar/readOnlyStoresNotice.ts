import type { RequestRustInvoke } from '../host'
import { logWarning, LogPrefix } from '../logger'
import type { ReadOnlyStores } from '../storeVersioning/readOnlyStores'
import { RUST_STORE_READ_ONLY_NOTICE } from '../../common/types/sidecarTransport'

/**
 * Phase 68 D-05, Phase 85 (85-16, D-12): the read-only stores notice is raised by Rust. Lives beside
 * `gameSettingWrite.ts` rather than inside `appShellFlowRegistration.ts` because the
 * appShellImportGate (REQ-34.1-12/D-09) forbids that file from importing `../ipc`. TS still writes
 * its own per-store log lines (the flush's `log` sink) but sends nothing to the renderer; it hands
 * its entries (store keys and reasons only) to `store_read_only_notice`, which merges them with the
 * Rust host's read-only stores and emits `readOnlyStoresNotice` once per launch. A rejection is the
 * caller's to log. Creates no timer or handle (sidecar exit contract).
 */
export function raiseReadOnlyStoresNoticeInRust(
  readOnly: Pick<ReadOnlyStores, 'flush' | 'list'>,
  requestRustInvoke: RequestRustInvoke
): Promise<unknown> {
  readOnly.flush({
    send: () => {},
    log: (line) => logWarning(line, LogPrefix.Backend)
  })
  const tsEntries = readOnly
    .list()
    .map(({ storeKey, reason }) => ({ storeKey, reason }))
  return requestRustInvoke(RUST_STORE_READ_ONLY_NOTICE, [{ tsEntries }])
}
