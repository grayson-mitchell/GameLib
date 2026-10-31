import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { GameSettings } from 'common/types'

const mockState = { root: '' }

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/constants/paths', () => ({ toolsPath: '/tools' }))
jest.mock('backend/tools', () => ({ DXVK: { installRemove: jest.fn() } }))
jest.mock('../../bottle', () => ({
  getBottleDir: (name: string) => `${mockState.root}/${name}`,
  sanitizeBottleName: (name: string) =>
    /^[A-Za-z0-9_-]+$/.test(name) ? name : '',
  getBridgeBottleSettings: jest.fn(),
  buildFallbackGameSettings: jest.fn(),
  killBottleWineServerWith: jest.fn()
}))
jest.mock('../../bottleProcessMonitor', () => ({
  getBottleProcessMonitorPhase: jest.fn()
}))
jest.mock('../../crossoverLocation', () => ({
  resolveCrossoverBinDirAsync: jest.fn()
}))
jest.mock('../../electronStores', () => ({
  steamBottleConfigStore: { get_nodefault: jest.fn() }
}))
jest.mock('../fallbackEngine', () => ({
  pinnedEngineRoot: () => '/tools/steam-engines',
  pinnedEnginePaths: jest.fn(),
  isPinnedEngineInstalled: jest.fn()
}))

import { ENGINE_MARKER_FILE, prepareBottleForEngine } from '../engineSwitch'
import type { EngineSwitchDeps } from '../engineSwitch'
import type { EngineSelection } from '../engineTypes'

const BIN_DIR =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const PIN_WS = '/tools/steam-engines/wine-staging-11.20/bin/wineserver'
const NAME = 'GameLibSteamBridge-620'

const pinned: EngineSelection = {
  kind: 'pinned',
  pinId: 'wine-staging-11.20',
  reason: 'cx-missing',
  wineBin: '/tools/steam-engines/wine-staging-11.20/bin/wine',
  wineserverBin: PIN_WS,
  label: 'Pinned',
  version: '11.20',
  dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
}
const crossover: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: '26.3',
  binDir: BIN_DIR
}

let dir: string
let deps: jest.Mocked<EngineSwitchDeps>

const marker = () =>
  JSON.parse(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8'))
const seedMarker = (m: object) =>
  writeFileSync(join(dir, ENGINE_MARKER_FILE), JSON.stringify(m))

beforeEach(() => {
  mockState.root = mkdtempSync(join(tmpdir(), 'gamelib-switch-'))
  dir = join(mockState.root, NAME)
  mkdirSync(dir)
  deps = {
    getMonitorPhase: jest.fn().mockReturnValue(null),
    killWith: jest.fn().mockResolvedValue(true),
    resolveCrossoverBinDir: jest.fn().mockResolvedValue(BIN_DIR),
    installRemove: jest.fn().mockImplementation(async (_s, _t, action) => {
      if (action === 'backup')
        writeFileSync(join(dir, 'current_dxvk-macOS'), 'v1')
      return true
    }),
    crossoverSettings: jest
      .fn()
      .mockReturnValue({ id: 'cx' } as unknown as GameSettings),
    fallbackSettings: jest
      .fn()
      .mockReturnValue({ id: 'fb' } as unknown as GameSettings),
    currentPinEngine: jest.fn().mockReturnValue({
      wineBin: '/tools/steam-engines/wine-staging-11.20/bin/wine',
      wineserverBin: PIN_WS,
      label: 'Pinned',
      version: '11.20',
      dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    })
  } as jest.Mocked<EngineSwitchDeps>
})
afterEach(() => rmSync(mockState.root, { recursive: true, force: true }))

const run = (next: EngineSelection) =>
  prepareBottleForEngine({ appId: '620', bottleName: NAME, next, deps })

describe('prepareBottleForEngine', () => {
  test('crossover -> pinned: kills CrossOver wineserver, installs DXVK from the pin, writes the marker', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    const res = await run(pinned)
    expect(res).toEqual({ ok: true, changed: true })
    expect(deps.killWith).toHaveBeenCalledWith(
      NAME,
      `${BIN_DIR}/wineserver`,
      {
        CX_ROOT: '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver'
      },
      15_000
    )
    expect(deps.installRemove).toHaveBeenCalledWith(
      { id: 'fb' },
      'dxvk',
      'backup',
      { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    )
    expect(marker()).toEqual({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS
    })
  })

  test('pinned -> crossover with DXVK present: kills the pin wineserver and restores via CrossOver', async () => {
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS
    })
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v1')
    const res = await run(crossover)
    expect(res).toEqual({ ok: true, changed: true })
    expect(deps.killWith).toHaveBeenCalledWith(
      NAME,
      PIN_WS,
      { USER: 'crossover' },
      15_000
    )
    expect(deps.crossoverSettings).toHaveBeenCalledWith('620')
    expect(deps.installRemove).toHaveBeenCalledWith(
      { id: 'cx' },
      'dxvk',
      'restore',
      { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    )
    expect(marker().kind).toBe('crossover')
  })

  test('same engine as the marker: no kill, no DXVK change', async () => {
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS
    })
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(deps.installRemove).not.toHaveBeenCalled()
  })

  test('no marker: a conf with a Timestamp is crossover', async () => {
    writeFileSync(join(dir, 'cxbottle.conf'), '[Bottle]\n"Timestamp" = "1"\n')
    await run(pinned)
    expect(deps.killWith.mock.calls[0][1]).toBe(`${BIN_DIR}/wineserver`)
  })

  test('no marker: a conf without a Timestamp is the current pin', async () => {
    writeFileSync(
      join(dir, 'cxbottle.conf'),
      '[Bottle]\n"WineArch" = "win64"\n'
    )
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(marker().id).toBe('wine-staging-11.20')
  })

  test('a marker wineserver outside the engine roots is never spawned', async () => {
    seedMarker({
      kind: 'pinned',
      id: 'old-pin',
      wineserverBin: '/tmp/evil/wineserver'
    })
    const res = await run(crossover)
    expect(res.ok).toBe(true)
    expect(deps.killWith).not.toHaveBeenCalled()
  })

  test.each(['starting', 'running'] as const)(
    'a %s game blocks the switch with no kill and no DXVK change',
    async (phase) => {
      deps.getMonitorPhase.mockReturnValue(phase)
      seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
      const res = await run(pinned)
      expect(res).toMatchObject({ ok: false, reason: 'game-running' })
      expect(deps.killWith).not.toHaveBeenCalled()
      expect(deps.installRemove).not.toHaveBeenCalled()
    }
  )

  test('installRemove resolving false -> dxvk-failed and the marker is not updated', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    deps.installRemove.mockResolvedValue(false)
    expect(await run(pinned)).toMatchObject({
      ok: false,
      reason: 'dxvk-failed'
    })
    expect(marker().kind).toBe('crossover')
  })

  test('current_dxvk-macOS missing after a backup -> dxvk-failed', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    deps.installRemove.mockResolvedValue(true)
    expect(await run(pinned)).toMatchObject({
      ok: false,
      reason: 'dxvk-failed'
    })
    expect(marker().kind).toBe('crossover')
    expect(existsSync(join(dir, 'current_dxvk-macOS'))).toBe(false)
  })

  test('a missing bottle is invalid-bottle', async () => {
    const res = await prepareBottleForEngine({
      appId: '620',
      bottleName: 'GameLibSteamBridge-999',
      next: pinned,
      deps
    })
    expect(res).toMatchObject({ ok: false, reason: 'invalid-bottle' })
  })
})
