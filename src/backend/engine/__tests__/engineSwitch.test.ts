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

const mockState = { root: '', engines: '/tools/steam-engines' }

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/constants/paths', () => ({ toolsPath: '/tools' }))
jest.mock('backend/tools', () => ({ DXVK: { installRemove: jest.fn() } }))
jest.mock('backend/engine/bottlePrimitives', () => ({
  getBottleDir: (name: string) => `${mockState.root}/${name}`,
  sanitizeBottleName: (name: string) =>
    /^[A-Za-z0-9_-]+$/.test(name) ? name : '',
  buildFallbackGameSettings: jest.fn(),
  killBottleWineServerWith: jest.fn()
}))
jest.mock('backend/storeManagers/steam/bottle', () => ({
  bridgeBottleNameFor: (id: string) => `GameLibSteamBridge-${id}`,
  persistedWineBins: () => [],
  getBridgeBottleSettings: jest.fn()
}))
jest.mock('backend/storeManagers/steam/bottleProcessMonitor', () => ({
  getBottleProcessMonitorPhase: jest.fn()
}))
jest.mock('backend/storeManagers/steam/crossoverLocation', () => ({
  resolveCrossoverBinDirAsync: jest.fn()
}))
jest.mock('../fallbackEngine', () => ({
  pinnedEngineRoot: () => mockState.engines,
  pinnedEnginePaths: jest.fn(),
  isPinnedEngineInstalled: jest.fn().mockReturnValue(false),
  ensurePinnedEngine: jest.fn()
}))

import {
  ENGINE_MARKER_FILE,
  prepareBottleForEngine,
  readBottleEngineMarkerKind,
  restoreNeedsAbsentPin
} from '../engineSwitch'
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

const pinEngine = {
  wineBin: '/tools/steam-engines/wine-staging-11.20/bin/wine',
  wineserverBin: PIN_WS,
  label: 'Pinned',
  version: '11.20',
  dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
}

let dir: string
let deps: jest.Mocked<EngineSwitchDeps>

