/**
 * Quick task 260905-mv5 (site 3) — regression test for the Electron
 * `shortcutsExists` IPC handler (`backend/shortcuts/ipc_handler.ts`).
 *
 * `shortcutsExists` re-reads `game.getGameInfo()` itself, exactly like the
 * install-failure surfaces 260905-luf already fixed. Steam's `getGameInfo()`
 * can return `{} as GameInfo` on a double cache miss (D-01, kept as the
 * cross-runner sentinel, not relitigated here). Unlike sites 1/2 (a display
 * string), this site's title feeds a FILESYSTEM PATH component
 * (`shortcutFiles(title)` -> `sanitize-filename` -> a `.app`/`.desktop`/
 * `.lnk` path), so 260905-mv5-PLAN.md's D-03 makes this site return `false`
 * + log a warning instead of fabricating a path from a synthesized fallback
 * title.
 *
 * `shortcutFiles` (from `../shortcuts/shortcuts`) is deliberately left REAL
 * / unmocked — the whole point of this suite is to observe what the real
 * function does when handed an undefined title, per the plan's evidence
 * item 5 (re-verified below).
 *
 * `backend/ipc`'s own `addHandler` is left REAL too: it just delegates to
 * `backend/platform`'s `ipcMain.handle(...)`, which stores the registration
 * in that module's `handlerRegistry` Map — the SAME plain-object registry
 * `shortcutsFlows.test.ts` (site 4) reads from. A jest.fn()-based capture of
 * `addHandler` was tried first and does NOT work here: this project's
 * `resetMocks: true` config wipes every jest mock's recorded calls (and any
 * mockImplementation) before EACH test, including the one-time registration
 * call that only happens once at module-import time — so by the time a test
 * runs, the capture is already gone. `handlerRegistry` is a plain `Map`, not
 * a jest mock, so it is immune to that reset and survives across tests.
 */

jest.mock('../../utils', () => ({
  getGame: jest.fn()
}))
jest.mock('backend/dialog/dialog', () => ({
  notify: jest.fn()
}))
jest.mock('backend/constants/environment', () => ({
  isMac: false
}))
jest.mock('../nonesteamgame/nonesteamgame', () => ({
  addNonSteamGame: jest.fn(),
  isAddedToSteam: jest.fn(),
  removeNonSteamGame: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  existsSync: jest.fn()
}))

import { existsSync } from 'graceful-fs'
import { getGame } from '../../utils'
import { shortcutFiles } from '../shortcuts/shortcuts'
import { addShortcuts } from '../shortcuts/shortcuts'
import { handlerRegistry } from 'backend/platform'
import { logWarning } from 'backend/logger'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'

const mockedGetGame = getGame as jest.Mock
const mockedLogWarning = logWarning as jest.Mock
const mockedExistsSync = existsSync as jest.Mock

// Import for side effect only: this is what actually calls addHandler(...)
// / addListener(...) at module-load time, registering the real handlers
// against the real `backend/ipc` -> `backend/platform` chain.
import '../ipc_handler'

type ShortcutsExistsHandler = (
  event: unknown,
  appName: string,
  runner: string
) => boolean | Promise<boolean>

function getRegisteredHandler(channel: string): ShortcutsExistsHandler {
  const handler = handlerRegistry.get(channel)
  if (!handler) {
    throw new Error(`no handler registered for "${channel}"`)
  }
  return handler as ShortcutsExistsHandler
}

function makeStubGame(gameInfo: GameInfo): Game {
  return {
    getGameInfo: () => gameInfo
  } as unknown as Game
}

