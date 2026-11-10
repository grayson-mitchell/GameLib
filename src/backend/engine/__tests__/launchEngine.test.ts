import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Game } from 'common/types/game_manager'
import type { GameSettings } from 'common/types'

jest.mock('i18next', () => ({
  __esModule: true,
  t: (key: string) => key
}))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))
jest.mock('backend/utils', () => ({
  spawnAsync: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  existsSync: () => true
}))
jest.mock('../engineDecision', () => ({
  decideLaunchEngine: jest.fn(),
  isCrossoverMissing: jest.fn(),
  killCrossoverWineserverWith: jest.fn(() => jest.fn())
}))
jest.mock('../engineDialogs', () => ({
  showEngineDialog: jest.fn(),
  notifyEngineFallback: jest.fn()
}))
jest.mock('../engineState', () => ({ recordLaunchDecision: jest.fn() }))
jest.mock('../engineSwitch', () => ({
  prepareBottleForEngine: jest.fn(),
  switchServicesFrom: jest.fn(() => ({
    killWith: jest.fn(),
    installRemove: jest.fn()
  })),
  readBottleEngineMarkerKind: jest.fn(() => null),
  restoreNeedsAbsentPin: jest.fn(() => false)
}))
jest.mock('../fallbackEngine', () => ({ isPinnedEngineInstalled: jest.fn() }))
jest.mock('../pinnedEngineProgress', () => ({
  ensurePinnedEngineReportingStatus: jest.fn()
}))
jest.mock('../perGameBottle', () => ({
  ensureGameBottle: jest.fn(),
  perGameBottleName: (runner: string, appName: string) =>
    `GameLib-${runner}-${appName}`
}))

import {
  __resetLaunchEngineForTests,
  endEngineLaunch,
  selectEngineForLaunch
} from '../launchEngine'
import type { EngineServices } from '../engineServices'
import { createTestEngineServices } from 'backend/testUtils/testServices'
import type { LaunchEngineDeps } from '../launchEngine'
import { getEngineSelection, clearEngineSelection } from '../engineRegistry'
import { getLaunchSettings } from '../launchSettings'
import { gamesRunningIn, __resetBottleLedgerForTests } from '../bottleLedger'
import type { EffectiveEngine } from '../engineConfig'
import type { EngineSelection } from '../engineTypes'
import { engineLogLabel } from '../engineTypes'

const services: EngineServices = createTestEngineServices({
  installRemove: jest.fn()
})

const { setGlobalMocks } = { setGlobalMocks: () => undefined }
void setGlobalMocks

const showDialog = jest.fn()
const notifyFallback = jest.fn()
const recordDecision = jest.fn()
const ensureGameBottle = jest.fn()
const ensurePinned = jest.fn()
const prepare = jest.fn()
const sendStatus = jest.fn()
const decide = jest.requireMock('../engineDecision')
  .decideLaunchEngine as jest.Mock
const crossoverMissing = jest.requireMock('../engineDecision')
  .isCrossoverMissing as jest.Mock

const cx: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: '26.0.0.1',
  binDir: '/cx/bin'
}
const pinnedSel = (
  reason: 'cx-expired' | 'cx-missing' | 'cx-inconclusive' | 'override'
) =>
  ({
    kind: 'pinned',
    pinId: 'p1',
    reason,
    wineBin: '/pin/wine',
    wineserverBin: '/pin/wineserver',
    label: 'Pin One',
    version: '10.0',
    dxvk: null
  }) as EngineSelection

const useDecision = (
  selection: EngineSelection,
  over: Record<string, unknown> = {}
) => ({
  kind: 'use',
  selection,
  preflight:
    selection.kind === 'crossover'
      ? {
          kind: 'healthy',
          binDir: '/cx/bin',
          build: '26.0.0.1',
          trialDaysRemaining: null
        }
      : { kind: 'expired', binDir: '/cx/bin', build: '26.0.0.1', daysAgo: 3 },
  pin: null,
  needsDownload: false,
  override: 'automatic',
  logLines: [engineLogLabel(selection)],
  ...over
})