const marker = () =>
  JSON.parse(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8'))
const seedMarker = (m: object) =>
  writeFileSync(join(dir, ENGINE_MARKER_FILE), JSON.stringify(m))

beforeEach(() => {
  mockState.engines = '/tools/steam-engines'
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
    }),
    ensurePinEngine: jest.fn().mockResolvedValue(pinEngine),
    ownBottleName: jest.fn((id: string) => `GameLibSteamBridge-${id}`)
  } as unknown as jest.Mocked<EngineSwitchDeps>
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
      wineserverBin: PIN_WS,
      dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    })
  })

  test('pinned -> crossover with DXVK present: kills the pin wineserver and restores via CrossOver', async () => {
    mockState.engines = join(mockState.root, 'engines')
    const ws = join(mockState.engines, 'wine', 'bin', 'wineserver')
    mkdirSync(join(mockState.engines, 'wine', 'bin'), { recursive: true })
    writeFileSync(ws, '')
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: ws
    })
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v1')
    ;(deps.installRemove as jest.Mock).mockImplementationOnce(async () => {
      rmSync(join(dir, 'current_dxvk-macOS'))
      return true
    })
    const res = await run(crossover)
    expect(res).toEqual({ ok: true, changed: true })
    expect(deps.killWith).toHaveBeenCalledWith(
      NAME,
      ws,
      { USER: 'crossover' },
      15_000
    )
    expect(deps.crossoverSettings).toHaveBeenCalledWith('620')
    expect(deps.installRemove).toHaveBeenCalledWith(
      { id: 'cx', winePrefix: dir },
      'dxvk',
      'restore',
      { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    )
    expect(marker().kind).toBe('crossover')
  })

  test('pinned -> crossover: a restore that leaves the DXVK marker is a failure, marker unchanged (59-UAT G7)', async () => {
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS
    })
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v1')
    const res = await run(crossover)
    expect(res).toMatchObject({ ok: false, reason: 'dxvk-failed' })
    expect(marker().kind).toBe('pinned')
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
    // WR-09: the previous wineserver is gone, so the marker names the new engine
    expect(marker()).toMatchObject({ kind: 'pinned', dxvk: 'failed' })
  })

  test('current_dxvk-macOS missing after a backup -> dxvk-failed', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    deps.installRemove.mockResolvedValue(true)
    expect(await run(pinned)).toMatchObject({
      ok: false,
      reason: 'dxvk-failed'
    })
    expect(marker()).toMatchObject({ kind: 'pinned', dxvk: 'failed' })
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

describe('prepareBottleForEngine DXVK recovery (CR-03, WR-09)', () => {
  const seedPinned = (extra: object = {}) =>
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS,
      ...extra
    })
  const dxvkFile = () => join(dir, 'current_dxvk-macOS')
  const removing = () =>
    (deps.installRemove as jest.Mock).mockImplementation(async () => {
      rmSync(dxvkFile(), { force: true })
      return true
    })

  test('a dxvk:failed marker retries the install on the next pinned launch without a kill', async () => {
    seedPinned({ dxvk: 'failed' })
    expect(await run(pinned)).toEqual({ ok: true, changed: true })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(deps.installRemove).toHaveBeenCalledTimes(1)
    expect(marker().dxvk).toEqual({
      dir: '/tools/steam-engines/dxvk',
      version: 'v1'
    })
  })

  test('pinned -> crossover with no resolvable DXVK source fails and leaves the marker', async () => {
    seedPinned()
    writeFileSync(dxvkFile(), 'v1')
    deps.ensurePinEngine.mockResolvedValue(null)
    const res = await run(crossover)
    expect(res).toMatchObject({ ok: false, reason: 'dxvk-failed' })
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(marker()).toEqual({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS
    })
  })

  test('pinned -> crossover downloads the pin through ensurePinEngine when absent', async () => {
    seedPinned()
    writeFileSync(dxvkFile(), 'v1')
    removing()
    expect(await run(crossover)).toEqual({ ok: true, changed: true })
    expect(deps.ensurePinEngine).toHaveBeenCalledTimes(1)
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    )
    expect(marker().kind).toBe('crossover')
  })

  test('the marker dxvk dir is the restore source when it exists on disk', async () => {
    mockState.engines = join(mockState.root, 'engines')
    const srcDir = join(mockState.engines, 'dxvk')
    mkdirSync(join(srcDir, 'x64'), { recursive: true })
    seedPinned({ dxvk: { dir: srcDir, version: 'v9' } })
    writeFileSync(dxvkFile(), 'v9')
    removing()
    expect(await run(crossover)).toEqual({ ok: true, changed: true })
    expect(deps.ensurePinEngine).not.toHaveBeenCalled()
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      { dir: srcDir, version: 'v9' }
    )
  })

  test('a marker dxvk dir outside the engine root is ignored', async () => {
    seedPinned({ dxvk: { dir: '/etc', version: 'v9' } })
    writeFileSync(dxvkFile(), 'v1')
    removing()
    await run(crossover)
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    )
  })

  test('a failed-DXVK marker with no version file still runs the cleanup restore', async () => {
    seedPinned({ dxvk: 'failed' })
    removing()
    expect(await run(crossover)).toEqual({ ok: true, changed: true })
    expect(deps.installRemove).toHaveBeenCalledTimes(1)
    expect(marker().kind).toBe('crossover')
  })

  test('installRemove returning false on restore keeps the marker', async () => {
    seedPinned({ dxvk: 'failed' })
    deps.installRemove.mockResolvedValue(false)
    expect(await run(crossover)).toMatchObject({
      ok: false,
      reason: 'dxvk-failed'
    })
    expect(marker().kind).toBe('pinned')
  })
})

