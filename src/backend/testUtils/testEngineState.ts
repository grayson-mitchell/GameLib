/**
 * A fresh, isolated engine-state owner for consumer tests (D-66.3-12). Plain object, no jest
 * APIs. Publishes into `published`; the notice store is an in-memory map; macOS is assumed.
 */
import type { EngineState } from 'common/types/engine'
import { createEngineState } from '../engine/engineState'
import type { EngineStateService } from '../engine/engineState'

export interface TestEngineState extends EngineStateService {
  /** Every state the owner published, in order. */
  published: EngineState[]
}

export function createTestEngineState(
  opts: { isMac?: boolean; now?: () => number } = {}
): TestEngineState {
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
