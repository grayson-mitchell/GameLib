import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { GameSettings } from 'common/types'

// `home` is the fake profile; `root` is its Bottles directory, where the twin's real `getBottleDir` puts every
// bottle (the read-only marker views moved into `enginewine/twin.ts` in 87-39, so they no longer see a mock).
const mockState = { home: '', root: '', engines: '/tools/steam-engines' }

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/engine/bottlePrimitives', () => {
  const twin = jest.requireActual('backend/enginewine/twin')
  return {
    getBottleDir: twin.getBottleDir,
    sanitizeBottleName: twin.sanitizeBottleName,
    buildFallbackGameSettings: jest.fn(),
    killBottleWineServerWith: jest.fn()
  }
})
import {
  ENGINE_MARKER_FILE,
  createEngineSwitcher,
  reconcileBottleEngineMarker,
  recordCrossoverBottleEngine,
  recordPinnedBottleEngine,
  readBottleEngineMarkerKind as readKind,
  readBottleEngineMarkerSummary as readSummary,
  restoreNeedsAbsentPin as needsAbsentPin
} from '../engineSwitch'
import type { EngineSwitchContext, EngineSwitchDeps } from '../engineSwitch'
import { createBottleLedger } from '../bottleLedger'
import { writeCxbottleConf } from '../adoptBottle'
import type { EngineSelection } from '../engineTypes'
import { defined } from './defined'
import { createBottleVersionGate } from 'backend/stores/bottleVersionGate'
import { createFakeBottleGateRust } from 'backend/testUtils/fakeBottleGateRust'
import type { FakeBottleGateOptions } from 'backend/testUtils/fakeBottleGateRust'

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
let ctx: EngineSwitchContext
let gateRust: ReturnType<typeof createFakeBottleGateRust>
let ledger: ReturnType<typeof createBottleLedger>
let prepareBottleForEngine: ReturnType<
  typeof createEngineSwitcher
>['prepareBottleForEngine']
const readBottleEngineMarkerKind = (name: string) => readKind(ctx, name)
const readBottleEngineMarkerSummary = (name: string) => readSummary(ctx, name)
const restoreNeedsAbsentPin = (name: string) => needsAbsentPin(ctx, name)

