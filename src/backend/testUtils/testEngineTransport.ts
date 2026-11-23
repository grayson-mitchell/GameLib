/**
 * The fake sidecar -> Rust transport the Steam consumer tests use (87-56c, replacing `testEngineRuntime.ts`). The
 * engine runtime that file built is gone: every Steam slice now takes the transport itself, and the process-wide
 * selection view (`enginewine/selectionView.ts`) holds the selections. No jest APIs: a plain function and a plain
 * object, so two tests never share state except the view, which `createTestEngineTransport` empties.
 *
 * The transport answers the bottle version gate (`store_version_gate`, Phase 85 D-17) with `ok`, so a marker write
 * goes ahead, and answers Rust's ledger, selection-clear and CrossOver lookup as an empty Rust state would; pass
 * `requestRustInvoke` to answer anything else.
 */
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import { engineSelectionView } from '../enginewine/selectionView'
import { crossoverBinDirSync } from '../enginewine/twin'
import type { SteamCrossoverLocator } from '../storeManagers/steam/bottle'
import {
  crossoverBinDir,
  crossoverHintWineBins
} from '../storeManagers/steam/engine/crossoverBinDir'
import {
  RUST_ENGINE_CX_RESOLVE_BIN_DIR,
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR,
  RUST_STORE_VERSION_GATE
} from 'common/types/sidecarTransport'

/** A transport that answers the bottle version gate `ok`, answers the ledger and selection ops and refuses every other channel. */
export const okBottleGateTransport: RustInvokeDeps['requestRustInvoke'] = (
  channel
) => {
  if (channel === RUST_STORE_VERSION_GATE) {
    return Promise.resolve({ state: 'ok', version: 1, current: 1 })
  }
  // 87-42: Rust's ledger and selection clear answer as an empty Rust state would.
  if (channel === RUST_ENGINE_LEDGER_MARK_RUNNING) return Promise.resolve(true)
  if (channel === RUST_ENGINE_LEDGER_MARK_STOPPED) return Promise.resolve(null)
  if (channel === RUST_ENGINE_SELECTION_CLEAR) return Promise.resolve(false)
  // 87-55: Rust's CrossOver lookup answers as a machine with no CrossOver would.
  if (channel === RUST_ENGINE_CX_RESOLVE_BIN_DIR) return Promise.resolve(null)
  return Promise.reject(new Error(`testEngineTransport: unexpected ${channel}`))
}

const TEST_ENGINE_CHANNELS: ReadonlySet<string> = new Set([
  RUST_STORE_VERSION_GATE,
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR,
  RUST_ENGINE_CX_RESOLVE_BIN_DIR
])

/** Whether `okBottleGateTransport` answers the channel (a test routing several fakes by channel asks this). */
export function isTestEngineChannel(channel: string): boolean {
  return TEST_ENGINE_CHANNELS.has(channel)
}

/**
 * The transport a Steam test passes as `requestRustInvoke`, in the shape the slices take. The selection view is
 * emptied here so no test sees another's selection.
 */
export function createTestEngineTransport(
  opts: { requestRustInvoke?: RustInvokeDeps['requestRustInvoke'] } = {}
): RustInvokeDeps {
  engineSelectionView.reset()
  return { requestRustInvoke: opts.requestRustInvoke ?? okBottleGateTransport }
}

/**
 * The CrossOver locator a test Steam bottle starts from, wired as the boot's facade is (87-56b, 87-55): the synchronous
 * read is the twin of Rust's `resolve_bin_dir_sync`, the asynchronous one asks Rust through the transport (which
 * answers "no CrossOver" unless the test says otherwise).
 */
export function createTestCrossoverLocator(
  userHome: string,
  transport: RustInvokeDeps = okBottleGateDeps
): SteamCrossoverLocator {
  return {
    resolveCrossoverBinDir: (opts) =>
      crossoverBinDirSync(userHome, crossoverHintWineBins(opts ?? {})) ??
      undefined,
    resolveCrossoverBinDirAsync: (_deps, opts) =>
      crossoverBinDir(transport, opts)
  }
}

const okBottleGateDeps: RustInvokeDeps = {
  requestRustInvoke: okBottleGateTransport
}
