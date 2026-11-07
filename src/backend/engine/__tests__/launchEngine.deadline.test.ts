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
jest.mock('../engineDialogs', () => ({
  showEngineDialog: jest.fn(),
  notifyEngineFallback: jest.fn()
}))
jest.mock('../bottlePrimitives', () => ({
  isBottleProvisioned: jest.fn(),
  killBottleWineServerWith: jest.fn(),
  getBottleDir: (name: string) => `/b/${name}`,
  sanitizeBottleName: (name: string) => name
}))

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
import { showEngineDialog } from '../engineDialogs'
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
    showDialog: jest.fn()
  }
}

beforeEach(() => {
  jest.useFakeTimers()
  __resetLaunchEngineForTests()
  __resetLaunchOverlayForTests()
  __resetBottleLedgerForTests()
  ;(killBottleWineServerWith as jest.Mock).mockClear()
  clearEngineSelection(KEY)
})
afterEach(() => {
  cancelLaunchDeadline(KEY, 'superseded')
  jest.useRealTimers()
})

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
    armEngineLaunchDeadline(makeGame(), KEY, d)
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
    armEngineLaunchDeadline(makeGame(), KEY, d)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(d.watch).not.toHaveBeenCalled()
  })

  it('does nothing without an overlay context (legacy, skip)', () => {
    const d = deps()
    armEngineLaunchDeadline(makeGame(), KEY, d)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(d.watch).not.toHaveBeenCalled()
  })

  it('stands the deadline down when no signal is derivable', () => {
    setUp(CX)
    const d = deps(null)
    armEngineLaunchDeadline(makeGame(), KEY, d)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(
      (logInfo as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('monitor-unavailable')
      )
    ).toBe(true)
    jest.advanceTimersByTime(200_000)
    expect(killBottleWineServerWith).not.toHaveBeenCalled()
  })

  it('on expiry shows a no-kill notice and keeps the launch held', async () => {
    setUp(CX)
    const watcher = { stop: jest.fn() }
    const d = deps(watcher)
    const game = makeGame()
    armEngineLaunchDeadline(game, KEY, d)
    markGameRunning('GameLib-legendary-Quail', KEY)
    await jest.advanceTimersByTimeAsync(180_000)
    expect(watcher.stop).toHaveBeenCalled()
    expect(killBottleWineServerWith).not.toHaveBeenCalled()
    expect(game.stop).not.toHaveBeenCalled()
    expect(d.showDialog).toHaveBeenCalledTimes(1)
    const dialog = d.showDialog.mock.calls[0]?.[0] as {
      title: string
      body: string
      ackId: string
    }
    expect(dialog.title).toContain('gamelib:steam.engine.notDetected.title')
    expect(dialog.body).toContain('"seconds":180')
    expect(dialog.ackId).toBe('launch-deadline-unconfirmed')
    expect(getEngineSelection(KEY)).toBeDefined()
    expect(gamesRunningIn('GameLib-legendary-Quail')).toContain(KEY)
  })

  it('CR-03: a deadline in a busy shared bottle never touches the neighbour', async () => {
    expect(setEngineSelection(KEY, PINNED)).toBe(true)
    setLaunchOverlayContext(KEY, {
      prefix: { kind: 'bottle', bottleName: 'GameLib' }
    })
    markGameRunning('GameLib', 'gog:A')
    const other = makeGame()
    const d = deps()
    armEngineLaunchDeadline(makeGame(), KEY, d)
    await jest.advanceTimersByTimeAsync(180_000)
    expect(killBottleWineServerWith).not.toHaveBeenCalled()
    expect(other.stop).not.toHaveBeenCalled()
    expect(gamesRunningIn('GameLib')).toContain('gog:A')
    expect(showEngineDialog).not.toHaveBeenCalled()
  })

  it('WR-01: a watcher that gives up stands the deadline down', async () => {
    setUp(CX)
    const d = deps()
    armEngineLaunchDeadline(makeGame(), KEY, d)
    const args = (
      d.watch.mock.calls[0] as unknown as [
        { onGiveUp: (reason: string) => void; bottleDir: string }
      ]
    )[0]
    expect(args.bottleDir).toBe('/b/GameLib-legendary-Quail')
    args.onGiveUp('listing-failures')
    expect(__activeLaunchDeadlineCount()).toBe(0)
    await jest.advanceTimersByTimeAsync(200_000)
    expect(d.showDialog).not.toHaveBeenCalled()
  })

  it('endEngineLaunch cancels the deadline and stops the watcher', () => {
    setUp(CX)
    const watcher = { stop: jest.fn() }
    const d = deps(watcher)
    armEngineLaunchDeadline(makeGame(), KEY, d)
    endEngineLaunch(KEY)
    expect(watcher.stop).toHaveBeenCalled()
    expect(__activeLaunchDeadlineCount()).toBe(0)
  })
})
