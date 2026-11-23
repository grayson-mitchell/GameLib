/**
 * The ledger and selection writes land twice (87-42): the local mirror at once, Rust through its shim after. A Rust
 * write that fails is logged and never stops the launch's cleanup.
 */
import {
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR
} from 'common/types/sidecarTransport'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import * as logger from 'backend/logger'
import { createTestEngineRuntime } from 'backend/testUtils/testEngineRuntime'
import {
  dropEngineSelection,
  recordGameRunning,
  recordGameStopped
} from '../engineSync'
import type { EngineSelection } from '../engineTypes'

const CX: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: null,
  binDir: '/cx/bin'
}

function runtime(reject = false) {
  const calls: Array<[string, unknown]> = []
  const rt = createTestEngineRuntime({
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args[0]])
      return reject
        ? Promise.reject(new Error('engine:down'))
        : Promise.resolve(true)
    }) as never
  })
  return { rt, calls }
}

describe('engineSync', () => {
  let warned: jest.SpyInstance
  beforeEach(() => {
    warned = jest
      .spyOn(logger, 'logWarning')
      .mockImplementation(() => undefined)
  })

  it('records a running game locally at once and in Rust after', async () => {
    const { rt, calls } = runtime()
    const pending = recordGameRunning(rt, 'GameLib-gog-1', 'gog:1')
    expect(rt.ledger.gamesRunningIn('GameLib-gog-1')).toEqual(['gog:1'])
    expect(await pending).toBe(true)
    expect(calls).toEqual([
      [
        RUST_ENGINE_LEDGER_MARK_RUNNING,
        { bottleName: 'GameLib-gog-1', key: 'gog:1' }
      ]
    ])
  })

  it('sends nothing to Rust for a game the ledger refuses', async () => {
    const { rt, calls } = runtime()
    expect(await recordGameRunning(rt, 'a/b', 'gog:1')).toBe(false)
    expect(calls).toEqual([])
  })

  it('drops a stopped game locally and in Rust, and a clear from the view and the registry and Rust', async () => {
    const { rt, calls } = runtime()
    await recordGameRunning(rt, 'GameLib-gog-1', 'gog:1')
    await recordGameStopped(rt, 'GameLib-gog-1', 'gog:1')
    expect(rt.ledger.gamesRunningIn('GameLib-gog-1')).toEqual([])
    rt.registry.setEngineSelection('gog:1', CX)
    expect(engineSelectionView.get('gog:1')).toEqual(CX)
    await dropEngineSelection(rt, 'gog:1')
    expect(engineSelectionView.get('gog:1')).toBeUndefined()
    expect(rt.registry.getEngineSelection('gog:1')).toBeUndefined()
    expect(calls.map(([channel]) => channel)).toEqual([
      RUST_ENGINE_LEDGER_MARK_RUNNING,
      RUST_ENGINE_LEDGER_MARK_STOPPED,
      RUST_ENGINE_SELECTION_CLEAR
    ])
  })

  it('logs a Rust write that failed and still finishes the local one', async () => {
    const { rt } = runtime(true)
    await recordGameRunning(rt, 'GameLib-gog-1', 'gog:1')
    expect(rt.ledger.gamesRunningIn('GameLib-gog-1')).toEqual(['gog:1'])
    rt.registry.setEngineSelection('gog:1', CX)
    await dropEngineSelection(rt, 'gog:1')
    await recordGameStopped(rt, 'GameLib-gog-1', 'gog:1')
    expect(engineSelectionView.get('gog:1')).toBeUndefined()
    expect(rt.ledger.gamesRunningIn('GameLib-gog-1')).toEqual([])
    expect(warned).toHaveBeenCalledTimes(3)
  })
})