const marker = () =>
  JSON.parse(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8'))
const seedMarker = (m: object) =>
  writeFileSync(join(dir, ENGINE_MARKER_FILE), JSON.stringify(m))

beforeEach(() => {
  mockState.engines = '/tools/steam-engines'
  mockState.home = mkdtempSync(join(tmpdir(), 'gamelib-switch-'))
  mockState.root = join(
    mockState.home,
    'Library/Application Support/CrossOver/Bottles'
  )
  dir = join(mockState.root, NAME)
  mkdirSync(dir, { recursive: true })
  ledger = createBottleLedger()
  gateRust = createFakeBottleGateRust()
  ctx = {
    paths: { userHome: mockState.home, toolsPath: '/tools' },
    fallback: {
      pinnedEngineRoot: () => mockState.engines,
      pinnedEnginePaths: jest.fn(),
      isPinnedEngineInstalled: jest.fn().mockReturnValue(false),
      ensurePinnedEngine: jest.fn()
    },
    ledger,
    // The marker gate answers from the real marker file, as Rust's version_gate does (D-17).
    requestRustInvoke: gateRust.requestRustInvoke,
    bottleGate: createBottleVersionGate()
  }
  prepareBottleForEngine = createEngineSwitcher().prepareBottleForEngine
  deps = {
    ctx,
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
afterEach(() => rmSync(mockState.home, { recursive: true, force: true }))

const run = (next: EngineSelection) =>
  prepareBottleForEngine({ key: '620', bottleName: NAME, next, deps })

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
      dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' },
      version: 1
    })
  })

  test('WR-01 re-review: wine-manager marker + same wine-manager selection is a no-op', async () => {
    seedMarker({
      kind: 'wine-manager',
      id: 'Wine-Staging-macOS-11.18',
      wineserverBin: '/tools/wine/Wine-Staging-macOS-11.18/bin/wineserver'
    })
    const before = readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')
    const res = await run({
      kind: 'wine-manager',
      managerVersion: 'Wine-Staging-macOS-11.18',
      reason: 'cx-inconclusive',
      wineBin: '/tools/wine/Wine-Staging-macOS-11.18/bin/wine',
      wineserverBin: '/tools/wine/Wine-Staging-macOS-11.18/bin/wineserver',
      label: 'Wine Manager',
      version: '11.18',
      dxvk: null
    })
    expect(res).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')).toBe(before)
  })

  test('WR-01 re-review: retired-pin marker + same pinned selection is a no-op', async () => {
    const ws =
      '/tools/steam-engines/wine-staging-retired/Contents/Resources/wine/bin/wineserver'
    seedMarker({
      kind: 'pinned',
      id: 'wine-staging-retired',
      wineserverBin: ws
    })
    const before = readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')
    const res = await run({
      kind: 'pinned',
      pinId: 'wine-staging-retired',
      reason: 'cx-inconclusive',
      wineBin: ws.replace(/wineserver$/, 'wine'),
      wineserverBin: ws,
      label: 'Built-in engine wine-staging-retired (retired pin)',
      version: 'wine-staging-retired',
      dxvk: null
    })
    expect(res).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')).toBe(before)
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
    expect(defined(deps.killWith.mock.calls[0], 'first killWith call')[1]).toBe(
      `${BIN_DIR}/wineserver`
    )
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
      key: '620',
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
      key: '620',
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
      key: '620',
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
    const resolveOrder = defined(
      deps.ensurePinEngine.mock.invocationCallOrder[0],
      'ensurePinEngine call order'
    )
    expect(resolveOrder).toBeLessThan(
      defined(deps.killWith.mock.invocationCallOrder[0], 'killWith call order')
    )
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
    expect(defined(deps.killWith.mock.calls[0], 'first killWith call')[1]).toBe(
      `${BIN_DIR}/wineserver`
    )
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
      dxvk: 'failed',
      version: 1
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

  test('WR-01 re-review: readBottleEngineMarkerSummary exposes wine-manager version and a contained pin wineserver', () => {
    const retired =
      '/tools/steam-engines/wine-staging-retired/Contents/Resources/wine/bin/wineserver'
    seed({
      kind: 'wine-manager',
      id: 'Wine-Staging-macOS-11.18',
      wineserverBin: '/x/wineserver'
    })
    expect(readBottleEngineMarkerSummary(NAME)).toEqual({
      kind: 'non-crossover',
      pinId: null,
      wineManagerVersion: 'Wine-Staging-macOS-11.18',
      pinWineserverBin: null
    })
    seed({ kind: 'pinned', id: 'wine-staging-retired', wineserverBin: retired })
    expect(readBottleEngineMarkerSummary(NAME)).toEqual({
      kind: 'non-crossover',
      pinId: 'wine-staging-retired',
      wineManagerVersion: null,
      pinWineserverBin: retired
    })
    seed({
      kind: 'pinned',
      id: 'wine-staging-retired',
      wineserverBin: '/elsewhere/bin/wineserver'
    })
    expect(readBottleEngineMarkerSummary(NAME)?.pinWineserverBin).toBeNull()
    seed({
      kind: 'pinned',
      id: 'wine-staging-retired',
      wineserverBin: '/tools/steam-engines/wine-staging-retired/bin/wine'
    })
    expect(readBottleEngineMarkerSummary(NAME)?.pinWineserverBin).toBeNull()
    seed({ kind: 'crossover', id: 'cx', wineserverBin: 'x' })
    expect(readBottleEngineMarkerSummary(NAME)).toMatchObject({
      kind: 'crossover',
      wineManagerVersion: null,
      pinWineserverBin: null
    })
    const bytes = readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')
    readBottleEngineMarkerSummary(NAME)
    expect(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')).toBe(bytes)
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

  test('76 review WR-01: a crossover marker contradicted by DXVK-macOS reads as the pin in every view, without writing or logging', () => {
    const logs = jest.requireMock('backend/logger')
    logs.logWarning.mockClear()
    seed({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    writeFileSync(join(dir, 'current_dxvk-macOS'), 'v1')
    const bytes = readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')
    expect(readBottleEngineMarkerKind(NAME)).toBe('non-crossover')
    expect(readBottleEngineMarkerSummary(NAME)).toEqual({
      kind: 'non-crossover',
      pinId: 'wine-staging-11.20',
      wineManagerVersion: null,
      pinWineserverBin: null
    })
    // The switch would restore from the current pin, which is not installed.
    expect(restoreNeedsAbsentPin(NAME)).toBe(true)
    ;(ctx.fallback.isPinnedEngineInstalled as jest.Mock).mockReturnValue(true)
    expect(restoreNeedsAbsentPin(NAME)).toBe(false)
    expect(readFileSync(join(dir, ENGINE_MARKER_FILE), 'utf8')).toBe(bytes)
    expect(logs.logWarning).not.toHaveBeenCalled()
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
    expect(defined(cxKills[0], 'cxKills[0]')[2]).toEqual({
      CX_ROOT: '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver'
    })
    expect(
      defined(deps.killWith.mock.invocationCallOrder[0], 'killWith call order')
    ).toBeGreaterThan(
      defined(
        (deps.installRemove as jest.Mock).mock.invocationCallOrder[0],
        'installRemove call order'
      )
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
      key: '620',
      bottleName: NAME,
      next: crossover,
      crossoverHealthy: false,
      deps
    })
    expect(deps.killWith).toHaveBeenCalledTimes(1)
    expect(defined(deps.killWith.mock.calls[0], 'first killWith call')[1]).toBe(
      PIN_WS
    )
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
      key: '730',
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

describe('prepareBottleForEngine D-16 bottle-busy', () => {
  const runKey = (
    next: EngineSelection,
    over: Partial<EngineSwitchDeps> = {}
  ) =>
    prepareBottleForEngine({
      key: 'legendary:A',
      bottleName: NAME,
      next,
      deps: { ...deps, ownBottleName: undefined, ...over }
    })

  test('another game running in the bottle refuses an engine change and kills nothing', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    ledger.markGameRunning(NAME, 'gog:1')
    const res = await runKey(pinned)
    expect(res).toMatchObject({ ok: false, reason: 'bottle-busy' })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(marker().kind).toBe('crossover')
  })

  test('an idle non-Steam shared bottle switches (no shared-bottle refusal)', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    const res = await runKey(pinned)
    expect(res).toEqual({ ok: true, changed: true })
    expect(deps.killWith).toHaveBeenCalled()
    expect(marker().kind).toBe('pinned')
  })

  test('marker already matching: no change and no kill even with another game running', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    ledger.markGameRunning(NAME, 'gog:1')
    const res = await runKey(crossover)
    expect(res).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
  })

  test('Steam deps still refuse a shared bottle', async () => {
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    const res = await runKey(pinned, { ownBottleName: () => 'Other' })
    expect(res).toMatchObject({ ok: false, reason: 'shared-bottle' })
  })

  test('crossoverSettings is a required dep', () => {
    const call = () =>
      prepareBottleForEngine({
        key: '1',
        bottleName: NAME,
        next: pinned,
        // @ts-expect-error crossoverSettings missing
        deps: {}
      })
    expect(typeof call).toBe('function')
  })
})

describe('marker versioning (261109-w52)', () => {
  const file = () => join(dir, ENGINE_MARKER_FILE)
  const bytes = () => readFileSync(file())
  const dxvkFile = () => join(dir, 'current_dxvk-macOS')
  const legacyPinned = (extra: object = {}) => ({
    kind: 'pinned',
    id: 'wine-staging-11.20',
    wineserverBin: PIN_WS,
    ...extra
  })
  const newer = (extra: object = {}) => ({
    version: 2,
    ...legacyPinned({
      dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
    }),
    ...extra
  })
  let stderr: jest.SpyInstance
  beforeEach(() => {
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => stderr.mockRestore())

  const expectNoSideEffects = () => {
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(deps.ensurePinEngine).not.toHaveBeenCalled()
  }

  test('legacy pinned marker restores DXVK from the recorded dir and stamps version 1', async () => {
    seedMarker(
      legacyPinned({
        dxvk: { dir: '/tools/steam-engines/dxvk', version: 'v1' }
      })
    )
    writeFileSync(dxvkFile(), 'v1')
    ;(deps.installRemove as jest.Mock).mockImplementation(async () => {
      rmSync(dxvkFile(), { force: true })
      return true
    })
    expect(await run(crossover)).toEqual({ ok: true, changed: true })
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      expect.anything()
    )
    expect(marker()).toMatchObject({ kind: 'crossover', version: 1 })
  })

  test('legacy marker + same engine is a no-op: no restamp, no extra files', async () => {
    seedMarker(legacyPinned())
    const before = bytes()
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(bytes().equals(before)).toBe(true)
    expect(readdirSync(dir)).toEqual([ENGINE_MARKER_FILE])
  })

  test('legacy marker read-only accessors are unchanged', () => {
    seedMarker(legacyPinned())
    expect(readBottleEngineMarkerKind(NAME)).toBe('non-crossover')
    expect(bytes().toString()).toBe(JSON.stringify(legacyPinned()))
  })

  test('newer marker + same engine proceeds with no write', async () => {
    seedMarker(newer())
    const before = bytes()
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(bytes().equals(before)).toBe(true)
    expectNoSideEffects()
  })

  test('newer marker + switch to crossover is refused before any kill or DXVK step', async () => {
    seedMarker(newer())
    const before = bytes()
    const onSwitching = jest.fn()
    const res = await prepareBottleForEngine({
      key: '620',
      bottleName: NAME,
      next: crossover,
      deps,
      onSwitching
    })
    expect(res).toMatchObject({ ok: false, reason: 'marker-newer' })
    expectNoSideEffects()
    expect(onSwitching).not.toHaveBeenCalled()
    expect(bytes().equals(before)).toBe(true)
    expect(readdirSync(dir)).toEqual([ENGINE_MARKER_FILE])
  })

  test('newer marker with dxvk failed + same pinned selection is refused', async () => {
    seedMarker(newer({ dxvk: 'failed' }))
    const before = bytes()
    expect(await run(pinned)).toMatchObject({
      ok: false,
      reason: 'marker-newer'
    })
    expect(deps.installRemove).not.toHaveBeenCalled()
    expect(bytes().equals(before)).toBe(true)
  })

  /** The same switch, with the marker gate answered by `options` instead of by the marker file. */
  const withGate = (options: FakeBottleGateOptions) => {
    const rust = createFakeBottleGateRust(options)
    const gated: EngineSwitchContext = {
      ...ctx,
      requestRustInvoke: rust.requestRustInvoke,
      bottleGate: createBottleVersionGate()
    }
    return { rust, gated, gatedDeps: { ...deps, ctx: gated } }
  }

  test('the gate is asked about the bottle marker, by its path and chain, before it is read or written', async () => {
    seedMarker(legacyPinned())
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(gateRust.calls).toEqual([
      {
        channel: 'store_version_gate',
        args: [{ path: file(), chain: 'engine/gamelib-engine-marker' }]
      }
    ])
  })

  test('Rust decides newer, not the marker bytes: a gate answering newer refuses a change though the file carries no version', async () => {
    seedMarker(legacyPinned())
    const before = bytes()
    const { gatedDeps } = withGate({ answer: 'newer' })
    const res = await prepareBottleForEngine({
      key: '620',
      bottleName: NAME,
      next: crossover,
      deps: gatedDeps
    })
    expect(res).toMatchObject({ ok: false, reason: 'marker-newer' })
    expectNoSideEffects()
    expect(bytes().equals(before)).toBe(true)
  })

  test('an unreadable marker is still writable, as the TS engine left it', async () => {
    writeFileSync(file(), '{torn')
    const { gatedDeps } = withGate({})
    expect(
      await prepareBottleForEngine({
        key: '620',
        bottleName: NAME,
        next: pinned,
        deps: gatedDeps
      })
    ).toMatchObject({ ok: true })
    expect(marker()).toMatchObject({ kind: 'pinned', version: 1 })
  })

  test('a gate Rust cannot answer is read as newer: the same engine proceeds, a change is refused, nothing is written', async () => {
    seedMarker(legacyPinned())
    const before = bytes()
    const { gatedDeps } = withGate({ rejectGate: true })
    expect(
      await prepareBottleForEngine({
        key: '620',
        bottleName: NAME,
        next: pinned,
        deps: gatedDeps
      })
    ).toEqual({ ok: true, changed: false })
    expect(
      await prepareBottleForEngine({
        key: '620',
        bottleName: NAME,
        next: crossover,
        deps: gatedDeps
      })
    ).toMatchObject({ ok: false, reason: 'marker-newer' })
    expectNoSideEffects()
    expect(bytes().equals(before)).toBe(true)
  })

  test('the creation-time recorders and reconcile prime the gate themselves, and a newer answer stops them', async () => {
    writeFileSync(join(dir, 'cxbottle.conf'), '"Timestamp" = "x"\n')
    const { rust, gated } = withGate({ answer: 'newer' })
    expect(await recordCrossoverBottleEngine(gated, NAME, BIN_DIR)).toBe(false)
    expect(
      await recordPinnedBottleEngine(gated, NAME, 'wine-staging-11.20', {
        ...pinEngine
      })
    ).toBe(false)
    expect(await reconcileBottleEngineMarker(gated, NAME)).toBeNull()
    expect(existsSync(file())).toBe(false)
    expect(rust.calls.map((c) => c.channel)).toEqual([
      'store_version_gate',
      'store_version_gate',
      'store_version_gate'
    ])
  })

  test('newer marker in an unrecognised shape refuses every selection and is never inferred over', async () => {
    seedMarker({ version: 2, engine: { name: 'x' } })
    const before = bytes()
    expect(await run(crossover)).toMatchObject({ reason: 'marker-newer' })
    expect(await run(pinned)).toMatchObject({ reason: 'marker-newer' })
    expectNoSideEffects()
    expect(bytes().equals(before)).toBe(true)
    expect(readBottleEngineMarkerKind(NAME)).toBeNull()
  })
})

describe('76 gap: marker-less pinned bottle (CR-01)', () => {
  const TS = '"Timestamp" = "20260715T103801Z"\n'
  const confPath = () => join(dir, 'cxbottle.conf')
  const dxvkFile = () => join(dir, 'current_dxvk-macOS')
  const markerFile = () => join(dir, ENGINE_MARKER_FILE)
  const logs = () => jest.requireMock('backend/logger')
  let pinWs: string
  let engineDxvk: { dir: string; version: string }

  const layBottle = (withDxvk: boolean) => {
    writeFileSync(join(dir, 'system.reg'), '')
    expect(writeCxbottleConf(dir)).toBe(true)
    if (withDxvk) writeFileSync(dxvkFile(), 'v1')
  }
  const addTimestamp = () =>
    writeFileSync(confPath(), readFileSync(confPath(), 'utf8') + TS)
  const removeOnRestore = () =>
    (deps.installRemove as jest.Mock).mockImplementation(
      async (_s, _t, action) => {
        if (action === 'restore') rmSync(dxvkFile(), { force: true })
        return true
      }
    )
  const sawInfo = (text: string) =>
    expect(
      logs().logInfo.mock.calls.map((c: unknown[]) => String(c[0]))
    ).toEqual(expect.arrayContaining([expect.stringContaining(text)]))
  const seedNewer = () =>
    seedMarker({
      version: 2,
      kind: 'pinned',
      id: 'wine-staging-11.20',
      wineserverBin: PIN_WS
    })

  beforeEach(() => {
    logs().logInfo.mockClear()
    logs().logWarning.mockClear()
    const engines = join(mockState.root, 'engines')
    pinWs = join(engines, 'wine-staging-11.20', 'bin', 'wineserver')
    mkdirSync(join(engines, 'wine-staging-11.20', 'bin'), { recursive: true })
    writeFileSync(pinWs, '')
    mockState.engines = engines
    engineDxvk = { dir: join(engines, 'dxvk'), version: 'v1' }
    const paths = {
      wineBin: join(engines, 'wine-staging-11.20', 'bin', 'wine'),
      wineserverBin: pinWs,
      dxvkDir: engineDxvk.dir
    }
    ;(ctx.fallback.pinnedEnginePaths as jest.Mock).mockReturnValue(paths)
    ;(ctx.fallback.isPinnedEngineInstalled as jest.Mock).mockReturnValue(true)
    deps.currentPinEngine.mockReturnValue({
      wineBin: paths.wineBin,
      wineserverBin: pinWs,
      label: 'Pinned',
      version: '11.20',
      dxvk: engineDxvk
    })
    removeOnRestore()
  })

  test('CR-01: a marker-less Staging bottle whose conf gained CrossOver Timestamp is switched to crossover', async () => {
    layBottle(true)
    addTimestamp()
    expect(await run(crossover)).toEqual({ ok: true, changed: true })
    expect(deps.killWith).toHaveBeenCalledWith(
      NAME,
      pinWs,
      { USER: 'crossover' },
      15_000
    )
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      expect.anything()
    )
    expect(existsSync(dxvkFile())).toBe(false)
    expect(marker().kind).toBe('crossover')
    sawInfo(
      'engine switch for "GameLibSteamBridge-620": pinned:wine-staging-11.20 -> crossover'
    )
  })

  test('hardened inference: DXVK-macOS beats a Timestamp (pinned, no-op)', async () => {
    layBottle(true)
    addTimestamp()
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(marker()).toMatchObject({ kind: 'pinned', id: 'wine-staging-11.20' })
  })

  test('contradicted crossover marker: next crossover switches with a restore', async () => {
    layBottle(true)
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    expect(await run(crossover)).toMatchObject({ ok: true, changed: true })
    expect(deps.installRemove).toHaveBeenCalledWith(
      expect.anything(),
      'dxvk',
      'restore',
      expect.anything()
    )
    expect(
      logs().logWarning.mock.calls.map((c: unknown[]) => String(c[0]))
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('says crossover but DXVK-macOS is installed')
      ])
    )
  })

  test('contradicted crossover marker: next pinned is a no-op that rewrites the marker', async () => {
    layBottle(true)
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
    expect(marker().kind).toBe('pinned')
  })

  test('a crossover marker without DXVK-macOS stays a no-op', async () => {
    layBottle(false)
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    expect(await run(crossover)).toEqual({ ok: true, changed: false })
  })

  test('reconcile before the Timestamp appears still lets the switch reach crossover', async () => {
    layBottle(false)
    expect(await reconcileBottleEngineMarker(ctx, NAME)).toBe('pinned')
    expect(marker().id).toBe('wine-staging-11.20')
    addTimestamp()
    expect(await run(crossover)).toMatchObject({ ok: true, changed: true })
    expect(deps.killWith).toHaveBeenCalledWith(
      NAME,
      pinWs,
      { USER: 'crossover' },
      15_000
    )
    sawInfo(
      'engine switch for "GameLibSteamBridge-620": pinned:wine-staging-11.20 -> crossover'
    )
  })

  test('76 review WR-02: a marker reconciled while the pin was absent still stops the pin wineserver once it is installed', async () => {
    layBottle(false)
    ;(ctx.fallback.isPinnedEngineInstalled as jest.Mock).mockReturnValue(false)
    expect(await reconcileBottleEngineMarker(ctx, NAME)).toBe('pinned')
    expect(marker().wineserverBin).toBe('')
    ;(ctx.fallback.isPinnedEngineInstalled as jest.Mock).mockReturnValue(true)
    addTimestamp()
    expect(await run(crossover)).toMatchObject({ ok: true, changed: true })
    expect(deps.killWith).toHaveBeenCalledWith(
      NAME,
      pinWs,
      { USER: 'crossover' },
      15_000
    )
    expect(
      logs().logWarning.mock.calls.map((c: unknown[]) => String(c[0]))
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('outside the engine roots')
      ])
    )
  })

  test('reconcile of a contradicted crossover marker persists pinned', async () => {
    layBottle(true)
    seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
    expect(await reconcileBottleEngineMarker(ctx, NAME)).toBe('pinned')
    expect(marker().kind).toBe('pinned')
    sawInfo('reconciled before the CrossOver pre-flight')
  })

  describe('reconcile returns null and writes nothing', () => {
    test('trusted marker', async () => {
      layBottle(false)
      seedMarker({ kind: 'crossover', id: 'crossover', wineserverBin: '' })
      const before = readFileSync(markerFile())
      expect(await reconcileBottleEngineMarker(ctx, NAME)).toBeNull()
      expect(readFileSync(markerFile()).equals(before)).toBe(true)
    })
    test('newer-build marker', async () => {
      layBottle(true)
      seedNewer()
      const before = readFileSync(markerFile())
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      expect(await reconcileBottleEngineMarker(ctx, NAME)).toBeNull()
      stderr.mockRestore()
      expect(readFileSync(markerFile()).equals(before)).toBe(true)
    })
    test('unsafe name', async () => {
      expect(await reconcileBottleEngineMarker(ctx, '../x')).toBeNull()
    })
    test('missing bottle dir', async () => {
      expect(await reconcileBottleEngineMarker(ctx, 'Nope-1')).toBeNull()
    })
    test('no cxbottle.conf', async () => {
      expect(await reconcileBottleEngineMarker(ctx, NAME)).toBeNull()
      expect(existsSync(markerFile())).toBe(false)
    })
  })

  test('no Timestamp and no DXVK-macOS infers pinned (CrossOver create always writes Timestamp)', async () => {
    layBottle(false)
    expect(await reconcileBottleEngineMarker(ctx, NAME)).toBe('pinned')
    expect(await run(pinned)).toEqual({ ok: true, changed: false })
    expect(deps.killWith).not.toHaveBeenCalled()
  })

  describe('recordCrossoverBottleEngine', () => {
    test('writes a crossover marker the switch then trusts', async () => {
      expect(await recordCrossoverBottleEngine(ctx, NAME, BIN_DIR)).toBe(true)
      expect(readBottleEngineMarkerKind(NAME)).toBe('crossover')
      expect(marker().wineserverBin).toBe(`${BIN_DIR}/wineserver`)
      expect(await run(crossover)).toEqual({ ok: true, changed: false })
      sawInfo('recorded at creation: crossover')
    })
    test('rejects an unsafe name', async () => {
      expect(await recordCrossoverBottleEngine(ctx, '../x', BIN_DIR)).toBe(
        false
      )
    })
    test('leaves a newer-build marker byte-identical', async () => {
      seedNewer()
      const before = readFileSync(markerFile())
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      expect(await recordCrossoverBottleEngine(ctx, NAME, BIN_DIR)).toBe(false)
      stderr.mockRestore()
      expect(readFileSync(markerFile()).equals(before)).toBe(true)
    })
  })

  describe('recordPinnedBottleEngine', () => {
    const engine = () => ({
      wineBin: pinWs.replace('wineserver', 'wine'),
      wineserverBin: pinWs,
      label: 'Pinned',
      version: '11.20',
      dxvk: engineDxvk
    })
    test('records pin id, wineserver and dxvk', async () => {
      writeFileSync(dxvkFile(), 'v1')
      expect(
        await recordPinnedBottleEngine(
          ctx,
          NAME,
          'wine-staging-11.20',
          engine()
        )
      ).toBe(true)
      expect(readBottleEngineMarkerSummary(NAME)).toMatchObject({
        kind: 'non-crossover',
        pinId: 'wine-staging-11.20'
      })
      expect(marker().dxvk).toEqual(engineDxvk)
      sawInfo('recorded at creation: pinned:wine-staging-11.20')
    })
    test('no dxvk key when the engine has none', async () => {
      expect(
        await recordPinnedBottleEngine(ctx, NAME, 'wine-staging-11.20', {
          ...engine(),
          dxvk: null
        })
      ).toBe(true)
      expect('dxvk' in marker()).toBe(false)
    })
    test('rejects an invalid pin id or unsafe name and writes nothing', async () => {
      expect(
        await recordPinnedBottleEngine(ctx, NAME, 'bad id!', engine())
      ).toBe(false)
      expect(
        await recordPinnedBottleEngine(
          ctx,
          '../x',
          'wine-staging-11.20',
          engine()
        )
      ).toBe(false)
      expect(existsSync(markerFile())).toBe(false)
    })
    test('leaves a newer-build marker byte-identical', async () => {
      seedNewer()
      const before = readFileSync(markerFile())
      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      expect(
        await recordPinnedBottleEngine(
          ctx,
          NAME,
          'wine-staging-11.20',
          engine()
        )
      ).toBe(false)
      stderr.mockRestore()
      expect(readFileSync(markerFile()).equals(before)).toBe(true)
    })
  })

  describe('76 review WR-03: a failed marker write is reported, not logged as recorded', () => {
    afterEach(() => chmodSync(dir, 0o755))
    const readOnlyBottle = () => chmodSync(dir, 0o555)
    const sawWriteFailure = () =>
      expect(
        logs().logWarning.mock.calls.map((c: unknown[]) => String(c[0]))
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining('engine marker write failed')
        ])
      )
    const sawNoSuccess = () =>
      expect(
        logs().logInfo.mock.calls.map((c: unknown[]) => String(c[0]))
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/recorded at creation|reconciled before/)
        ])
      )

    test('recordPinnedBottleEngine', async () => {
      readOnlyBottle()
      expect(
        await recordPinnedBottleEngine(ctx, NAME, 'wine-staging-11.20', {
          wineBin: pinWs.replace('wineserver', 'wine'),
          wineserverBin: pinWs,
          label: 'Pinned',
          version: '11.20',
          dxvk: null
        })
      ).toBe(false)
      sawWriteFailure()
      sawNoSuccess()
    })
    test('recordCrossoverBottleEngine', async () => {
      readOnlyBottle()
      expect(await recordCrossoverBottleEngine(ctx, NAME, BIN_DIR)).toBe(false)
      sawWriteFailure()
      sawNoSuccess()
    })
    test('reconcileBottleEngineMarker', async () => {
      layBottle(false)
      readOnlyBottle()
      expect(await reconcileBottleEngineMarker(ctx, NAME)).toBeNull()
      expect(existsSync(markerFile())).toBe(false)
      sawWriteFailure()
      sawNoSuccess()
    })
  })
})