describe('prepareBottleForEngine health and shared bottles (G10, WR-06)', () => {
  const seedPinned = () =>
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS
    })
  const removing = () =>
    (deps.installRemove as jest.Mock).mockImplementation(async () => {
      rmSync(join(dir, 'current_dxvk-macOS'), { force: true })
      return true
    })
  const runWith = (
    extra: object,
    next: EngineSelection = crossover,
    bottleName = NAME
  ) =>
    prepareBottleForEngine({
      appId: '620',
      bottleName,
      next,
      deps,
      ...extra
    })

  test('crossoverHealthy omitted: the restore uses CrossOver settings', async () => {
    seedPinned()
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v1')
    removing()
    await runWith({})
    expect(deps.installRemove).toHaveBeenCalledWith(
      { id: 'cx', winePrefix: dir },
      'dxvk',
      'restore',
      expect.anything()
    )
  })

  test('crossoverHealthy:false: the restore runs on the built-in engine and stops its wineserver', async () => {
    seedPinned()
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v1')
    removing()
    deps.ensurePinEngine.mockResolvedValue(pinEngine)
    expect(await runWith({ crossoverHealthy: false })).toEqual({
      ok: true,
      changed: true
    })
    expect(deps.crossoverSettings).not.toHaveBeenCalled()
    expect(deps.fallbackSettings).toHaveBeenCalledWith(NAME, pinEngine)
    expect(deps.installRemove).toHaveBeenCalledWith(
      { id: 'fb', winePrefix: dir },
      'dxvk',
      'restore',
      pinEngine.dxvk
    )
    const last = deps.killWith.mock.calls[deps.killWith.mock.calls.length - 1]
    expect(last).toEqual([NAME, PIN_WS, { USER: 'crossover' }, 15_000])
  })

  test('crossoverHealthy:false with a source that has no wineBin fails without spawning wine', async () => {
    mockState.engines = join(mockState.root, 'engines')
    const srcDir = join(mockState.engines, 'dxvk')
    mkdirSync(join(srcDir, 'x64'), { recursive: true })
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: '',
      dxvk: { dir: srcDir, version: 'v9' }
    })
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v9')
    deps.ensurePinEngine.mockResolvedValue(null)
    const res = await runWith({ crossoverHealthy: false })
    expect(res).toMatchObject({ ok: false, reason: 'dxvk-failed' })
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(marker().kind).toBe('pinned')
  })

  test('half pin fetches the pin wine for an unhealthy restore', async () => {
    mockState.engines = join(mockState.root, 'engines')
    const srcDir = join(mockState.engines, 'dxvk')
    mkdirSync(join(srcDir, 'x64'), { recursive: true })
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: '',
      dxvk: { dir: srcDir, version: 'v9' }
    })
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v9')
    removing()
    expect(await runWith({ crossoverHealthy: false })).toEqual({
      ok: true,
      changed: true
    })
    expect(deps.ensurePinEngine).toHaveBeenCalledTimes(1)
    expect(deps.fallbackSettings).toHaveBeenCalledWith(NAME, {
      ...pinEngine,
      dxvk: { dir: srcDir, version: 'v9' }
    })
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      { dir: srcDir, version: 'v9' }
    )
  })

  test('a legacy shared bottle with a differing marker is refused with no side effects', async () => {
    mkdirSync(join(mockState.root, 'GameLibSteamBridge'))
    writeFileSync(
      join(mockState.root, 'GameLibSteamBridge', ENGINE_MARKER_FILE),
      JSON.stringify({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    )
    const onSwitching = jest.fn()
    const res = await runWith({ onSwitching }, pinned, 'GameLibSteamBridge')
    expect(res).toMatchObject({ ok: false, reason: 'shared-bottle' })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(onSwitching).not.toHaveBeenCalled()
  })

  test('a shared bottle with the same identity is not refused', async () => {
    mkdirSync(join(mockState.root, 'GameLibSteamBridge'))
    writeFileSync(
      join(mockState.root, 'GameLibSteamBridge', ENGINE_MARKER_FILE),
      JSON.stringify({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    )
    expect(await runWith({}, crossover, 'GameLibSteamBridge')).toEqual({
      ok: true,
      changed: false
    })
  })

  test('onSwitching fires once on a real switch, before the kill, and not on a no-op', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    const order: string[] = []
    deps.killWith.mockImplementation(async () => {
      order.push('kill')
      return true
    })
    await runWith({ onSwitching: () => order.push('switching') }, pinned)
    expect(order).toEqual(['switching', 'kill'])

    const again = jest.fn()
    await runWith({ onSwitching: again }, pinned)
    expect(again).not.toHaveBeenCalled()
  })
})

describe('prepareBottleForEngine ordered restore (CR-03, WR-05)', () => {
  const seedPinned = (extra: object = {}, ws = PIN_WS) =>
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: ws,
      ...extra
    })
  const dxvkFile = () => join(dir, 'current_dxvk-macOS')

  test('offline licensed user: no source, no kill, marker untouched', async () => {
    seedPinned()
    writeFileSync(dxvkFile(), 'v1')
    const before = readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')
    deps.ensurePinEngine.mockResolvedValue(null)
    const onSwitching = jest.fn()
    const res = await prepareBottleForEngine({
      appId: '620',
      bottleName: NAME,
      next: crossover,
      deps,
      onSwitching
    })
    expect(res).toMatchObject({ ok: false, reason: 'dxvk-failed' })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(onSwitching).not.toHaveBeenCalled()
    expect(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')).toBe(before)
    expect(existsSync(dxvkFile())).toBe(true)
  })

  test('source resolved before killPrevious', async () => {
    mockState.engines = join(mockState.root, 'engines')
    const ws = join(mockState.engines, 'bin', 'wineserver')
    mkdirSync(join(mockState.engines, 'bin'), { recursive: true })
    writeFileSync(ws, '')
    seedPinned({}, ws)
    writeFileSync(dxvkFile(), 'v1')
    ;(deps.installRemove as jest.Mock).mockImplementation(async () => {
      rmSync(dxvkFile(), { force: true })
      return true
    })
    await run(crossover)
    const resolveOrder = deps.ensurePinEngine.mock.invocationCallOrder[0]
    expect(resolveOrder).toBeLessThan(deps.killWith.mock.invocationCallOrder[0])
  })

  test('a marker wineserver that does not exist is not spawned', async () => {
    seedPinned({}, '/tools/steam-engines/wine-staging-11.20/bin/missing')
    writeFileSync(dxvkFile(), 'v1')
    ;(deps.installRemove as jest.Mock).mockImplementation(async () => {
      rmSync(dxvkFile(), { force: true })
      return true
    })
    await run(crossover)
    // only the post-restore CrossOver stop (G30); the missing marker wineserver is not spawned
    expect(deps.killWith).toHaveBeenCalledTimes(1)
    expect(deps.killWith.mock.calls[0][1]).toBe(`${BIN_DIR}/wineserver`)
  })

  test('wineboot -u failure rewrites the marker with dxvk failed', async () => {
    seedPinned({ dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' } })
    writeFileSync(dxvkFile(), 'v1')
    deps.installRemove.mockResolvedValue(false)
    expect(await run(crossover)).toMatchObject({
      ok: false,
      reason: 'dxvk-failed'
    })
    expect(marker()).toEqual({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS,
      dxvk: 'failed'
    })
  })

  test('after a failed restore, a pinned next retries the backup and records dxvk', async () => {
    seedPinned({ dxvk: 'failed' })
    expect(await run(pinned)).toEqual({ ok: true, changed: true })
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'backup',
      pinned.kind === 'pinned' ? pinned.dxvk : undefined
    )
    expect(marker().dxvk).toEqual({
      dir: '/tools/steam-engines/dxvk',
      version: 'v1'
    })
  })

  test('after a failed restore, a CrossOver next re-runs the restore with the pin source', async () => {
    seedPinned({ dxvk: 'failed' })
    ;(deps.installRemove as jest.Mock).mockImplementation(async () => {
      rmSync(dxvkFile(), { force: true })
      return true
    })
    expect(await run(crossover)).toEqual({ ok: true, changed: true })
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    )
  })
})

