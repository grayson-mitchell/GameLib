import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getDefaultEngine,
  getGameEngineState,
  getPerGameBottleNameFor,
  listGameEngineOptions
} from '../gameEngineState'
import type { GameEngineStateDeps } from '../gameEngineState'
import { ENGINE_PINS } from '../enginePins'
import type { CrossoverPreflight } from '../engineDecision'
import type { EngineConfigDeps } from '../engineConfig'
import { defined } from './defined'
import {
  createTestEngineServices,
  createTestServices
} from 'backend/testUtils/testServices'
import { createTestEngineState } from 'backend/testUtils/testEngineState'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

const baseServices = createTestEngineServices()
const services = {
  spawnAsync: createTestServices().spawnAsync,
  paths: baseServices.paths,
  engineRuntime: baseServices.engineRuntime,
  runner: createScriptedRunner([]),
  wineManagerReleases: () => [],
  globalSettings: () => global,
  // A fresh owner per test (beforeEach): no state crosses a test.
  engineState: createTestEngineState()
}

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const CROSSOVER = { type: 'crossover', name: 'CrossOver', bin: '/cx/wine' }
const GPTK = {
  type: 'toolkit',
  name: 'Game-Porting-Toolkit-2',
  bin: '/gptk/wine64'
}
const PLAIN_WINE = { type: 'wine', name: 'Odd Wine', bin: '/odd/bin/wine' }

let dir: string
let global: Record<string, unknown>
const preflight = jest.fn<Promise<CrossoverPreflight>, [string]>()

function writeGame(runner: string, appName: string, entry: object) {
  writeFileSync(
    join(dir, `${appName}.json`),
    JSON.stringify({ version: 'v0', explicit: true, [appName]: entry })
  )
  void runner
}

const config = (): Partial<EngineConfigDeps> => ({
  gamesConfigPath: dir,
  globalSettings: () => global,
  wineManagerReleases: () => []
})

