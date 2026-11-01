import { chmodSync, copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  CX_CREATE_CAP_MS,
  decideCreationEngine,
  decideLaunchEngine,
  listEngineOverrideOptions,
  preflightCrossover,
  resolveWineManagerStaging
} from '../engineDecision'
import type { EngineDecisionDeps } from '../engineDecision'
import { ENGINE_PINS } from '../enginePins'
import { parseEngineOverride } from '../engineIds'
import type { DemoStatus, DemoStatusProbe } from '../demoStatus'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const CX_BIN =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const WM_ROOT = '/tools/wine'

const ok = (status: DemoStatus) =>
  ({ kind: 'ok', status, elapsedMs: 1 }) as DemoStatusProbe
const failed = (
  reason: 'timeout' | 'spawn-error' | 'nonzero-exit' | 'invalid-bottle'
) => ({ kind: 'failed', reason, detail: 'x', elapsedMs: 1 }) as DemoStatusProbe

/** Probe that resolves the given results in order, repeating the last one. */
const seq = (...results: DemoStatusProbe[]) => {
  let i = 0
  return jest.fn(() =>
    Promise.resolve(results[Math.min(i++, results.length - 1)])
  )
}

function mkDeps(
  over: Partial<EngineDecisionDeps> = {}
): Partial<EngineDecisionDeps> {
  return {
    resolveCrossoverBinDir: () => Promise.resolve(CX_BIN),
    isExecutable: () => true,
    fileExists: () => true,
    probe: () => Promise.resolve(ok({ kind: 'licensed' })),
    readBuild: () => Promise.resolve('26.3.0.39832'),
    killCrossoverWineserver: () => Promise.resolve(undefined),
    readOverride: () => undefined,
    listReadyBridgeBottleNames: () => ['GameLibSteamBridge-1'],
    wineManagerReleases: () => [],
    isPinInstalled: () => true,
    pins: ENGINE_PINS,
    wineManagerRoot: WM_ROOT,
    ...over
  }
}