describe('G22: read-only marker accessors', () => {
  const seed = (m: object) =>
    writeFileSync(join(dir, ENGINE_MARKER_FILE), JSON.stringify(m))
  const pinnedMarker = (extra: object = {}) => ({
    kind: 'pinned',
    id: 'wine-staging-11.20',
    wineserverBin: PIN_WS,
    ...extra
  })

  test('G22: readBottleEngineMarkerKind maps kinds, null when absent or unsafe, never writes', () => {
    expect(readBottleEngineMarkerKind(NAME)).toBeNull()
    expect(existsSync(join(dir, ENGINE_MARKER_FILE))).toBe(false)
    seed(pinnedMarker())
    expect(readBottleEngineMarkerKind(NAME)).toBe('non-crossover')
    seed({ kind: 'crossover', id: 'cx', wineserverBin: 'x' })
    expect(readBottleEngineMarkerKind(NAME)).toBe('crossover')
    expect(readBottleEngineMarkerKind('../escape')).toBeNull()
    writeFileSync(join(dir, ENGINE_MARKER_FILE), '{not json')
    expect(readBottleEngineMarkerKind(NAME)).toBeNull()
  })

  test('G22: restoreNeedsAbsentPin is true only when a restore must fetch the absent pin', () => {
    seed(
      pinnedMarker({
        dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
      })
    )
    expect(restoreNeedsAbsentPin(NAME)).toBe(true)
  })

  test('G22: restoreNeedsAbsentPin is false when no restore is needed, the DXVK copy survives, or the marker is CrossOver', () => {
    seed(pinnedMarker())
    expect(restoreNeedsAbsentPin(NAME)).toBe(false)
    const keep = join(mockState.root, 'dxvk-keep')
    mkdirSync(join(keep, 'x64'), { recursive: true })
    seed(pinnedMarker({ dxvk: { dir: keep, version: 'v1' } }))
    expect(restoreNeedsAbsentPin(NAME)).toBe(false)
    seed({ kind: 'crossover', id: 'cx', wineserverBin: 'x' })
    expect(restoreNeedsAbsentPin(NAME)).toBe(false)
    expect(restoreNeedsAbsentPin('../escape')).toBe(false)
  })
})

