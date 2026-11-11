/**
 * Plan 61-16 (D-18): arming and firing the non-Steam launch deadline.
 */
jest.mock('i18next', () => ({
  __esModule: true,
  t: (key: string, _fallback?: string, opts?: Record<string, unknown>) =>
    opts ? `${key}|${JSON.stringify(opts)}` : key
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
jest.mock('backend/platform', () => {
  const actual = jest.requireActual('backend/platform')
  return {
    ...actual,
    app: {
      ...actual.app,
      getPath: () => '/tmp/gamelib-test',
      raiseMainWindow: jest.fn()
    }
  }
})
jest.mock('backend/dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn()),
  showDialogBoxModalAuto: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))
jest.mock('backend/dialog/displayAck', () => ({
  newDialogAckId: jest.fn(),
  trackDialogDisplay: jest.fn()
}))
jest.mock('../engineDialogs', () => ({
  ...jest.requireActual('../engineDialogs'),
  showEngineDialog: jest.fn(),
  notifyEngineFallback: jest.fn()
}))
jest.mock('../bottlePrimitives', () => ({
  isBottleProvisioned: jest.fn(),
  killBottleWineServerWith: jest.fn(),
  getBottleDir: (name: string) => `/b/${name}`,
  sanitizeBottleName: (name: string) => name
}))

import { createTestHostServices } from 'backend/testUtils/testHostServices'
import type { Game } from 'common/types/game_manager'
import {
  __resetLaunchEngineForTests,
  armEngineLaunchDeadline,
  endEngineLaunch
} from '../launchEngine'
import {
  __activeLaunchDeadlineCount,
  cancelLaunchDeadline
} from '../launchDeadline'
import { logInfo } from 'backend/logger'
import {
  clearEngineSelection,
  getEngineSelection,
  setEngineSelection
} from '../engineRegistry'
import {
  __resetLaunchOverlayForTests,
  setLaunchOverlayContext
} from '../launchSettings'
import type { EngineSelection } from '../engineTypes'
import { killBottleWineServerWith } from '../bottlePrimitives'
import { showEngineDialog, showEngineNotice } from '../engineDialogs'
import { app } from 'backend/platform'
import { createTestEngineServices } from 'backend/testUtils/testServices'
import type { EngineServices } from '../engineServices'
import { notify, showDialogBoxModalAuto } from 'backend/dialog/dialog'
import {
  __resetBottleLedgerForTests,
  gamesRunningIn,
  markGameRunning
} from '../bottleLedger'

const KEY = 'legendary:Quail'
const CX: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: '1',
  binDir: '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
}
const PINNED: EngineSelection = {
  kind: 'pinned',
  pinId: 'p',
  reason: 'cx-missing',
  wineBin: '/pin/bin/wine64',
  wineserverBin: '/pin/bin/wineserver',
  label: 'Wine Staging',
  version: '1',
  dxvk: null
}

function makeGame(): Game & { stop: jest.Mock } {
  return {
    getGameInfo: () => ({
      title: 'Quail',
      app_name: 'Quail',
      runner: 'legendary',
      install: { install_path: '/Users/u/Games/Quail' }
    }),
    stop: jest.fn().mockResolvedValue(undefined)
  } as unknown as Game & { stop: jest.Mock }
}

function deps(watcher: { stop(): void } | null = { stop: jest.fn() }) {
  return {
    watch: jest.fn(() => watcher),
    publishNotice: jest.fn(() => true)
  }
}

beforeEach(() => {
  jest.useFakeTimers()
  __resetLaunchEngineForTests()
  __resetLaunchOverlayForTests()
  __resetBottleLedgerForTests()
  ;(killBottleWineServerWith as jest.Mock).mockClear()
  ;(notify as jest.Mock).mockClear()
  ;(app.raiseMainWindow as jest.Mock).mockClear()
  ;(showDialogBoxModalAuto as jest.Mock).mockClear()
  ;(showEngineDialog as jest.Mock).mockClear()
  clearEngineSelection(KEY)
})
afterEach(() => {
  cancelLaunchDeadline(KEY, 'superseded')
  jest.useRealTimers()
})

const services: EngineServices = {
  spawnAsync: jest.fn(),
  installRemove: jest.fn(),
  wineManagerReleases: () => [],
  runner: createTestEngineServices().runner,
  notices: createTestHostServices()
}

function setUp(sel: EngineSelection, kind: 'bottle' | 'plain' = 'bottle') {
  expect(setEngineSelection(KEY, sel)).toBe(true)
  setLaunchOverlayContext(
    KEY,
    kind === 'bottle'
      ? { prefix: { kind: 'bottle', bottleName: 'GameLib-legendary-Quail' } }
      : { prefix: { kind: 'plain' } }
  )
}

describe('armEngineLaunchDeadline', () => {
  it('arms one deadline and one watcher; first match cancels it', () => {
    setUp(CX)
    const d = deps()
    armEngineLaunchDeadline(services, makeGame(), KEY, d)
    expect(__activeLaunchDeadlineCount()).toBe(1)
    expect(d.watch).toHaveBeenCalledTimes(1)
    expect(d.watch.mock.calls[0]).toBeDefined()
    const args = (
      d.watch.mock.calls[0] as unknown as [
        { installPath: string; onFirstMatch: (pid: string) => void }
      ]
    )[0]
    expect(args.installPath).toBe('/Users/u/Games/Quail')
    args.onFirstMatch('1')
    expect(__activeLaunchDeadlineCount()).toBe(0)
    jest.advanceTimersByTime(200_000)
    expect(killBottleWineServerWith).not.toHaveBeenCalled()
  })

  it('does nothing for a plain prefix', () => {
    setUp(PINNED, 'plain')
    const d = deps()
    armEngineLaunchDeadline(services, makeGame(), KEY, d)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(d.watch).not.toHaveBeenCalled()
  })

  it('does nothing without an overlay context (legacy, skip)', () => {
    const d = deps()
    armEngineLaunchDeadline(services, makeGame(), KEY, d)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(d.watch).not.toHaveBeenCalled()
  })

  it('stands the deadline down when no signal is derivable', () => {
    setUp(CX)
    const d = deps(null)
    armEngineLaunchDeadline(services, makeGame(), KEY, d)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(
      (logInfo as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('monitor-unavailable')
      )
    ).toBe(true)
    jest.advanceTimersByTime(200_000)
    expect(killBottleWineServerWith).not.toHaveBeenCalled()
  })

  it('on expiry shows a no-kill notice without raising the window (WR-02) and keeps the launch held', async () => {
    setUp(CX)
    const watcher = { stop: jest.fn() }
    const d = deps(watcher)
    const game = makeGame()
    armEngineLaunchDeadline(services, game, KEY, d)
    markGameRunning('GameLib-legendary-Quail', KEY)
    await jest.advanceTimersByTimeAsync(180_000)
    expect(watcher.stop).toHaveBeenCalled()
    expect(killBottleWineServerWith).not.toHaveBeenCalled()
    expect(game.stop).not.toHaveBeenCalled()
    expect(app.raiseMainWindow).not.toHaveBeenCalled()
    expect(showDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(showEngineDialog).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
    const note = (notify as jest.Mock).mock.calls[0]?.[0] as {
      title: string
      body: string
    }
    expect(note.title).toContain('gamelib:steam.engine.notDetected.title')
    expect(note.body).toContain('"seconds":180')
    expect(note.body).toContain('Quail')
    expect(d.publishNotice).toHaveBeenCalledTimes(1)
    expect(d.publishNotice).toHaveBeenCalledWith(
      { runner: 'legendary', appName: 'Quail' },
      { title: 'Quail', seconds: 180 }
    )
    expect(getEngineSelection(KEY)).toBeDefined()
    expect(gamesRunningIn('GameLib-legendary-Quail')).toContain(KEY)
  })

  it('CR-03: a deadline in a busy shared bottle never touches the neighbour', async () => {
    expect(setEngineSelection(KEY, PINNED)).toBe(true)
    setLaunchOverlayContext(KEY, {
      prefix: { kind: 'bottle', bottleName: 'GameLib' }
    })
    markGameRunning('GameLib', 'gog:A')
    markGameRunning('GameLib', KEY)
    const game = makeGame()
    const d = deps()
    armEngineLaunchDeadline(services, game, KEY, d)
    await jest.advanceTimersByTimeAsync(180_000)
    // The deadline actually fired, so the "untouched" assertions below are not vacuous.
    expect(d.publishNotice).toHaveBeenCalledTimes(1)
    expect(killBottleWineServerWith).not.toHaveBeenCalled()
    expect(game.stop).not.toHaveBeenCalled()
    expect([...gamesRunningIn('GameLib')].sort()).toEqual(['gog:A', KEY].sort())
    // The deadline is a notice, not a kill: the armed game is not stopped, the bottle's wineserver
    // is not killed, the ledger keeps both keys and the window is not raised.
    expect(showEngineDialog).not.toHaveBeenCalled()
    expect(app.raiseMainWindow).not.toHaveBeenCalled()
  })

  it('WR-01: a watcher that gives up stands the deadline down', async () => {
    setUp(CX)
    const d = deps()
    armEngineLaunchDeadline(services, makeGame(), KEY, d)
    const args = (
      d.watch.mock.calls[0] as unknown as [
        { onGiveUp: (reason: string) => void; bottleDir: string }
      ]
    )[0]
    expect(args.bottleDir).toBe('/b/GameLib-legendary-Quail')
    args.onGiveUp('listing-failures')
    expect(__activeLaunchDeadlineCount()).toBe(0)
    await jest.advanceTimersByTimeAsync(200_000)
    expect(notify).not.toHaveBeenCalled()
    expect(d.publishNotice).not.toHaveBeenCalled()
  })

  it('endEngineLaunch cancels the deadline and stops the watcher', () => {
    setUp(CX)
    const watcher = { stop: jest.fn() }
    const d = deps(watcher)
    armEngineLaunchDeadline(services, makeGame(), KEY, d)
    endEngineLaunch(KEY)
    expect(watcher.stop).toHaveBeenCalled()
    expect(__activeLaunchDeadlineCount()).toBe(0)
  })
})

describe('showEngineNotice', () => {
  it('only notifies and logs raise=false', () => {
    showEngineNotice(
      { notifications: { show: jest.fn() } },
      { key: KEY, title: 'T', body: 'B', ackId: 'x' }
    )
    expect(notify).toHaveBeenCalledTimes(1)
    expect(app.raiseMainWindow).not.toHaveBeenCalled()
    expect(showDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(
      (logInfo as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('raise=false')
      )
    ).toBe(true)
  })
})
