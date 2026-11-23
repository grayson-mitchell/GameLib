/**
 * A fresh, isolated engine runtime for consumer tests (66.4-05). Plain object, no jest APIs:
 * every call builds its own ledger, registry and single-flight maps, so two tests never
 * share state. The engine chain is required lazily (testServices builds one by default for every
 * suite, and loading it at import would pull `backend/utils` in ahead of suites that mock it).
 * Defaults: paths under `/test-gamelib`, and a Rust transport that answers the
 * bottle version gate (`store_version_gate`, Phase 85 D-17) with `ok`, so a marker write goes
 * ahead; pass `requestRustInvoke` to answer it otherwise.
 */
import { join } from 'path'
import type { AppPaths } from '../process/context'
import type { EngineRuntime, EngineRuntimeDeps } from '../engine/engineRuntime'
import { engineSelectionView } from '../enginewine/selectionView'
import { createTestAbortRegistry } from './testAbortRegistry'
import {
  RUST_ENGINE_CX_RESOLVE_BIN_DIR,
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR,
  RUST_STORE_VERSION_GATE
} from 'common/types/sidecarTransport'

export type TestEnginePaths = Pick<AppPaths, 'userHome' | 'toolsPath'>

/** A transport that answers the bottle version gate `ok`, answers the ledger and selection ops and refuses every other channel. */
const okBottleGateTransport: EngineRuntimeDeps['requestRustInvoke'] = (
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
  return Promise.reject(new Error(`testEngineRuntime: unexpected ${channel}`))
}

export function createTestEngineRuntime(
  opts: {
    paths?: Partial<TestEnginePaths>
    aborts?: EngineRuntimeDeps['aborts']
    requestRustInvoke?: EngineRuntimeDeps['requestRustInvoke']
    /** A registry of its own instead of the process-wide selection view (a test of instance isolation). */
    privateSelections?: boolean
  } = {}
): EngineRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createEngineRuntime } =
    require('../engine/engineRuntime') as typeof import('../engine/engineRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const root = '/test-gamelib'
  return createEngineRuntime({
    aborts: opts.aborts ?? createTestAbortRegistry(),
    requestRustInvoke: opts.requestRustInvoke ?? okBottleGateTransport,
    // 87-42 (D-24): the Steam bridge reads selections through the process-wide view, so the runtime a test builds
    // shares it, emptied here so no test sees another's selection.
    selections: opts.privateSelections
      ? undefined
      : (() => {
          engineSelectionView.reset()
          return engineSelectionView
        })(),
    paths: {
      userHome: opts.paths?.userHome ?? join(root, 'home'),
      toolsPath: opts.paths?.toolsPath ?? join(root, 'tools')
    }
  })
}
