/**
 * The one engine runtime and engine-state owner `createTestEngineServices` still hands the engine TS's own tests, which
 * go with that TS (87-56c, Task 3 deletes this file with them). It is not in `testServices.ts` because that file may not `require`
 * (`diPhaseGates`): the engine chain loads lazily, since every suite builds test services and loading it at import
 * would pull `backend/utils` in ahead of suites that mock it.
 */
import type { EngineState } from 'common/types/engine'
import type { EngineStateService } from '../engine/engineState'
import type { EngineServices } from '../engine/engineServices'
import { engineSelectionView } from '../enginewine/selectionView'
import { createTestAbortRegistry } from './testAbortRegistry'
import { okBottleGateTransport } from './testEngineTransport'

export function interimEngineRuntime(): EngineServices['engineRuntime'] {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createEngineRuntime } =
    require('../engine/engineRuntime') as typeof import('../engine/engineRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  engineSelectionView.reset()
  return createEngineRuntime({
    aborts: createTestAbortRegistry(),
    requestRustInvoke: okBottleGateTransport,
    selections: engineSelectionView,
    paths: { userHome: '/test-gamelib/home', toolsPath: '/test-gamelib/tools' }
  })
}

export interface InterimEngineState extends EngineStateService {
  /** Every state the owner published, in order. */
  published: EngineState[]
}

/**
 * A fresh engine-state owner for the engine TS's own tests (the factory `testEngineState.ts` held until Task 2 of
 * 87-56c deleted the boot step): publishes into `published`, an in-memory notice store, macOS assumed.
 */
export function interimEngineState(
  opts: { isMac?: boolean; now?: () => number } = {}
): InterimEngineState {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createEngineState } =
    require('../engine/engineState') as typeof import('../engine/engineState')
  /* eslint-enable @typescript-eslint/no-require-imports */
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