function makeGame(o: {
  runner?: string
  appName?: string
  settings?: Partial<GameSettings>
  native?: boolean
  platform?: string
}): Game {
  const runner = o.runner ?? 'gog'
  const appName = o.appName ?? '1234'
  return {
    isNative: () => o.native ?? false,
    getGameInfo: () => ({
      runner,
      app_name: appName,
      title: 'Test Game',
      install: { platform: o.platform ?? 'windows' }
    }),
    getSettings: () =>
      Promise.resolve({
        wineVersion: {
          type: 'crossover',
          bin: '/cx/bin/wine',
          name: 'CrossOver'
        },
        wineCrossoverBottle: 'GameLib',
        winePrefix: '/old/prefix',
        ...o.settings
      })
  } as unknown as Game
}

const PLAIN_WINE = {
  type: 'wine',
  bin: '/w/wine',
  name: 'Odd'
} as GameSettings['wineVersion']

const auto: EffectiveEngine = {
  kind: 'override',
  id: 'automatic',
  source: 'derived'
}
let effective: EffectiveEngine
const logWriter = { logInfo: jest.fn() }

const deps = (
  o: Partial<LaunchEngineDeps> = {}
): Partial<LaunchEngineDeps> => ({
  isMac: () => true,
  readEffective: () => effective,
  isProvisioned: () => true,
  ensureGameBottle,
  isCrossoverMissing: () => Promise.resolve(false),
  currentPinInstalled: () => true,
  ensurePinned,
  prepare,
  sendStatus,
  recordDecision,
  showDialog,
  notifyFallback,
  ...o
})

const run = (
  game: Game,
  o: Partial<LaunchEngineDeps> = {},
  opts: { offline?: boolean; purpose?: 'launch' | 'setup' } = {}
) =>
  selectEngineForLaunch(
    services,
    game,
    {
      offline: opts.offline ?? false,
      logWriter: logWriter as never,
      purpose: opts.purpose
    },
    deps(o)
  )

const settingsWrite = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  effective = auto
  __resetBottleLedgerForTests()
  __resetLaunchEngineForTests()
  for (const k of ['gog:1234', 'legendary:abc', 'nile:n1', 'sideload:s1']) {
    clearEngineSelection(k)
    endEngineLaunch(k)
  }
  prepare.mockResolvedValue({ ok: true, changed: false })
  ensureGameBottle.mockResolvedValue({
    status: 'done',
    createdHere: false,
    engine: 'existing'
  })
  decide.mockResolvedValue(useDecision(cx))
  crossoverMissing.mockResolvedValue(false)
})

describe('eligibility', () => {
  it.each([
    ['native', makeGame({ native: true }), true],
    ['browser', makeGame({ platform: 'Browser' }), true],
    [
      'bottle-runtime store',
      makeGame({ runner: 'steam', appName: '440' }),
      true
    ],
    ['non-mac', makeGame({}), false]
  ])('%s skips without touching the engine', async (_n, game, mac) => {
    const step = await run(game, { isMac: () => mac })
    expect(step).toEqual({ kind: 'skip' })
    expect(decide).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })
})

describe('legacy', () => {
  it('skips the engine step and logs the legacy line (D-07, D-13)', async () => {
    effective = { kind: 'legacy', label: 'Odd Wine' }
    const step = await run(makeGame({}))
    expect(step).toEqual({ kind: 'legacy', key: 'gog:1234' })
    expect(logWriter.logInfo).toHaveBeenCalledWith(
      'engine=legacy name="Odd Wine" reason=override'
    )
    expect(decide).not.toHaveBeenCalled()
    expect(ensureGameBottle).not.toHaveBeenCalled()
    expect(getEngineSelection('gog:1234')).toBeUndefined()
  })
})