describe('preflightCrossover (stub deps)', () => {
  it('missing when no CrossOver bin dir', async () => {
    const r = await preflightCrossover(
      'B',
      mkDeps({ resolveCrossoverBinDir: () => Promise.resolve(undefined) })
    )
    expect(r.kind).toBe('missing')
  })
  it('missing when bin/wine is absent', async () => {
    const r = await preflightCrossover('B', mkDeps({ fileExists: () => false }))
    expect(r.kind).toBe('missing')
  })
  it('broken when bin/wine is not executable', async () => {
    const r = await preflightCrossover(
      'B',
      mkDeps({ isExecutable: () => false })
    )
    expect(r).toMatchObject({ kind: 'broken' })
    expect((r as { detail: string }).detail).toContain('not executable')
  })
  it.each([
    ['spawn-error', failed('spawn-error'), 'broken'],
    ['nonzero-exit', failed('nonzero-exit'), 'broken'],
    ['invalid-bottle', failed('invalid-bottle'), 'broken'],
    ['unrecognised', ok({ kind: 'unrecognised' }), 'broken'],
    ['expired', ok({ kind: 'expired', daysAgo: 2 }), 'expired']
  ])(
    'definitive %s demotes on the first probe, no retry',
    async (_n, res, kind) => {
      const probe = seq(res)
      const kill = jest.fn(() => Promise.resolve(undefined))
      const r = await preflightCrossover(
        'B',
        mkDeps({ probe, killCrossoverWineserver: kill })
      )
      expect(r.kind).toBe(kind)
      expect(probe).toHaveBeenCalledTimes(1)
      expect(kill).toHaveBeenCalledTimes(0)
    }
  )
  it('timeout then licensed is healthy', async () => {
    const probe = seq(failed('timeout'), ok({ kind: 'licensed' }))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'B',
      mkDeps({ probe, killCrossoverWineserver: kill })
    )
    expect(r).toMatchObject({ kind: 'healthy', trialDaysRemaining: null })
    expect(probe).toHaveBeenCalledTimes(2)
    expect(kill).toHaveBeenCalledTimes(1)
    expect(kill).toHaveBeenCalledWith('B', CX_BIN)
  })
  it('timeout then trial is healthy', async () => {
    const r = await preflightCrossover(
      'B',
      mkDeps({
        probe: seq(failed('timeout'), ok({ kind: 'trial', daysRemaining: 5 }))
      })
    )
    expect(r).toMatchObject({ kind: 'healthy', trialDaysRemaining: 5 })
  })
  it('timeout then expired still demotes', async () => {
    const r = await preflightCrossover(
      'B',
      mkDeps({
        probe: seq(failed('timeout'), ok({ kind: 'expired', daysAgo: 2 }))
      })
    )
    expect(r).toMatchObject({ kind: 'expired', daysAgo: 2 })
  })
  it('timeout then nonzero-exit is broken', async () => {
    const probe = seq(failed('timeout'), failed('nonzero-exit'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'B',
      mkDeps({ probe, killCrossoverWineserver: kill })
    )
    expect(r.kind).toBe('broken')
    expect((r as { detail: string }).detail).toContain('nonzero-exit')
    expect(probe).toHaveBeenCalledTimes(2)
    expect(kill).toHaveBeenCalledTimes(1)
  })
  it('timeout then timeout is broken, wineserver stopped after each', async () => {
    const probe = seq(failed('timeout'), failed('timeout'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'B',
      mkDeps({ probe, killCrossoverWineserver: kill })
    )
    expect(r.kind).toBe('broken')
    const detail = (r as { detail: string }).detail
    expect(detail).toContain('timeout')
    expect(detail).toContain('2')
    expect(probe).toHaveBeenCalledTimes(2)
    expect(kill).toHaveBeenCalledTimes(2)
  })
  it('licensed and trial are healthy', async () => {
    expect(await preflightCrossover('B', mkDeps())).toMatchObject({
      kind: 'healthy',
      trialDaysRemaining: null
    })
    const t = await preflightCrossover(
      'B',
      mkDeps({
        probe: () => Promise.resolve(ok({ kind: 'trial', daysRemaining: 5 }))
      })
    )
    expect(t).toMatchObject({ kind: 'healthy', trialDaysRemaining: 5 })
  })
})

describe('preflightCrossover (real probe, stub wine)', () => {
  let profile: ReturnType<typeof createFakeHomeProfile>
  let binDir: string
  beforeEach(() => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-engdecision-' })
    binDir = join(profile.root, 'bin')
    mkdirSync(binDir, { recursive: true })
    const dest = join(binDir, 'wine')
    copyFileSync(join(__dirname, 'fixtures', 'stub-wine.sh'), dest)
    chmodSync(dest, 0o755)
  })
  afterEach(() => profile.dispose())

  const real = (mode: string): Partial<EngineDecisionDeps> => {
    const stubState = join(profile.root, 'hang-once.state')
    const base = mkDeps()
    delete base.probe
    delete base.isExecutable
    delete base.fileExists
    return {
      ...base,
      resolveCrossoverBinDir: () => Promise.resolve(binDir),
      readBuild: () => Promise.resolve(null),
      probeEnv: profile.childEnv({
        ...process.env,
        STUB_MODE: mode,
        STUB_STATE: stubState
      }),
      probeTimeoutMs: 500
    }
  }

  it.each([
    ['licensed', { kind: 'healthy', trialDaysRemaining: null }, 0],
    ['trial', { kind: 'healthy', trialDaysRemaining: 12 }, 0],
    ['expired', { kind: 'expired', daysAgo: 3 }, 0],
    ['garbage', { kind: 'broken' }, 0],
    ['hang', { kind: 'broken' }, 2],
    ['hang-once', { kind: 'healthy', trialDaysRemaining: null }, 1],
    ['fail', { kind: 'broken' }, 0]
  ])('maps stub mode %s', async (mode, expected, kills) => {
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover('Steam', {
      ...real(mode),
      killCrossoverWineserver: kill
    })
    expect(r).toMatchObject(expected)
    expect(kill).toHaveBeenCalledTimes(kills)
  })
})

