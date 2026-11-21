/**
 * A fresh, isolated engine runtime for consumer tests (66.4-05). Plain object, no jest APIs:
 * every call builds its own ledger, registry, deadlines and single-flight maps, so two tests never
 * share state. The engine chain is required lazily (testServices builds one by default for every
 * suite, and loading it at import would pull `backend/utils` in ahead of suites that mock it).
 * Defaults: a fake clock and paths under `/test-gamelib`, and a Rust transport that answers the
 * bottle version gate (`store_version_gate`, Phase 85 D-17) with `ok`, so a marker write goes
 * ahead; pass `requestRustInvoke` to answer it otherwise.
 */
import { join } from 'path'
import type { AppPaths } from '../process/context'
import type { Clock } from '../process/types'
import type { EngineRuntime, EngineRuntimeDeps } from '../engine/engineRuntime'
import { createTestAbortRegistry } from './testAbortRegistry'
import { createFakeClock } from './fakeClock'
import { RUST_STORE_VERSION_GATE } from 'common/types/sidecarTransport'

export type TestEnginePaths = Pick<AppPaths, 'userHome' | 'toolsPath'>

/** A transport that answers the bottle version gate `ok` and refuses every other channel. */
const okBottleGateTransport: EngineRuntimeDeps['requestRustInvoke'] = (
  channel
) =>
  channel === RUST_STORE_VERSION_GATE
    ? Promise.resolve({ state: 'ok', version: 1, current: 1 })
    : Promise.reject(new Error(`testEngineRuntime: unexpected ${channel}`))

export function createTestEngineRuntime(
  opts: {
    clock?: Clock
    paths?: Partial<TestEnginePaths>
    aborts?: EngineRuntimeDeps['aborts']
    requestRustInvoke?: EngineRuntimeDeps['requestRustInvoke']
  } = {}
): EngineRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createEngineRuntime } =
    require('../engine/engineRuntime') as typeof import('../engine/engineRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const root = '/test-gamelib'
  return createEngineRuntime({
    clock: opts.clock ?? createFakeClock(),
    aborts: opts.aborts ?? createTestAbortRegistry(),
    requestRustInvoke: opts.requestRustInvoke ?? okBottleGateTransport,
    paths: {
      userHome: opts.paths?.userHome ?? join(root, 'home'),
      toolsPath: opts.paths?.toolsPath ?? join(root, 'tools')
    }
  })
}