describe('per-game bottle', () => {
  const plainGame = () =>
    makeGame({
      settings: {
        wineCrossoverBottle: '',
        winePrefix: '/old/prefix',
        wineVersion: PLAIN_WINE
      }
    })

  it('provisions the switched bottle once before the decision', async () => {
    const order: string[] = []
    ensureGameBottle.mockImplementation(() => {
      order.push('ensure')
      return Promise.resolve({
        status: 'done',
        createdHere: true,
        engine: 'crossover'
      })
    })
    decide.mockImplementation(() => {
      order.push('decide')
      return Promise.resolve(useDecision(cx))
    })
    await run(plainGame(), { isProvisioned: () => false })
    expect(ensureGameBottle).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['ensure', 'decide'])
  })

  it('refuses with a dialog when the bottle cannot be created', async () => {
    ensureGameBottle.mockResolvedValue({ status: 'error', error: 'boom' })
    const step = await run(plainGame(), { isProvisioned: () => false })
    expect(step).toEqual({ kind: 'refused', key: 'gog:1234' })
    expect(showDialog).toHaveBeenCalledTimes(1)
    expect(decide).not.toHaveBeenCalled()
  })

  it('never touches the old plain prefix (D-04)', async () => {
    const old = mkdtempSync(join(tmpdir(), 'gamelib-oldprefix-'))
    try {
      mkdirSync(join(old, 'drive_c'))
      writeFileSync(join(old, 'user.reg'), 'REGEDIT4')
      const before = [
        readdirSync(old).sort(),
        readFileSync(join(old, 'user.reg'), 'utf8')
      ]
      await run(
        makeGame({
          settings: {
            wineCrossoverBottle: '',
            winePrefix: old,
            wineVersion: PLAIN_WINE
          }
        }),
        { isProvisioned: () => false }
      )
      expect([
        readdirSync(old).sort(),
        readFileSync(join(old, 'user.reg'), 'utf8')
      ]).toEqual(before)
      expect(
        getLaunchSettings('gog:1234', { winePrefix: old } as GameSettings)
          .wineCrossoverBottle
      ).toBe('GameLib-gog-1234')
    } finally {
      rmSync(old, { recursive: true, force: true })
    }
  })
})

describe('fallback and refusal', () => {
  it('automatic with expired CrossOver registers the pin, toasts and logs (59 D-06, D-13)', async () => {
    const sel = pinnedSel('cx-expired')
    decide.mockResolvedValue(useDecision(sel))
    const step = await run(makeGame({ runner: 'legendary', appName: 'abc' }))
    expect(step.kind).toBe('use')
    expect(getEngineSelection('legendary:abc')).toMatchObject({
      kind: 'pinned'
    })
    expect(recordDecision).toHaveBeenCalledTimes(1)
    expect(notifyFallback).toHaveBeenCalledWith('Test Game', 'cx-expired')
    expect(logWriter.logInfo).toHaveBeenCalledWith(
      'engine=pinned name="Pin One" version=10.0 reason=cx-expired'
    )
  })

  it('WR-01: an inconclusive pinned decision shows no fallback toast', async () => {
    decide.mockResolvedValue(useDecision(pinnedSel('cx-inconclusive')))
    const step = await run(makeGame({ runner: 'legendary', appName: 'abc' }))
    expect(step.kind).toBe('use')
    expect(notifyFallback).not.toHaveBeenCalled()
  })

  it('setup purpose skips the toast', async () => {
    decide.mockResolvedValue(useDecision(pinnedSel('cx-missing')))
    await run(makeGame({}), {}, { purpose: 'setup' })
    expect(notifyFallback).not.toHaveBeenCalled()
  })

  it('forced CrossOver on broken CrossOver refuses and registers nothing', async () => {
    effective = { kind: 'override', id: 'crossover', source: 'stored' }
    decide.mockResolvedValue({
      kind: 'unavailable',
      override: 'crossover',
      detail: 'broken'
    })
    const step = await run(makeGame({}))
    expect(step.kind).toBe('refused')
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'gamelib:steam.engine.overrideUnavailable'
      })
    )
    expect(getEngineSelection('gog:1234')).toBeUndefined()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('downloads the pin on first need and refuses on failure', async () => {
    const sel = pinnedSel('cx-missing')
    decide.mockResolvedValue(
      useDecision(sel, { needsDownload: true, pin: { id: 'p1' } })
    )
    ensurePinned.mockResolvedValue({
      ok: false,
      aborted: false,
      reason: 'net',
      error: 'net down'
    })
    const step = await run(makeGame({}))
    expect(ensurePinned).toHaveBeenCalledTimes(1)
    expect(step.kind).toBe('refused')
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({ ackId: 'engine-download-failed' })
    )
  })

  it('offline, CrossOver missing and no pin: refused before the pre-flight', async () => {
    const step = await run(
      makeGame({}),
      {
        isCrossoverMissing: () => Promise.resolve(true),
        currentPinInstalled: () => false
      },
      { offline: true }
    )
    expect(step.kind).toBe('refused')
    expect(decide).not.toHaveBeenCalled()
  })
})

