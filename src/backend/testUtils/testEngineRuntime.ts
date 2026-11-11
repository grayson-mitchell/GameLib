/**
 * A fresh, isolated engine runtime for consumer tests (66.4-05). Plain object, no jest APIs:
 * every call builds its own ledger, registry, deadlines and single-flight maps, so two tests never
 * share state. The engine chain is required lazily (testServices builds one by default for every
 * suite, and loading it at import would pull `backend/utils` in ahead of suites that mock it).
 * Defaults: a fake clock and paths under `/test-gamelib`.
 */
import { join } from 'path'
import type { AppPaths } from '../process/context'
import type { Clock } from '../process/types'
import type { EngineRuntime } from '../engine/engineRuntime'
import { createFakeClock } from './fakeClock'

export type TestEnginePaths = Pick<AppPaths, 'userHome' | 'toolsPath'>

export function createTestEngineRuntime(
  opts: { clock?: Clock; paths?: Partial<TestEnginePaths> } = {}
): EngineRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createEngineRuntime } =
    require('../engine/engineRuntime') as typeof import('../engine/engineRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const root = '/test-gamelib'
  return createEngineRuntime({
    clock: opts.clock ?? createFakeClock(),
    paths: {
      userHome: opts.paths?.userHome ?? join(root, 'home'),
      toolsPath: opts.paths?.toolsPath ?? join(root, 'tools')
    }
  })
}
