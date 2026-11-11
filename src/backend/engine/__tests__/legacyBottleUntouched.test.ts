/**
 * Phase 61-14 (D-02, D-04, D-05, D-06): an engine-controlled launch leaves existing bottles and
 * prefixes alone. Snapshot every file (relative path, sha256, symlink flag) before and after
 * selectEngineForLaunch + endEngineLaunch; the only permitted difference is Phase 59's engine
 * marker `.gamelib-engine.json`.
 *
 * Real: selectEngineForLaunch, resolveGamePrefix, prepareBottleForEngine (marker handling).
 * Injected: every spawning dependency (pre-flight, wineserver kill, DXVK install/remove, the
 * per-game bottle creation). No child process is spawned, so the fake HOME profile only hosts
 * the plain prefixes; bottles live under the jest-contained HOME that `getBottleDir` resolves.
 */
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync
} from 'fs'
import { createHash } from 'crypto'
import { join, relative } from 'path'
import { tmpdir } from 'os'
import type { Game } from 'common/types/game_manager'
import type { GameSettings } from 'common/types'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

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
jest.mock('../engineDecision', () => ({
  decideLaunchEngine: jest.fn(),
  isCrossoverMissing: jest.fn(),
  killCrossoverWineserverWith: jest.fn(() => jest.fn())
}))
jest.mock('../engineDialogs', () => ({
  showEngineDialog: jest.fn(),
  notifyEngineFallback: jest.fn()
}))
jest.mock('../pinnedEngineProgress', () => ({
  ensurePinnedEngineReportingStatus: jest.fn()
}))

import {
  endEngineLaunch as endEngineLaunchOn,
  selectEngineForLaunch
} from '../launchEngine'
import type { EngineServices } from '../engineServices'
import { createTestEngineServices } from 'backend/testUtils/testServices'
import type { LaunchEngineDeps } from '../launchEngine'
import { userHome } from 'backend/constants/paths'
import { createTestEngineRuntime } from 'backend/testUtils/testEngineRuntime'
import { getBottleDir as getBottleDirIn } from '../bottlePrimitives'
import { ENGINE_MARKER_FILE, switchContextFrom } from '../engineSwitch'
import { perGameBottleName } from '../perGameBottle'
import type { EffectiveEngine } from '../engineConfig'
import type { EngineSelection } from '../engineTypes'

// Bottles live under the jest-contained HOME, the real `userHome` the constants resolve.
const paths = { userHome }
const getBottleDir = (name: string) => getBottleDirIn(paths, name)
// A fresh engine runtime per test (beforeEach): nothing crosses a test and there is no reset hook.
let services: EngineServices
const endEngineLaunch = (key: string) =>
  endEngineLaunchOn(services.engineRuntime, key as never)

const decide = jest.requireMock('../engineDecision')
  .decideLaunchEngine as jest.Mock

const RUNNER = 'gog'
const APP = '1234'
const KEY = `${RUNNER}:${APP}`

const cx: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: '26.0.0.1',
  binDir: '/cx/bin'
}
const pinned = {
  kind: 'pinned',
  pinId: 'p1',
  reason: 'override',
  wineBin: '/pin/wine',
  wineserverBin: '/pin/wineserver',
  label: 'Pin One',
  version: '10.0',
  dxvk: null
} as EngineSelection

const decision = (selection: EngineSelection, override: string) => ({
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
      : null,
  pin: null,
  needsDownload: false,
  override,
  logLines: []
})

type Snapshot = Record<string, string>

function snapshot(root: string, skipMarker: boolean): Snapshot {
  const out: Snapshot = {}
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      const rel = relative(root, full)
      if (skipMarker && name === ENGINE_MARKER_FILE) continue
      const st = lstatSync(full)
      if (st.isSymbolicLink()) {
        out[rel] = `symlink:${readlinkSync(full)}`
      } else if (st.isDirectory()) {
        out[rel] = 'dir'
        walk(full)
      } else {
        out[rel] =
          'file:' +
          createHash('sha256').update(readFileSync(full)).digest('hex')
      }
    }
  }
  walk(root)
  return out
}

