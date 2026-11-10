import { chmodSync, copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  CX_CREATE_CAP_MS,
  decideCreationEngine,
  decideLaunchEngine,
  isCrossoverMissing,
  killCrossoverWineserverWith,
  listEngineOverrideOptions,
  preflightCrossover,
  resolveWineManagerStaging
} from '../engineDecision'
import type { EngineDecisionDeps, KillDeps } from '../engineDecision'
import { ENGINE_PINS } from '../enginePins'
import { parseEngineOverride } from '../engineIds'
import type { DemoStatus, DemoStatusProbe } from '../demoStatus'
import { defined } from './defined'

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
    Promise.resolve(
      defined(results[Math.min(i++, results.length - 1)], 'seq() probe result')
    )
  )
}

const rel = (v: string, installed = true) => ({
  version: v,
  type: 'Wine-Staging-macOS',
  isInstalled: installed,
  installDir: `${WM_ROOT}/${v}`
})

function mkDeps(
  over: Partial<EngineDecisionDeps> = {}
): Partial<EngineDecisionDeps> & KillDeps {
  return {
    resolveCrossoverBinDir: () => Promise.resolve(CX_BIN),
    isExecutable: () => true,
    fileExists: () => true,
    probe: () => Promise.resolve(ok({ kind: 'licensed' })),
    retrySettleMs: 0,
    readBuild: () => Promise.resolve('26.3.0.39832'),
    killCrossoverWineserver: () => Promise.resolve(undefined),
    readOverride: () => undefined,
    monitorPhase: () => null,
    bottleBusy: () => false,
    markerSummary: () => null,
    wineManagerReleases: () => [],
    isPinInstalled: () => true,
    pins: ENGINE_PINS,
    wineManagerRoot: WM_ROOT,
    ...over
  }
}