describe('bottle-busy (D-16)', () => {
  it('refuses with the bottle-busy dialog and clears the registry', async () => {
    prepare.mockResolvedValue({
      ok: false,
      reason: 'bottle-busy',
      detail: 'busy'
    })
    const step = await run(makeGame({}))
    expect(step.kind).toBe('refused')
    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'gamelib:engine.bottleBusy' })
    )
    expect(getEngineSelection('gog:1234')).toBeUndefined()
    expect(gamesRunningIn('GameLib')).toEqual([])
  })

  it('an idle shared GameLib bottle proceeds (D-02, D-16)', async () => {
    const step = await run(makeGame({}))
    expect(step.kind).toBe('use')
    expect(showDialog).not.toHaveBeenCalled()
  })
})

describe('plain prefix (D-04, D-06)', () => {
  it('a pinned override uses no bottle machinery and keeps the prefix', async () => {
    effective = { kind: 'override', id: 'pinned:p1', source: 'stored' }
    decide.mockResolvedValue(
      useDecision(pinnedSel('override'), {
        override: 'pinned:p1',
        preflight: null
      })
    )
    const game = makeGame({
      settings: {
        wineCrossoverBottle: '',
        winePrefix: '/old/prefix',
        wineVersion: PLAIN_WINE
      }
    })
    const step = await run(game)
    expect(step.kind).toBe('use')
    expect(ensureGameBottle).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    const out = getLaunchSettings('gog:1234', {
      winePrefix: '/old/prefix'
    } as GameSettings)
    expect(out.winePrefix).toBe('/old/prefix')
    expect(out.wineVersion?.bin).toBe('/pin/wine')
    expect(notifyFallback).not.toHaveBeenCalled()
  })
})

describe('legacy CrossOver on the shared bottle (D-05)', () => {
  it('stays on GameLib with CrossOver and no toast', async () => {
    const game = makeGame({
      settings: {
        wineVersion: {
          type: 'crossover',
          bin: '/cx/bin/wine',
          name: 'CrossOver'
        },
        wineCrossoverBottle: 'GameLib'
      }
    })
    const step = await run(game)
    expect(step).toMatchObject({
      kind: 'use',
      selection: { kind: 'crossover' }
    })
    expect(ensureGameBottle).not.toHaveBeenCalled()
    expect(notifyFallback).not.toHaveBeenCalled()
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ bottleName: 'GameLib' })
    )
  })
})

describe('ledger and release', () => {
  it('marks running on success and endEngineLaunch releases everything', async () => {
    await run(makeGame({}))
    expect(gamesRunningIn('GameLib')).toEqual(['gog:1234'])
    expect(getEngineSelection('gog:1234')).toBeDefined()
    endEngineLaunch('gog:1234')
    expect(gamesRunningIn('GameLib')).toEqual([])
    expect(getEngineSelection('gog:1234')).toBeUndefined()
    expect(
      getLaunchSettings('gog:1234', { winePrefix: 'x' } as GameSettings)
        .winePrefix
    ).toBe('x')
  })
})

describe('every runner logs the engine line (D-13)', () => {
  it.each([
    ['legendary', 'abc'],
    ['gog', '1234'],
    ['nile', 'n1'],
    ['sideload', 's1']
  ])('%s', async (runner, appName) => {
    await run(makeGame({ runner, appName }))
    expect(logWriter.logInfo).toHaveBeenCalledWith(
      'engine=crossover build=26.0.0.1 reason=cx-healthy'
    )
  })
})

describe('no persistence (59 D-07, D-08)', () => {
  it('never writes the game config', async () => {
    const game = makeGame({})
    const spy = jest.spyOn(game, 'getSettings')
    await run(game)
    expect(spy).toHaveBeenCalled()
    expect(settingsWrite).not.toHaveBeenCalled()
    const src = readFileSync(join(__dirname, '..', 'launchEngine.ts'), 'utf8')
    expect(src).not.toMatch(
      /setSetting|writeConfig|writeFileSync|GameConfig\.get/
    )
  })
})
