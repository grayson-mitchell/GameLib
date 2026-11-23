/**
 * The caller-side half of the Rust bottle switch (87-42): the selection view takes the reply's selection, a real
 * change tells `onSwitching`, and a restore whose DXVK source is missing runs the TS pin download and asks Rust once
 * more (Rust downloads no engine yet). The one typed call itself is pinned by `engineWineShimSchedule.test.ts`.
 */
import { RUST_ENGINE_BOTTLE_PREPARE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import { prepareBottle } from '../prepareBottle'
import type { EngineSelection } from '../engineTypes'
import { ENGINE_PINS } from '../enginePins'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const CROSSOVER: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: null,
  binDir: '/cx/bin'
}

function services(replies: unknown[]) {
  const calls: Array<[string, unknown[]]> = []
  let n = 0
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return Promise.resolve(replies[n++])
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  return {
    calls,
    value: {
      paths: { userHome: '/nonexistent-home' },
      engineRuntime: {
        requestRustInvoke,
        fallback: {
          pinnedEngineRoot: () => '/nonexistent-engines',
          pinnedEnginePaths: jest.fn(),
          isPinnedEngineInstalled: () => false,
          ensurePinnedEngine: jest.fn()
        }
      }
    } as unknown as Parameters<typeof prepareBottle>[0]
  }
}

describe('prepareBottle', () => {
  beforeEach(() => engineSelectionView.reset())

  it('sends the values with the selection registered, applies the reply selection and reports a real change', async () => {
    const s = services([{ ok: true, changed: true, selection: CROSSOVER }])
    const onSwitching = jest.fn()
    const out = await prepareBottle(s.value, {
      key: '620',
      bottleName: 'GameLibSteamBridge-620',
      next: CROSSOVER,
      monitorPhase: null,
      onSwitching
    })
    expect(out).toEqual({ ok: true, changed: true })
    expect(s.calls).toEqual([
      [
        RUST_ENGINE_BOTTLE_PREPARE,
        [
          {
            key: '620',
            bottleName: 'GameLibSteamBridge-620',
            next: CROSSOVER,
            monitorPhase: null,
            registerSelection: true
          }
        ]
      ]
    ])
    expect(engineSelectionView.get('620')).toEqual(CROSSOVER)
    expect(onSwitching).toHaveBeenCalledTimes(1)
  })

  it('does not report a switch that changed nothing', async () => {
    const s = services([{ ok: true, changed: false, selection: CROSSOVER }])
    const onSwitching = jest.fn()
    await prepareBottle(s.value, {
      key: '620',
      bottleName: 'b',
      next: CROSSOVER,
      onSwitching
    })
    expect(onSwitching).not.toHaveBeenCalled()
  })

  it('returns a refusal as the TS PrepareResult and leaves the view alone', async () => {
    const refusal = {
      ok: false,
      reason: 'bottle-busy',
      detail: 'another game is running in bottle "b"'
    }
    const s = services([refusal])
    engineSelectionView.apply('620', CROSSOVER)
    const out = await prepareBottle(s.value, {
      key: '620',
      bottleName: 'b',
      next: CROSSOVER
    })
    expect(out).toEqual(refusal)
    expect(s.calls).toHaveLength(1)
    expect(engineSelectionView.get('620')).toEqual(CROSSOVER)
  })

  it('downloads the pin and asks once more when the restore has no DXVK source', async () => {
    const missing = {
      ok: false,
      reason: 'dxvk-failed',
      detail: 'no DXVK source to restore "b"'
    }
    const s = services([
      missing,
      { ok: true, changed: true, selection: CROSSOVER }
    ])
    const ensurePinEngine = jest.fn().mockResolvedValue(null)
    const out = await prepareBottle(s.value, {
      key: '620',
      bottleName: 'b',
      next: CROSSOVER,
      ensurePinEngine
    })
    expect(ensurePinEngine).toHaveBeenCalledTimes(1)
    expect(ensurePinEngine).toHaveBeenCalledWith(ENGINE_PINS.current)
    expect(s.calls).toHaveLength(2)
    expect(out).toEqual({ ok: true, changed: true })
  })

  it('asks only once without a pin download, and never retries another refusal', async () => {
    const missing = {
      ok: false,
      reason: 'dxvk-failed',
      detail: 'no DXVK source to restore "b"'
    }
    const a = services([missing])
    expect(
      await prepareBottle(a.value, {
        key: '620',
        bottleName: 'b',
        next: CROSSOVER
      })
    ).toEqual(missing)
    expect(a.calls).toHaveLength(1)

    const other = {
      ok: false,
      reason: 'dxvk-failed',
      detail: 'DXVK install failed for bottle "b"'
    }
    const ensurePinEngine = jest.fn()
    const b = services([other])
    expect(
      await prepareBottle(b.value, {
        key: '620',
        bottleName: 'b',
        next: CROSSOVER,
        ensurePinEngine
      })
    ).toEqual(other)
    expect(ensurePinEngine).not.toHaveBeenCalled()
    expect(b.calls).toHaveLength(1)
  })
})