describe('isCrossoverMissing (G25)', () => {
  const run = async (over: Partial<EngineDecisionDeps>) => {
    const probe = jest.fn(() => Promise.resolve(ok({ kind: 'licensed' })))
    const readBuild = jest.fn(() => Promise.resolve('1'))
    const r = await isCrossoverMissing(mkDeps({ probe, readBuild, ...over }))
    expect(probe).not.toHaveBeenCalled()
    expect(readBuild).not.toHaveBeenCalled()
    return r
  }
  it('G25: missing when no CrossOver bin dir', async () => {
    expect(
      await run({ resolveCrossoverBinDir: () => Promise.resolve(undefined) })
    ).toBe(true)
  })
  it('G25: missing when bin/wine is absent', async () => {
    expect(await run({ fileExists: () => false })).toBe(true)
  })
  it('G25: present when wine exists, even if not executable', async () => {
    expect(await run({ isExecutable: () => false })).toBe(false)
    expect(await run({})).toBe(false)
  })
  it('G25: a resolver error is unknown, not missing', async () => {
    expect(
      await run({
        resolveCrossoverBinDir: () => Promise.reject(new Error('x'))
      })
    ).toBe(false)
  })
})

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
  it.each(['nonzero-exit', 'spawn-error'] as const)(
    'G29: %s then licensed is healthy, one stop before the retry',
    async (reason) => {
      const probe = seq(failed(reason), ok({ kind: 'licensed' }))
      const kill = jest.fn(() => Promise.resolve(undefined))
      const r = await preflightCrossover(
        'B',
        mkDeps({ probe, killCrossoverWineserver: kill })
      )
      expect(r).toMatchObject({ kind: 'healthy' })
      expect(probe).toHaveBeenCalledTimes(2)
      expect(kill).toHaveBeenCalledTimes(1)
    }
  )
  it('G29: nonzero-exit twice is broken, not inconclusive', async () => {
    const probe = seq(failed('nonzero-exit'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'B',
      mkDeps({ probe, killCrossoverWineserver: kill })
    )
    expect(r).toMatchObject({ kind: 'broken' })
    expect((r as { inconclusive?: boolean }).inconclusive).toBeUndefined()
    expect((r as { detail: string }).detail).toContain('nonzero-exit')
    expect((r as { detail: string }).detail).toContain('2 consecutive attempts')
    expect(probe).toHaveBeenCalledTimes(2)
    expect(kill).toHaveBeenCalledTimes(1)
  })
  it('G29: a no-kill reason retries without a stop', async () => {
    for (const mode of ['running', 'page'] as const) {
      const probe = seq(failed('nonzero-exit'), ok({ kind: 'licensed' }))
      const kill = jest.fn(() => Promise.resolve(undefined))
      const r = await preflightCrossover(
        'B',
        mkDeps({
          probe,
          killCrossoverWineserver: kill,
          monitorPhase: () => (mode === 'running' ? 'running' : null)
        }),
        mode === 'running'
          ? { killOnTimeout: true, key: '1' }
          : { killOnTimeout: false }
      )
      expect(r).toMatchObject({ kind: 'healthy' })
      expect(probe).toHaveBeenCalledTimes(2)
      expect(kill).toHaveBeenCalledTimes(0)
    }
  })
  it('G29: timeout then nonzero-exit is broken after two probes', async () => {
    const probe = seq(failed('timeout'), failed('nonzero-exit'))
    const r = await preflightCrossover('B', mkDeps({ probe }))
    expect(r).toMatchObject({ kind: 'broken' })
    expect(probe).toHaveBeenCalledTimes(2)
  })
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
    ['fail', { kind: 'broken' }, 1]
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
  const args = { key: '1', bottleName: 'GameLibSteamBridge-1' }

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
  it('G29: one nonzero-exit then licensed stays on CrossOver', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ probe: seq(failed('nonzero-exit'), ok({ kind: 'licensed' })) })
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
      { key: '1' },
      mkDeps({ resolveCrossoverBinDir: () => Promise.resolve(undefined) })
    )
    expect(r).toMatchObject({ kind: 'pinned', reason: 'cx-missing' })
  })
  it('bin dir without bin/wine -> pinned cx-missing', async () => {
    const r = await decideCreationEngine(
      { key: '1' },
      mkDeps({ fileExists: () => false })
    )
    expect(r).toMatchObject({ kind: 'pinned', reason: 'cx-missing' })
  })
  it('non-executable wine -> pinned cx-broken', async () => {
    const r = await decideCreationEngine(
      { key: '1' },
      mkDeps({ isExecutable: () => false })
    )
    expect(r).toMatchObject({ kind: 'pinned', reason: 'cx-broken' })
  })
  it('executable wine -> crossover, unprobed, with the create cap; no foreign probe', async () => {
    const probe = jest.fn(() => Promise.resolve(ok({ kind: 'licensed' })))
    const r = await decideCreationEngine({ key: '1' }, mkDeps({ probe }))
    expect(r).toMatchObject({
      kind: 'crossover',
      createTimeoutMs: CX_CREATE_CAP_MS,
      probed: false
    })
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('preflightCrossover passive reads (WR-07)', () => {
  it('killOnTimeout:false never kills, probes once, returns inconclusive', async () => {
    const probe = seq(failed('timeout'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'B',
      mkDeps({ probe, killCrossoverWineserver: kill }),
      { killOnTimeout: false }
    )
    expect(r).toMatchObject({ kind: 'broken', inconclusive: true })
    expect(kill).not.toHaveBeenCalled()
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('an active monitor skips the kill and the retry', async () => {
    const probe = seq(failed('timeout'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'B',
      mkDeps({
        probe,
        killCrossoverWineserver: kill,
        monitorPhase: () => 'running'
      }),
      { key: '1' }
    )
    expect(r).toMatchObject({ kind: 'broken', inconclusive: true })
    expect(kill).not.toHaveBeenCalled()
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('no monitor keeps kill-and-retry (regression guard)', async () => {
    const probe = seq(failed('timeout'), failed('timeout'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'B',
      mkDeps({ probe, killCrossoverWineserver: kill }),
      { key: '1' }
    )
    expect(r).toMatchObject({ kind: 'broken' })
    expect((r as { inconclusive?: boolean }).inconclusive).toBeUndefined()
    expect(kill).toHaveBeenCalled()
    expect(probe).toHaveBeenCalledTimes(2)
  })
  it('decideLaunchEngine passes its key so the monitor check applies', async () => {
    const monitorPhase = jest.fn(() => 'running' as const)
    const kill = jest.fn(() => Promise.resolve(undefined))
    await decideLaunchEngine(
      { key: '77', bottleName: 'B' },
      mkDeps({
        probe: seq(failed('timeout')),
        killCrossoverWineserver: kill,
        monitorPhase
      })
    )
    expect(monitorPhase).toHaveBeenCalledWith('77')
    expect(kill).not.toHaveBeenCalled()
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
    expect(defined(opts[1], 'opts[1]').available).toBe(true)
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
  it('another game running in the bottle skips the kill and the retry (D-16)', async () => {
    const probe = seq(failed('timeout'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const bottleBusy = jest.fn(() => true)
    const r = await preflightCrossover(
      'B',
      mkDeps({ probe, killCrossoverWineserver: kill, bottleBusy }),
      { key: 'gog:9' }
    )
    expect(r).toMatchObject({ kind: 'broken', inconclusive: true })
    expect(bottleBusy).toHaveBeenCalledWith('B', 'gog:9')
    expect(kill).not.toHaveBeenCalled()
  })
})

describe('inconclusive pre-flight never falls back (CR-01, D-05)', () => {
  const args = { key: '1', bottleName: 'Windows 10 Games' }

  it('invalid-bottle is inconclusive: one probe, no wineserver kill', async () => {
    const probe = seq(failed('invalid-bottle'))
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await preflightCrossover(
      'Windows 10 Games',
      mkDeps({ probe, killCrossoverWineserver: kill })
    )
    expect(r).toMatchObject({ kind: 'broken', inconclusive: true })
    expect(probe).toHaveBeenCalledTimes(1)
    expect(kill).not.toHaveBeenCalled()
  })
  it('Automatic + invalid-bottle launches on CrossOver, not cx-broken', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ probe: seq(failed('invalid-bottle')) })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-inconclusive' },
      needsDownload: false
    })
    if (r.kind !== 'use') throw new Error('expected use')
    if (r.selection.kind !== 'crossover') throw new Error('expected crossover')
    expect(r.selection.binDir).toBeTruthy()
    expect(r.logLines.join('\n')).toContain('inconclusive')
    expect(r.logLines.join('\n')).toContain('reason=cx-inconclusive')
    expect(r.logLines.join('\n')).not.toContain('reason=cx-healthy')
  })
  it('forced CrossOver + invalid-bottle is usable, reason override', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        readOverride: () => 'crossover',
        probe: seq(failed('invalid-bottle'))
      })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'override' }
    })
  })
  it('Automatic + busy-bottle timeout stays on CrossOver', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ probe: seq(failed('timeout')), bottleBusy: () => true })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-inconclusive' }
    })
  })
  const busyNonCx = (
    a: { key: string; bottleName: string },
    pinId: string | null | Record<string, unknown>,
    over: Partial<EngineDecisionDeps> = {}
  ) =>
    decideLaunchEngine(
      a,
      mkDeps({
        probe: seq(failed('timeout')),
        bottleBusy: () => true,
        markerSummary: () =>
          typeof pinId === 'object' && pinId !== null
            ? ({ kind: 'non-crossover', ...pinId } as ReturnType<
                NonNullable<EngineDecisionDeps['markerSummary']>
              >)
            : { kind: 'non-crossover', pinId },
        ...over
      })
    )
  it('Automatic + invalid-bottle + crossover marker stays on CrossOver, cx-inconclusive', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        probe: seq(failed('invalid-bottle')),
        markerSummary: () => ({ kind: 'crossover', pinId: null })
      })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-inconclusive' }
    })
  })
  it('forced CrossOver + invalid-bottle ignores a non-crossover marker', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        readOverride: () => 'crossover',
        probe: seq(failed('invalid-bottle')),
        markerSummary: () => ({ kind: 'non-crossover', pinId: 'x' })
      })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'override' }
    })
  })
  it('Automatic + busy-bottle timeout + crossover marker stays on CrossOver', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({
        probe: seq(failed('timeout')),
        bottleBusy: () => true,
        markerSummary: () => ({ kind: 'crossover', pinId: null })
      })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-inconclusive' }
    })
  })
  it('WR-01 Steam: busy bottle with a non-crossover marker is not forced onto CrossOver', async () => {
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await busyNonCx(
      { key: '1', bottleName: 'GameLibSteamBridge-1' },
      ENGINE_PINS.current.id,
      { killCrossoverWineserver: kill }
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: {
        kind: 'pinned',
        pinId: ENGINE_PINS.current.id,
        reason: 'cx-inconclusive'
      },
      needsDownload: false
    })
    expect(kill).not.toHaveBeenCalled()
    if (r.kind !== 'use') throw new Error('expected use')
    expect(r.logLines.join('\n')).toContain('reason=cx-inconclusive')
    expect(r.logLines.join('\n')).not.toContain('reason=cx-healthy')
  })
  it('WR-01 non-Steam: busy bottle with a non-crossover marker is not forced onto CrossOver', async () => {
    const r = await busyNonCx(
      { key: 'legendary:Quail', bottleName: 'GameLib-legendary-Quail' },
      ENGINE_PINS.current.id
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: {
        kind: 'pinned',
        pinId: ENGINE_PINS.current.id,
        reason: 'cx-inconclusive'
      }
    })
  })
  it('a marker on the previous pin keeps the previous pin', async () => {
    const prev = { ...ENGINE_PINS.current, id: 'prev-pin-test' }
    const r = await busyNonCx(args, 'prev-pin-test', {
      pins: { current: ENGINE_PINS.current, previous: prev }
    })
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'pinned', pinId: 'prev-pin-test' }
    })
  })
  it('a non-crossover marker with no resolvable engine takes the CrossOver branch (WR-01 re-review)', async () => {
    const r = await busyNonCx(args, null)
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-inconclusive' }
    })
  })
  const WM = 'Wine-Staging-macOS-11.18'
  const RETIRED_WS =
    '/tools/steam-engines/wine-staging-retired/Contents/Resources/wine/bin/wineserver'
  const wmSummary = {
    pinId: null,
    wineManagerVersion: WM,
    pinWineserverBin: null
  }
  const retiredSummary = {
    pinId: 'wine-staging-retired',
    wineManagerVersion: null,
    pinWineserverBin: RETIRED_WS
  }
  it('WR-01 re-review Steam: wine-manager marker keeps its Wine Manager build', async () => {
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await busyNonCx(
      { key: '1', bottleName: 'GameLibSteamBridge-1' },
      wmSummary,
      { wineManagerReleases: () => [rel(WM)], killCrossoverWineserver: kill }
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: {
        kind: 'wine-manager',
        managerVersion: WM,
        reason: 'cx-inconclusive'
      },
      needsDownload: false
    })
    expect(kill).not.toHaveBeenCalled()
    if (r.kind !== 'use') throw new Error('expected use')
    expect(r.logLines.join('\n')).toContain('reason=cx-inconclusive')
    expect(r.logLines.join('\n')).not.toContain('reason=cx-healthy')
  })
  it('WR-01 re-review non-Steam: wine-manager marker keeps its Wine Manager build', async () => {
    const r = await decideLaunchEngine(
      { key: 'legendary:Quail', bottleName: 'GameLib-legendary-Quail' },
      mkDeps({
        probe: seq(failed('invalid-bottle')),
        markerSummary: () => ({ kind: 'non-crossover', ...wmSummary }),
        wineManagerReleases: () => [rel(WM)]
      })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: {
        kind: 'wine-manager',
        managerVersion: WM,
        reason: 'cx-inconclusive'
      },
      needsDownload: false
    })
  })
  it('WR-01 re-review: retired pin id keeps its recorded engine', async () => {
    const kill = jest.fn(() => Promise.resolve(undefined))
    const r = await busyNonCx(
      { key: '1', bottleName: 'GameLibSteamBridge-1' },
      retiredSummary,
      { killCrossoverWineserver: kill }
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: {
        kind: 'pinned',
        pinId: 'wine-staging-retired',
        reason: 'cx-inconclusive',
        wineserverBin: RETIRED_WS,
        wineBin: RETIRED_WS.replace(/wineserver$/, 'wine')
      },
      needsDownload: false
    })
    expect(kill).not.toHaveBeenCalled()
    const r2 = await busyNonCx(
      { key: 'legendary:Quail', bottleName: 'GameLib-legendary-Quail' },
      retiredSummary
    )
    expect(r2).toMatchObject({
      kind: 'use',
      selection: { kind: 'pinned', pinId: 'wine-staging-retired' }
    })
  })
  it('WR-01 re-review: uninstalled wine-manager build takes the CrossOver branch, not pins.current', async () => {
    const r = await busyNonCx(args, wmSummary, {
      wineManagerReleases: () => [rel(WM, false)]
    })
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-inconclusive' }
    })
  })
  it('WR-01 re-review: pruned retired pin takes the CrossOver branch', async () => {
    const r = await busyNonCx(args, retiredSummary, {
      fileExists: (p) => !p.startsWith('/tools/steam-engines/')
    })
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'cx-inconclusive' }
    })
  })
  it('WR-01 re-review: forced CrossOver ignores a wine-manager marker', async () => {
    const r = await busyNonCx(args, wmSummary, {
      readOverride: () => 'crossover',
      wineManagerReleases: () => [rel(WM)]
    })
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover', reason: 'override' }
    })
  })
  it('pinned-inconclusive with the pin not installed needs a download', async () => {
    const r = await busyNonCx(args, ENGINE_PINS.current.id, {
      isPinInstalled: () => false
    })
    expect(r).toMatchObject({
      kind: 'use',
      needsDownload: true,
      pin: { id: ENGINE_PINS.current.id }
    })
  })
  it('regression: nonzero-exit twice still falls back as cx-broken', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ probe: seq(failed('nonzero-exit'), failed('nonzero-exit')) })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'pinned', reason: 'cx-broken' }
    })
  })
  it('regression: missing CrossOver still falls back as cx-missing', async () => {
    const r = await decideLaunchEngine(
      args,
      mkDeps({ resolveCrossoverBinDir: () => Promise.resolve(undefined) })
    )
    expect(r).toMatchObject({
      kind: 'use',
      selection: { kind: 'pinned', reason: 'cx-missing' }
    })
  })
})

describe('killCrossoverWineserverWith (66.1-22e)', () => {
  it('stops the bottle wineserver through the injected spawnAsync with CX_ROOT and the 15 s cap', async () => {
    const spawnAsync = jest.fn(() =>
      Promise.resolve({ code: 0, stdout: '', stderr: '' })
    )
    await killCrossoverWineserverWith({
      spawnAsync: spawnAsync as unknown as Parameters<
        typeof killCrossoverWineserverWith
      >[0]['spawnAsync']
    })('GameLibBottle', CX_BIN)
    expect(spawnAsync).toHaveBeenCalledTimes(1)
    const [bin, args, opts] = spawnAsync.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string>; timeout: number }
    ]
    expect(bin).toBe(join(CX_BIN, 'wineserver'))
    expect(args).toEqual(['-k'])
    expect(opts.env.CX_ROOT).toBe(join(CX_BIN, '..'))
    expect(opts.timeout).toBe(15_000)
  })
})
