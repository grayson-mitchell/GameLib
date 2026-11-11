/**
 * A fresh, isolated engine-state owner for consumer tests (D-66.3-12). Plain object, no jest
 * APIs. Publishes into `published`; the notice store is an in-memory map; macOS is assumed.
 */
import type { EngineState } from 'common/types/engine'
import type { EngineStateService } from '../engine/engineState'

export interface TestEngineState extends EngineStateService {
  /** Every state the owner published, in order. */
  published: EngineState[]
}

function loadEngineState(): typeof import('../engine/engineState') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../engine/engineState') as typeof import('../engine/engineState')
}

export function createTestEngineState(
  opts: { isMac?: boolean; now?: () => number } = {}
): TestEngineState {
  // Required lazily: testServices builds one by default for every suite, and loading the engine
  // chain at import would pull `backend/utils` in ahead of suites that mock it (launcher.engineStep).
  const { createEngineState } = loadEngineState()
  const published: EngineState[] = []
  const notices = new Map<string, unknown>()
  const service = createEngineState({
    publish: (state) => {
      published.push(state)
    },
    now: opts.now ?? (() => Date.now()),
    isMac: () => opts.isMac ?? true,
    noticeStore: () => ({
      get: (key, fallback) => (notices.has(key) ? notices.get(key) : fallback),
      set: (key, value) => {
        notices.set(key, value)
      }
    })
  })
  return Object.assign(service, { published })
}