function populate(root: string, tag: string, withTimestamp: boolean): void {
  mkdirSync(join(root, 'drive_c', 'users', 'crossover'), { recursive: true })
  mkdirSync(join(root, 'drive_c', 'Games', `game-${tag}`), { recursive: true })
  writeFileSync(join(root, 'user.reg'), `WINE REGISTRY ${tag} user`)
  writeFileSync(join(root, 'system.reg'), `WINE REGISTRY ${tag} system`)
  writeFileSync(
    join(root, 'drive_c', 'Games', `game-${tag}`, 'save.dat'),
    Buffer.from([0, 1, 2, 3, 250, tag.length])
  )
  writeFileSync(
    join(root, 'drive_c', 'Games', 'shared.cfg'),
    'written by another game'
  )
  writeFileSync(
    join(root, 'cxbottle.conf'),
    withTimestamp ? '[Bottle]\nTimestamp=1\n' : '[Bottle]\n'
  )
}

let effective: EffectiveEngine
let settings: Partial<GameSettings>
const profile = createFakeHomeProfile({ prefix: 'gamelib-61-14-' })
const bottles: string[] = []
const ensureGameBottle = jest.fn()
const killWith = jest.fn()
const installRemove = jest.fn()

const makeGame = (): Game =>
  ({
    isNative: () => false,
    getGameInfo: () => ({
      runner: RUNNER,
      app_name: APP,
      title: 'Test Game',
      install: { platform: 'windows' }
    }),
    getSettings: () => Promise.resolve(settings as GameSettings)
  }) as unknown as Game

const deps = (): Partial<LaunchEngineDeps> => ({
  isMac: () => true,
  readEffective: () => effective,
  isCrossoverMissing: () => Promise.resolve(false),
  currentPinInstalled: () => true,
  recordDecision: jest.fn(),
  showDialog: jest.fn(),
  notifyFallback: jest.fn(),
  ensureGameBottle,
  switchDeps: () => ({
    ctx: switchContextFrom(services),
    getMonitorPhase: () => null,
    killWith,
    installRemove,
    resolveCrossoverBinDir: () => Promise.resolve('/cx/bin'),
    currentPinEngine: () => null,
    ensurePinEngine: () => Promise.resolve(null),
    fallbackSettings: () => ({}) as GameSettings
  })
})

function makeBottle(name: string, withTimestamp: boolean): string {
  const dir = getBottleDir(name)
  if (!dir.startsWith(tmpdir()) && !dir.includes('gamelib-jest-run-')) {
    throw new Error(`refusing to write a bottle outside the jest HOME: ${dir}`)
  }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  populate(dir, name, withTimestamp)
  bottles.push(dir)
  return dir
}

async function launchAndEnd(): Promise<string> {
  const step = await selectEngineForLaunch(
    services,
    makeGame(),
    { offline: false },
    deps()
  )
  endEngineLaunch(KEY)
  return step.kind
}

beforeEach(() => {
  jest.clearAllMocks()
  services = createTestEngineServices({
    installRemove: jest.fn(),
    paths: { ...createTestEngineServices().paths, userHome },
    engineRuntime: createTestEngineRuntime({ paths: { userHome } })
  })
  killWith.mockResolvedValue(undefined)
  installRemove.mockResolvedValue(true)
  ensureGameBottle.mockImplementation((args: { bottleName: string }) => {
    const dir = getBottleDir(args.bottleName)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'cxbottle.conf'), '[Bottle]\nTimestamp=1\n')
    bottles.push(dir)
    return Promise.resolve({
      status: 'done',
      createdHere: true,
      engine: 'crossover'
    })
  })
})