describe('backend/shortcuts/ipc_handler.ts: shortcutsExists (260905-mv5, site 3)', () => {
  beforeEach(() => {
    mockedGetGame.mockReset()
    mockedExistsSync.mockReset()
  })

  it('260905-mv5: resolves false instead of throwing when getGameInfo() returns {} (D-01 sentinel)', async () => {
    mockedGetGame.mockReturnValue(makeStubGame({} as GameInfo))
    const handler = getRegisteredHandler('shortcutsExists')

    // Wrapped in Promise.resolve().then(...) so a SYNCHRONOUS throw from the
    // (currently synchronous) handler surfaces as a rejection instead of
    // escaping this test as an uncaught exception.
    await expect(
      Promise.resolve().then(() => handler(undefined, 'AppName', 'legendary'))
    ).resolves.toBe(false)
  })

  // 260905-mv5 Task 3: the falsy-title branch must not fail SILENTLY -- a
  // missing shortcut check is a behavior change from before this fix (it used
  // to throw), so it must be observable in the logs exactly once.
  it('260905-mv5: logs exactly one warning when getGameInfo() returns {} (D-01 sentinel)', async () => {
    mockedGetGame.mockReturnValue(makeStubGame({} as GameInfo))
    const handler = getRegisteredHandler('shortcutsExists')

    await Promise.resolve().then(() =>
      handler(undefined, 'AppName', 'legendary')
    )

    expect(mockedLogWarning).toHaveBeenCalledTimes(1)
    expect(mockedLogWarning.mock.calls[0][0]).toContain('AppName')
  })

  // 260905-mv5 Task 3 (no regression): the D-03 early return must not swallow
  // the normal path -- with a POPULATED title, the handler must still call
  // the real `shortcutFiles` and return the real `existsSync` result, not an
  // unconditional `false`. `shortcutFiles` is left real/unmocked (see file
  // header), so `existsSync` is mocked here specifically so a `true` result
  // is reachable -- on a clean test machine none of these paths exist for
  // real, which would make this assertion pass just as well against an
  // ALWAYS-false-returning guard (not discriminating). Mocking `existsSync`
  // to return `true` for the exact path `shortcutFiles` computes is what
  // makes a reverted, unconditional `return false` guard turn this test RED.
  it('260905-mv5 (no regression): still calls shortcutFiles/existsSync and returns true when a real title is present', async () => {
    mockedGetGame.mockReturnValue(
      makeStubGame({ title: 'Real Game' } as GameInfo)
    )
    const [desktopFile] = shortcutFiles('Real Game')
    mockedExistsSync.mockImplementation((path: string) => path === desktopFile)

    const handler = getRegisteredHandler('shortcutsExists')
    await expect(
      Promise.resolve().then(() => handler(undefined, 'AppName', 'legendary'))
    ).resolves.toBe(true)
    expect(mockedLogWarning).not.toHaveBeenCalled()
  })
})

/**
 * Re-verification of the plan's evidence item 5 (the corrected premises
 * D-03 rests on). Task 1's action step requires re-measuring these three
 * facts before trusting D-03's design; if any of these disagrees with the
 * plan's recorded measurement, execution must STOP and report rather than
 * silently picking a different fallback. All three are confirmed below to
 * match the plan's recorded values exactly.
 */
describe('260905-mv5 Task 1: premise re-verification (plan evidence item 5)', () => {
  it('shortcutFiles(undefined) THROWS (matches plan measurement)', () => {
    expect(() => shortcutFiles(undefined as unknown as string)).toThrow(
      'Input must be string'
    )
  })

  it("shortcutFiles('') RETURNS a real non-empty path pair, it does not throw (matches plan measurement)", () => {
    const [desktopFile, menuFile] = shortcutFiles('')
    expect(desktopFile).toBeTruthy()
    expect(menuFile).toBeTruthy()
    // Plan evidence item 5: on darwin this is a SHARED path
    // (~/Applications/.app) for desktopFile and menuFile alike.
    expect(desktopFile).toEqual(menuFile)
  })

  it('addShortcuts({} as GameInfo) THROWS (rejects) at is_dlc, before ever reaching shortcutFiles (matches plan measurement)', async () => {
    // addShortcuts is async — the is_dlc property-access throw inside its
    // body surfaces as a promise rejection, not a synchronous throw.
    const game = makeStubGame({} as GameInfo)
    await expect(addShortcuts(game)).rejects.toThrow()
  })
})
