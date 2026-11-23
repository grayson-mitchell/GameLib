/**
 * The one engine runtime `createTestEngineServices` still hands the engine TS's own tests, which go with that TS
 * (87-56c, Task 3 deletes this file with them). It is not in `testServices.ts` because that file may not `require`
 * (`diPhaseGates`): the engine chain loads lazily, since every suite builds test services and loading it at import
 * would pull `backend/utils` in ahead of suites that mock it.
 */
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
