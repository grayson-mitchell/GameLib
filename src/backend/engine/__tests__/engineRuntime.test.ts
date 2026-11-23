/**
 * 66.4-05: the boot-owned engine runtime. Two runtimes share nothing; single-flight is per
 * instance (the bottle switch's own serialisation is Rust's, `golden_switch.rs` cases
 * `concurrent-same-target-wr02` and `concurrent-different-bottles-independent-wr02`); construction arms nothing. The launch deadlines
 * and the per-launch bookkeeping went with the TS launch step (87-56): Rust owns them.
 */
import type { GameSettings } from 'common/types'
import * as logger from 'backend/logger'

import { join } from 'path'
import type { AppPaths } from 'backend/process/context'
import { createTestAbortRegistry } from 'backend/testUtils/testAbortRegistry'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import { okBottleGateTransport } from 'backend/testUtils/testEngineTransport'
import { createEngineRuntime, type EngineRuntimeDeps } from '../engineRuntime'
import { createTestEngineServices } from 'backend/testUtils/testServices'
import { buildFallbackGameSettings } from 'backend/enginewine/twin'
import type { EngineSelection } from '../engineTypes'

/**
 * A fresh, isolated engine runtime (the factory the shared test helper held until 87-56c moved the Steam tests to the
 * transport alone; this file goes with the engine TS in the same plan). Paths under `/test-gamelib`, and the fake transport
 * that answers the bottle version gate with `ok`.
 */
function createTestEngineRuntime(
  opts: {
    paths?: Partial<Pick<AppPaths, 'userHome' | 'toolsPath'>>
    aborts?: EngineRuntimeDeps['aborts']
    requestRustInvoke?: EngineRuntimeDeps['requestRustInvoke']
    /** A registry of its own instead of the process-wide selection view (a test of instance isolation). */
    privateSelections?: boolean
  } = {}
) {
  const root = '/test-gamelib'
  return createEngineRuntime({
    aborts: opts.aborts ?? createTestAbortRegistry(),
    requestRustInvoke: opts.requestRustInvoke ?? okBottleGateTransport,
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

const cx: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: null,
  binDir: '/cx/bin'
}

// The boot installs the real log writer; here the three levels the engine uses are silenced.
beforeEach(() => {
  jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
  jest.spyOn(logger, 'logError').mockImplementation(() => undefined)
})

describe('createEngineRuntime', () => {
  it('construction arms no timer', () => {
    const runtime = createTestEngineRuntime()
    expect(runtime.ledger.gamesRunningIn('GameLib')).toEqual([])
  })

  it('two runtimes share no ledger, selection or overlay context', () => {
    const a = createTestEngineRuntime()
    const b = createTestEngineRuntime()
    a.ledger.markGameRunning('GameLib', 'gog:1')
    expect(b.ledger.gamesRunningIn('GameLib')).toEqual([])
    a.launchSettings.setLaunchOverlayContext('gog:1', {
      prefix: { kind: 'plain' }
    })
    expect(b.launchSettings.getLaunchOverlayContext('gog:1')).toBeUndefined()
  })

  it('the CrossOver memo is per instance', () => {
    const a = createTestEngineRuntime({ privateSelections: true })
    const b = createTestEngineRuntime({ privateSelections: true })
    expect(a.crossover).not.toBe(b.crossover)
    expect(a.registry.setEngineSelection('gog:1', cx)).toBe(true)
    expect(b.registry.getEngineSelection('gog:1')).toBeUndefined()
  })
})

describe('FALLBACK_STRIPPED_ENV_KEYS (T-66.4-16)', () => {
  it('still strips every former member, case-insensitively, and keeps the rest', () => {
    const former = [
      'USER',
      'WINEPREFIX',
      'CX_BOTTLE',
      'CX_ROOT',
      'WINELOADER',
      'WINESERVER',
      'WINEDEBUG',
      'MVK_CONFIG_LOG_LEVEL'
    ]
    const out = buildFallbackGameSettings(
      { userHome: '/h' },
      'B',
      {
        wineBin: '/w',
        wineserverBin: '/s',
        label: 'L',
        version: '1',
        dxvk: null
      },
      {
        enviromentOptions: [
          ...former.map((key) => ({ key: key.toLowerCase(), value: 'bad' })),
          { key: 'KEEP', value: 'yes' }
        ]
      } as GameSettings
    )
    const keys = (out.enviromentOptions ?? []).map((e) => e.key)
    for (const key of former) {
      expect(
        (out.enviromentOptions ?? []).filter(
          (e) => e.key.toLowerCase() === key.toLowerCase() && e.value === 'bad'
        )
      ).toEqual([])
    }
    expect(keys).toContain('KEEP')
  })
})

describe('single-flight per boot instance', () => {
  const tick = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }

  it('concurrent per-game bottle creations share one promise; another runtime starts its own', async () => {
    const rt = createTestEngineRuntime()
    const services = createTestEngineServices({ engineRuntime: rt })
    let release: (v: unknown) => void = () => undefined
    const gate = new Promise((res) => {
      release = res
    })
    const make = () => ({
      isProvisioned: () => false,
      currentPin: () => ({ id: 'pin' }) as never,
      decide: jest
        .fn()
        .mockResolvedValue({ kind: 'pinned', reason: 'cx-missing', pin: {} }),
      resolveBinDir: () => Promise.resolve(undefined),
      createCrossover: jest.fn(),
      ensurePin: jest.fn().mockResolvedValue({
        ok: true,
        engine: { wineBin: '/w', wineserverBin: '/s', label: 'L' }
      }),
      createFallback: jest.fn().mockImplementation(async () => {
        await gate
        return { status: 'done', createdHere: true }
      })
    })
    const args = {
      key: 'gog:1' as const,
      bottleName: 'GameLib-gog-1',
      appName: '1',
      runner: 'gog' as const
    }
    const d1 = make()
    const d2 = make()
    const a = rt.perGameBottle.ensureGameBottle(services, args, d1 as never)
    const b = rt.perGameBottle.ensureGameBottle(services, args, d1 as never)
    const other = createTestEngineRuntime()
    const c = other.perGameBottle.ensureGameBottle(services, args, d2 as never)
    await tick()
    release(undefined)
    await Promise.all([a, b, c])
    expect(d1.createFallback).toHaveBeenCalledTimes(1)
    expect(d2.createFallback).toHaveBeenCalledTimes(1)
    // after it settled, a new request starts a new creation
    await rt.perGameBottle.ensureGameBottle(services, args, d1 as never)
    expect(d1.createFallback).toHaveBeenCalledTimes(2)
  })
})