describe('decideLaunchEngine', () => {
  const args = { appId: '1', bottleName: 'GameLibSteamBridge-1' }

  it('healthy -> crossover cx-healthy', async () => {
    const r = await decideLaunchEngine(args, mkDeps())
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-healthy' },
      needsDownload: false
    })
  })
  it.each([
    [
      'missing',
      { resolveCrossoverBinDir: () => Promise.resolve(undefined) },
      'cx-missing'
    ],
    [
      'expired',
      { probe: () => Promise.resolve(ok({ kind: 'expired', daysAgo: 1 })) },
      'cx-expired'
    ],
    ['broken', { isExecutable: () => false }, 'cx-broken']
  ])('%s -> pinned %s', async (_n, over, reason) => {
    const r = await decideLaunchEngine(args, mkDeps(over))
    expect(r).toMatchObject({
      kind: 'use',
      selection: {
        kind: 'pinned',
        reason,
        pinId: ENGINE_PINS.current.id
      }
    })
  })
  it('one timeout then licensed stays on CrossOver (no pinned selection)', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ probe: seq(failed('timeout'), ok({ kind: 'licensed' })) })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-healthy' },
      needsDownload: false
    })
  })
  it('two timeouts -> pinned cx-broken', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ probe: seq(failed('timeout'), failed('timeout')) })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: {
        kind: 'pinned',
        reason: 'cx-broken',
        pinId: ENGINE_PINS.current.id
      }
    })
  })
  it('expired demotes on a single probe (trial-expiry guard)', async () => {
    const probe = seq(ok({ kind: 'expired', daysAgo: 1 }))
    const r = await decideLaunchEngine(args, mkDeps({ probe }))
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'pinned', reason: 'cx-expired' }
    })
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('needsDownload mirrors pin installation', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        resolveCrossoverBinDir: () => Promise.resolve(undefined),
        isPinInstalled: () => false
      })
    )
    expect(r).toMatchObject({ kind: 'use', needsDownload: true })
  })
  it('stores nothing: expired then licensed gives pinned then crossover', async () => {
    let status: 'expired' | 'licensed' = 'expired'
    const deps = mkDeps({
      probe: () =>
        Promise.resolve(
          status === 'expired'
            ? ok({ kind: 'expired', daysAgo: 1 })
            : ok({ kind: 'licensed' })
        )
    })
    const a = await decideLaunchEngine(args, deps)
    status = 'licensed'
    const b = await decideLaunchEngine(args, deps)
    expect(a).toMatchObject({ selection: { kind: 'pinned' } })
    expect(b).toMatchObject({ selection: { kind: 'crossover' } })
  })
  it('crossover override with CrossOver missing is unavailable', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        readOverride: () => 'crossover',
        resolveCrossoverBinDir: () => Promise.resolve(undefined)
      })
    )
    expect(r.kind).toBe('unavailable')
  })
  it('crossover override with CrossOver expired is honoured', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        readOverride: () => 'crossover',
        probe: () => Promise.resolve(ok({ kind: 'expired', daysAgo: 1 }))
      })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'override' }
    })
  })
  it('pinned override needs no probe', async () => {
    const probe = jest.fn(() => Promise.resolve(ok({ kind: 'licensed' })))
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        readOverride: () => `pinned:${ENGINE_PINS.current.id}`,
        probe
      })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'pinned', reason: 'override' }
    })
    expect(probe).not.toHaveBeenCalled()
  })
  it.each(['/usr/bin/wine', 'garbage', 42])(
    'override %j parses to automatic',
    async (raw) => {
      const r = await decideLaunchEngine(
        args,
        mkDeps({ readOverride: () => raw })
      )
      expect(r).toMatchObject({ kind: 'use', override: 'automatic' })
    }
  )
  describe('wine-manager override', () => {
    const rel = (v: string, installed = true) => ({
      version: v,
      type: 'Wine-Staging-macOS',
      isInstalled: installed,
      installDir: `${WM_ROOT}/${v}`
    })
    it('installed build is used', async () => {
      const r = await decideLaunchEngine(
        args,
        mkDeps({
          readOverride: () => 'wine-manager:Wine-Staging-macOS-11.18',
          wineManagerReleases: () => [rel('Wine-Staging-macOS-11.18')]
        })
      )
      expect(r).toMatchObject({
        kind: 'use',
        selection: { kind: 'wine-manager', reason: 'override' }
      })
      if (r.kind === 'use' && r.selection.kind === 'wine-manager') {
        expect(r.selection.wineBin.startsWith(`${WM_ROOT}/`)).toBe(true)
      }
    })
    it('not installed is unavailable', async () => {
      const r = await decideLaunchEngine(
        args,
        mkDeps({
          readOverride: () => 'wine-manager:Wine-Staging-macOS-11.18',
          wineManagerReleases: () => [rel('Wine-Staging-macOS-11.18', false)]
        })
      )
      expect(r.kind).toBe('unavailable')
    })
    it('never returns a -DXMT entry', () => {
      expect(
        resolveWineManagerStaging(
          'Wine-Staging-macOS-11.18-DXMT',
          mkDeps({
            wineManagerReleases: () => [rel('Wine-Staging-macOS-11.18-DXMT')]
          })
        )
      ).toBeNull()
    })
    it('rejects an install dir outside the tools root', () => {
      expect(
        resolveWineManagerStaging(
          'V',
          mkDeps({
            wineManagerReleases: () => [
              {
                version: 'V',
                type: 'Wine-Staging-macOS',
                isInstalled: true,
                installDir: '/elsewhere/V'
              }
            ]
          })
        )
      ).toBeNull()
    })
  })
  it('logLines carry the engine label and the untested-build line', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ readBuild: () => Promise.resolve('99.0.0.1') })
    )
    expect(r.kind).toBe('use')
    if (r.kind === 'use') {
      expect(r.logLines[0]).toContain('engine=crossover')
      expect(r.logLines.join('\n')).toContain('99.0.0.1 is untested')
    }
  })
})