describe('G30 / WR-02 engine switch', () => {
  const dxvkFile = () => join(dir, 'current_dxvk-macOS')
  const seedPinnedMarker = () => {
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS,
      dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    })
    writeFileSync(dxvkFile(), 'v1')
  }
  const restoring = (ok: boolean) =>
    (deps.installRemove as jest.Mock).mockImplementation(() => {
      if (ok) rmSync(dxvkFile(), { force: true })
      return Promise.resolve(ok)
    })
  const dxvkSrcDir = () => {
    mockState.engines = join(mockState.root, 'engines')
    const srcDir = join(mockState.engines, 'dxvk')
    mkdirSync(join(srcDir, 'x64'), { recursive: true })
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: '',
      dxvk: { dir: srcDir, version: 'v1' }
    })
    writeFileSync(dxvkFile(), 'v1')
  }

  test('G30: a healthy-CrossOver restore stops the CrossOver wineserver once afterwards', async () => {
    dxvkSrcDir()
    restoring(true)
    await run(crossover)
    const cxKills = deps.killWith.mock.calls.filter(
      (c) => c[1] === `${BIN_DIR}/wineserver`
    )
    expect(cxKills).toHaveLength(1)
    expect(cxKills[0][2]).toEqual({
      CX_ROOT: '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver'
    })
    expect(deps.killWith.mock.invocationCallOrder[0]).toBeGreaterThan(
      (deps.installRemove as jest.Mock).mock.invocationCallOrder[0]
    )
  })

  test('G30: the CrossOver wineserver is stopped after a failed restore too', async () => {
    dxvkSrcDir()
    restoring(false)
    const res = await run(crossover)
    expect(res).toMatchObject({ ok: false, reason: 'dxvk-failed' })
    expect(
      deps.killWith.mock.calls.filter((c) => c[1] === `${BIN_DIR}/wineserver`)
    ).toHaveLength(1)
  })

  test('G30: the unhealthy branch keeps its single built-in stop and no CrossOver stop', async () => {
    seedPinnedMarker()
    restoring(true)
    await prepareBottleForEngine({
      appId: '620',
      bottleName: NAME,
      next: crossover,
      crossoverHealthy: false,
      deps
    })
    expect(deps.killWith).toHaveBeenCalledTimes(1)
    expect(deps.killWith.mock.calls[0][1]).toBe(PIN_WS)
  })

  const deferred = () => {
    let resolve!: (v: boolean) => void
    const promise = new Promise<boolean>((r) => (resolve = r))
    return { promise, resolve }
  }
  const tick = () => new Promise((r) => setImmediate(r))

  test('WR-02: concurrent same-bottle switches run installRemove once', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    const gate = deferred()
    ;(deps.installRemove as jest.Mock).mockImplementation(
      async (_s, _t, action) => {
        await gate.promise
        if (action === 'backup') writeFileSync(dxvkFile(), 'v1')
        return true
      }
    )
    const first = run(pinned)
    const second = run(pinned)
    await tick()
    expect(deps.installRemove).toHaveBeenCalledTimes(1)
    expect(deps.killWith).toHaveBeenCalledTimes(1)
    gate.resolve(true)
    expect(await first).toEqual({ ok: true, changed: true })
    expect(await second).toEqual({ ok: true, changed: false })
    expect(deps.installRemove).toHaveBeenCalledTimes(1)
    expect(marker().id).toBe('wine-staging-11.20')
  })

  test('WR-02: different bottles are independent', async () => {
    const other = 'GameLibSteamBridge-730'
    mkdirSync(join(mockState.root, other))
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    writeFileSync(
      join(mockState.root, other, ENGINE_MARKER_FILE),
      JSON.stringify({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    )
    const gate = deferred()
    ;(deps.installRemove as jest.Mock).mockImplementation(async () => {
      await gate.promise
      return true
    })
    const a = run(pinned)
    const b = prepareBottleForEngine({
      appId: '730',
      bottleName: other,
      next: pinned,
      deps
    })
    await tick()
    expect(deps.installRemove).toHaveBeenCalledTimes(2)
    gate.resolve(true)
    await Promise.all([a, b])
  })

  test('WR-02: a rejected first switch does not block the second or later calls', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    const gate = deferred()
    ;(deps.installRemove as jest.Mock).mockImplementationOnce(async () => {
      await gate.promise
      throw new Error('boom')
    })
    const first = run(pinned)
    const second = run(pinned)
    const firstSettled = first.catch((e) => e)
    gate.resolve(true)
    expect((await firstSettled).message).toBe('boom')
    // the second ran after the first rejected and was not blocked by it
    await expect(second).resolves.toBeDefined()
    const third = await Promise.race([
      run(pinned),
      new Promise((r) => setTimeout(() => r('hung'), 500).unref())
    ])
    expect(third).not.toBe('hung')
  })
})