const deps = (o: Partial<GameEngineStateDeps> = {}): GameEngineStateDeps => ({
  isMac: true,
  config: config(),
  store: {
    get: (_k: string, d: unknown) => d,
    set: jest.fn()
  } as never,
  resolveCrossoverBinDir: () => Promise.resolve('/cx/bin'),
  isBottleReady: () => true,
  preflight,
  now: () => 1000,
  ...o
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gameEngineState-'))
  global = { wineVersion: CROSSOVER, wineCrossoverBottle: 'GameLib' }
  preflight.mockReset()
  preflight.mockResolvedValue({
    kind: 'healthy',
    trialDaysRemaining: null,
    build: '24.0.0.1'
  } as CrossoverPreflight)
  services.engineState = createTestEngineState()
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('getGameEngineState', () => {
  it('derives automatic CrossOver on a bottle for a legendary game', async () => {
    writeGame('legendary', 'abc', {
      wineVersion: CROSSOVER,
      wineCrossoverBottle: 'GameLib'
    })
    const s = await getGameEngineState(
      services,
      { runner: 'legendary', appName: 'abc' },
      deps()
    )
    expect(s).toMatchObject({
      runner: 'legendary',
      appName: 'abc',
      engine: 'crossover',
      prefixKind: 'bottle',
      effectiveEngineId: 'automatic',
      engineSource: 'derived',
      overrideEligible: true
    })
    expect(preflight).toHaveBeenCalledWith('GameLib')
  })

  it('shows the trial notice at 5 days remaining', async () => {
    preflight.mockResolvedValue({
      kind: 'healthy',
      trialDaysRemaining: 5,
      build: '24.0.0.1'
    } as CrossoverPreflight)
    writeGame('legendary', 'abc', {
      wineVersion: CROSSOVER,
      wineCrossoverBottle: 'GameLib'
    })
    const s = await getGameEngineState(
      services,
      { runner: 'legendary', appName: 'abc' },
      deps()
    )
    expect(s?.showTrialNotice).toBe(true)
    expect(s?.trialDaysRemaining).toBe(5)
  })

  it('marks a pinned override on a plain prefix unsupported with no preflight', async () => {
    writeGame('gog', '1207658924', {
      wineVersion: PLAIN_WINE,
      winePrefix: '/p',
      engineOverride: `pinned:${ENGINE_PINS.current.id}`
    })
    const s = await getGameEngineState(
      services,
      { runner: 'gog', appName: '1207658924' },
      deps()
    )
    expect(s).toMatchObject({
      engine: 'unsupported',
      prefixKind: 'plain',
      engineSource: 'stored'
    })
    expect(preflight).not.toHaveBeenCalled()
  })

  it('shows a GPTK game as Legacy with no preflight (D-15)', async () => {
    writeGame('nile', 'amzn1.x', { wineVersion: GPTK, winePrefix: '/p' })
    const s = await getGameEngineState(
      services,
      { runner: 'nile', appName: 'amzn1.x' },
      deps()
    )
    expect(s).toMatchObject({
      effectiveEngineId: 'legacy:Game-Porting-Toolkit-2',
      legacyLabel: 'Game-Porting-Toolkit-2',
      engine: 'unsupported',
      engineLabel: 'Legacy: Game-Porting-Toolkit-2',
      prefixKind: 'legacy'
    })
    expect(preflight).not.toHaveBeenCalled()
  })

  it('answers for a sideload game on a plain wine prefix', async () => {
    global = { wineVersion: PLAIN_WINE, winePrefix: '/pfx' }
    const s = await getGameEngineState(
      services,
      { runner: 'sideload', appName: 'mine' },
      deps()
    )
    expect(s).not.toBeNull()
    expect(s?.prefixKind).toBe('legacy')
    expect(preflight).not.toHaveBeenCalled()
  })

  it('reports the per-game bottle name for a plain-prefix game', async () => {
    writeGame('gog', '1207658924', {
      wineVersion: PLAIN_WINE,
      winePrefix: '/p',
      engineOverride: 'crossover'
    })
    const s = await getGameEngineState(
      services,
      { runner: 'gog', appName: '1207658924' },
      deps({ isBottleReady: () => false })
    )
    // switched to CrossOver from a plain prefix: a fresh, not yet provisioned bottle
    expect(s?.prefixKind).toBe('bottle')
    expect(s?.perGameBottleName).toBe('GameLib-gog-1207658924')
    expect(preflight).not.toHaveBeenCalled()
  })

  it('reports plain with the per-game name when staying on a plain prefix', async () => {
    writeGame('gog', '1207658924', {
      wineVersion: PLAIN_WINE,
      winePrefix: '/p',
      engineOverride: `pinned:${ENGINE_PINS.current.id}`
    })
    const s = await getGameEngineState(
      services,
      { runner: 'gog', appName: '1207658924' },
      deps()
    )
    expect(s?.perGameBottleName).toBe('GameLib-gog-1207658924')
  })

  it('returns null off macOS, for a bad identity and for Steam', async () => {
    const id = { runner: 'legendary', appName: 'abc' }
    expect(
      await getGameEngineState(services, id, deps({ isMac: false }))
    ).toBeNull()
    expect(await getGameEngineState(services, null, deps())).toBeNull()
    expect(
      await getGameEngineState(
        services,
        { runner: 'legendary', appName: '../x' },
        deps()
      )
    ).toBeNull()
    expect(
      await getGameEngineState(
        services,
        { runner: 'nope', appName: 'a' },
        deps()
      )
    ).toBeNull()
    expect(
      await getGameEngineState(
        services,
        { runner: 'steam', appName: '220' },
        deps()
      )
    ).toBeNull()
  })

  it('never creates a GamesConfig file', async () => {
    mkdirSync(join(dir, 'sub'))
    const before = readdirSync(dir).sort()
    await getGameEngineState(
      services,
      { runner: 'legendary', appName: 'fresh' },
      deps()
    )
    expect(readdirSync(dir).sort()).toEqual(before)
  })
})

describe('listGameEngineOptions', () => {
  const decision = {
    resolveCrossoverBinDir: () => Promise.resolve('/cx/bin'),
    isPinInstalled: () => true,
    wineManagerReleases: () => [
      {
        version: 'Wine-Staging-9.1',
        type: 'Wine-Staging-macOS',
        isInstalled: true,
        installDir: '/wm/a'
      },
      {
        version: 'GPTK-DXMT',
        type: 'Wine-Staging-macOS',
        isInstalled: true,
        installDir: '/wm/b'
      }
    ]
  }

  it('returns the plain list for a non-legacy game', async () => {
    writeGame('legendary', 'abc', { wineVersion: CROSSOVER })
    const opts = await listGameEngineOptions(
      services,
      { runner: 'legendary', appName: 'abc' },
      { config: config(), decision }
    )
    const ids = opts.map((o) => o.id)
    expect(ids).toContain('automatic')
    expect(ids).toContain('crossover')
    expect(ids).toContain('wine-manager:Wine-Staging-9.1')
    expect(ids.some((i) => i.startsWith('legacy:'))).toBe(false)
  })

  it('appends a read-only Legacy entry last for a legacy game', async () => {
    writeGame('nile', 'amzn1.x', { wineVersion: GPTK })
    const opts = await listGameEngineOptions(
      services,
      { runner: 'nile', appName: 'amzn1.x' },
      { config: config(), decision }
    )
    expect(opts[opts.length - 1]).toEqual({
      id: 'legacy:Game-Porting-Toolkit-2',
      kind: 'legacy',
      label: 'Legacy: Game-Porting-Toolkit-2',
      available: false,
      installed: true,
      isPreviousPin: false
    })
  })

  it('never offers toolkit, gptk, DXMT or path ids', async () => {
    writeGame('legendary', 'abc', { wineVersion: CROSSOVER })
    const opts = await listGameEngineOptions(
      services,
      { runner: 'legendary', appName: 'abc' },
      { config: config(), decision }
    )
    for (const o of opts) {
      expect(o.id).not.toMatch(/toolkit|gptk|-DXMT|\//i)
    }
  })

  it('uses the global engine for the default page', async () => {
    global = { wineVersion: GPTK }
    const opts = await listGameEngineOptions(
      services,
      { appName: 'default' },
      { config: config(), decision }
    )
    expect(defined(opts[opts.length - 1], 'last option').kind).toBe('legacy')
  })

  it('falls back to the plain list for unknown args', async () => {
    const opts = await listGameEngineOptions(services, 42, {
      config: config(),
      decision
    })
    expect(opts.some((o) => o.kind === 'legacy')).toBe(false)
  })
})

describe('getDefaultEngine', () => {
  it('derives automatic from a CrossOver global wine', () => {
    expect(getDefaultEngine(services, config())).toEqual({
      effectiveEngineId: 'automatic',
      engineSource: 'derived',
      legacyLabel: null
    })
  })

  it('reports Legacy for a GPTK global wine', () => {
    global = { wineVersion: GPTK }
    expect(getDefaultEngine(services, config())).toEqual({
      effectiveEngineId: 'legacy:Game-Porting-Toolkit-2',
      engineSource: 'derived',
      legacyLabel: 'Game-Porting-Toolkit-2'
    })
  })

  it('reports a stored pinned global override', () => {
    const id = `pinned:${ENGINE_PINS.current.id}`
    global = { wineVersion: GPTK, engineOverride: id }
    expect(getDefaultEngine(services, config())).toEqual({
      effectiveEngineId: id,
      engineSource: 'stored',
      legacyLabel: null
    })
  })
})

describe('getPerGameBottleNameFor', () => {
  it('names a gog bottle', () => {
    expect(
      getPerGameBottleNameFor({ runner: 'gog', appName: '1207658924' })
    ).toBe('GameLib-gog-1207658924')
  })
  it('returns null for invalid and Steam identities', () => {
    expect(getPerGameBottleNameFor({ runner: 'gog', appName: '../x' })).toBe(
      null
    )
    expect(getPerGameBottleNameFor('x')).toBe(null)
    expect(getPerGameBottleNameFor({ runner: 'steam', appName: '220' })).toBe(
      null
    )
  })
})