describe('decideCreationEngine', () => {
  it('CrossOver missing -> pinned cx-missing', async () => {
    const r = await decideCreationEngine(
      { appId: '1' },
      mkDeps({ resolveCrossoverBinDir: () => Promise.resolve(undefined) })
    )
    expect(r).toMatchObject({ kind: 'pinned', reason: 'cx-missing' })
  })
  it('expired ready bottle -> pinned cx-expired', async () => {
    const r = await decideCreationEngine(
      { appId: '1' },
      mkDeps({
        probe: () => Promise.resolve(ok({ kind: 'expired', daysAgo: 1 }))
      })
    )
    expect(r).toMatchObject({ kind: 'pinned', reason: 'cx-expired' })
  })
  it('broken -> pinned cx-broken', async () => {
    const r = await decideCreationEngine(
      { appId: '1' },
      mkDeps({ probe: () => Promise.resolve(ok({ kind: 'unrecognised' })) })
    )
    expect(r).toMatchObject({ kind: 'pinned', reason: 'cx-broken' })
  })
  it('one timeout then licensed -> crossover probed', async () => {
    const r = await decideCreationEngine(
      { appId: '1' },
      mkDeps({ probe: seq(failed('timeout'), ok({ kind: 'licensed' })) })
    )
    expect(r).toMatchObject({ kind: 'crossover', probed: true })
  })
  it('two timeouts -> pinned cx-broken', async () => {
    const r = await decideCreationEngine(
      { appId: '1' },
      mkDeps({ probe: seq(failed('timeout'), failed('timeout')) })
    )
    expect(r).toMatchObject({ kind: 'pinned', reason: 'cx-broken' })
  })
  it('healthy -> crossover with the create cap', async () => {
    const r = await decideCreationEngine({ appId: '1' }, mkDeps())
    expect(r).toMatchObject({
      kind: 'crossover',
      createTimeoutMs: CX_CREATE_CAP_MS,
      probed: true
    })
  })
  it('no ready bottle -> crossover, capped, never probed', async () => {
    const probe = jest.fn(() => Promise.resolve(ok({ kind: 'licensed' })))
    const r = await decideCreationEngine(
      { appId: '1' },
      mkDeps({ listReadyBridgeBottleNames: () => [], probe })
    )
    expect(r).toMatchObject({
      kind: 'crossover',
      createTimeoutMs: CX_CREATE_CAP_MS,
      probed: false
    })
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('listEngineOverrideOptions', () => {
  it('orders options and round-trips ids', async () => {
    const opts = await listEngineOverrideOptions(
      mkDeps({
        wineManagerReleases: () => [
          {
            version: 'Wine-Staging-macOS-11.18',
            type: 'Wine-Staging-macOS',
            isInstalled: true,
            installDir: `${WM_ROOT}/a`
          },
          {
            version: 'Wine-Staging-macOS-11.18-DXMT',
            type: 'Wine-Staging-macOS',
            isInstalled: true,
            installDir: `${WM_ROOT}/b`
          },
          {
            version: 'Wine-Staging-macOS-11.19',
            type: 'Wine-Staging-macOS',
            isInstalled: false,
            installDir: `${WM_ROOT}/c`
          }
        ]
      })
    )
    expect(opts.map((o) => o.kind)).toEqual([
      'automatic',
      'crossover',
      'pinned',
      'wine-manager'
    ])
    expect(opts[1].available).toBe(true)
    for (const o of opts) expect(parseEngineOverride(o.id)).toBe(o.id)
  })
  it('lists the previous pin when present', async () => {
    const opts = await listEngineOverrideOptions(
      mkDeps({
        pins: {
          current: ENGINE_PINS.current,
          previous: { ...ENGINE_PINS.current, id: ENGINE_PINS.current.id }
        }
      })
    )
    expect(opts.filter((o) => o.kind === 'pinned')).toHaveLength(2)
    expect(opts.find((o) => o.isPreviousPin)).toBeDefined()
  })
})