afterEach(() => {
  for (const dir of bottles.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

afterAll(() => profile.dispose())

describe.each([
  ['legacy shared GameLib bottle', 'GameLib-61-14-shared'],
  ['user-picked bottle', 'MyBottle-61-14']
])('%s (D-02, D-05)', (_label, bottleName) => {
  it('leaves every file byte-identical except the engine marker', async () => {
    const dir = makeBottle(bottleName, true)
    // The second game's files sit in the same bottle.
    writeFileSync(join(dir, 'drive_c', 'Games', 'other-game.sav'), 'other')
    settings = {
      wineCrossoverBottle: bottleName,
      winePrefix: join(profile.root, 'unused-global-prefix'),
      wineVersion: {
        type: 'crossover',
        bin: '/cx/bin/wine',
        name: 'CrossOver'
      }
    }
    effective = { kind: 'override', id: 'automatic', source: 'derived' }
    decide.mockResolvedValue(decision(cx, 'automatic'))

    const before = snapshot(dir, false)
    const kind = await launchAndEnd()
    const after = snapshot(dir, true)

    expect(kind).toBe('use')
    expect(after).toEqual(before)
    // nothing added or removed outside the marker, no symlinks introduced
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
    expect(Object.values(after).some((v) => v.startsWith('symlink:'))).toBe(
      false
    )
    expect(ensureGameBottle).not.toHaveBeenCalled()
  })
})

describe('plain prefix', () => {
  const plainSettings = (prefix: string): Partial<GameSettings> => ({
    wineCrossoverBottle: '',
    winePrefix: prefix,
    wineVersion: { type: 'wine', bin: '/w/wine', name: 'Odd Wine' }
  })

  it('derived pinned engine: prefix byte-identical, no bottle created (D-04, D-06)', async () => {
    const prefix = join(profile.root, 'Prefixes', 'plain-pinned')
    mkdirSync(prefix, { recursive: true })
    populate(prefix, 'plain', false)
    settings = plainSettings(prefix)
    effective = { kind: 'override', id: 'pinned:p1', source: 'derived' }
    // setEngineSelection requires the pinned binaries to exist; keep them outside the prefix.
    const engineDir = join(profile.root, 'engine')
    mkdirSync(engineDir, { recursive: true })
    writeFileSync(join(engineDir, 'wine'), '')
    writeFileSync(join(engineDir, 'wineserver'), '')
    decide.mockResolvedValue(
      decision(
        {
          ...pinned,
          wineBin: join(engineDir, 'wine'),
          wineserverBin: join(engineDir, 'wineserver')
        } as EngineSelection,
        'pinned:p1'
      )
    )

    const before = snapshot(prefix, false)
    const kind = await launchAndEnd()
    const after = snapshot(prefix, false)

    expect(kind).toBe('use')
    expect(after).toEqual(before)
    expect(Object.keys(after)).not.toContain(ENGINE_MARKER_FILE)
    expect(ensureGameBottle).not.toHaveBeenCalled()
    const perGame = perGameBottleName(RUNNER, APP)
    expect(perGame).not.toBeNull()
    expect(() => lstatSync(getBottleDir(perGame as string))).toThrow()
  })

  it('switched to Automatic: a new per-game bottle appears, the old prefix is untouched (D-04)', async () => {
    const prefix = join(profile.root, 'Prefixes', 'plain-switched')
    mkdirSync(prefix, { recursive: true })
    populate(prefix, 'plain', false)
    settings = plainSettings(prefix)
    effective = { kind: 'override', id: 'automatic', source: 'stored' }
    decide.mockResolvedValue(decision(cx, 'automatic'))

    const before = snapshot(prefix, false)
    const kind = await launchAndEnd()
    const after = snapshot(prefix, false)

    expect(kind).toBe('use')
    expect(ensureGameBottle).toHaveBeenCalledTimes(1)
    const perGame = perGameBottleName(RUNNER, APP) as string
    expect(lstatSync(getBottleDir(perGame)).isDirectory()).toBe(true)
    // the old prefix: same bytes, not a symlink, not renamed, nothing added
    expect(after).toEqual(before)
    expect(lstatSync(prefix).isSymbolicLink()).toBe(false)
    expect(Object.values(after).some((v) => v.startsWith('symlink:'))).toBe(
      false
    )
  })
})
