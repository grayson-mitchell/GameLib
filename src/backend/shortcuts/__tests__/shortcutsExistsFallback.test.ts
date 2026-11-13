/**
 * Quick task 260905-mv5 (site 3) — regression test for the Electron
 * `shortcutsExists` IPC handler (now `sidecar/shortcutsFlowRegistration.ts`, D-11: the Electron-era ipc_handler.ts was deleted).
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
 * `registerShortcutsFlows()` registers through `backend/platform`'s `ipcMain.handle(...)`, which stores the registration
 * in that module's `handlerRegistry` Map — the SAME plain-object registry
 * `shortcutsFlows.test.ts` (site 4) reads from. A jest.fn()-based capture of
 * `addHandler` was tried first and does NOT work here: this project's
 * `resetMocks: true` config wipes every jest mock's recorded calls (and any
 * mockImplementation) before EACH test, including the one-time registration
 * call that only happens once at module-import time — so by the time a test
 * runs, the capture is already gone. `handlerRegistry` is a plain `Map`, not
 * a jest mock, so it is immune to that reset and survives across tests.
 */

jest.mock('backend/dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))
jest.mock('backend/constants/environment', () => ({
  ...jest.requireActual('backend/constants/environment'),
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

import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestInfoCaches } from 'backend/testUtils/testEpicAmazonRuntimes'
import { createTestAbortRegistry } from 'backend/testUtils/testAbortRegistry'
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { existsSync } from 'graceful-fs'
import { mkdirSync, rmSync, symlinkSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import {
  createTestManagers,
  createTestServices,
  createTestStores
} from 'backend/testUtils/testServices'
import { shortcutFiles, addShortcuts } from '../shortcuts/shortcuts'
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { ipcViews } from 'backend/testUtils/ipcViews'
import { logWarning } from 'backend/logger'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'

const deps = {
  libraryManagers: { gog: {} },
  paths: createContainedHomeAppPaths()
} as unknown as Parameters<typeof addShortcuts>[0]
const mockedGetGame = jest.fn()
const mockedLogWarning = logWarning as jest.Mock
const mockedExistsSync = existsSync as jest.Mock

// Import for side effect only: this is what actually calls addHandler(...)
// / addListener(...) at module-load time, registering the real handlers
// against the real `backend/ipc` -> `backend/platform` chain.
import { registerShortcutsFlows } from '../../sidecar/shortcutsFlowRegistration'

const sendFrontendMessage = jest.fn()

function hostSlices() {
  const host = createTestHostServices()
  return {
    dialogs: host.dialogs,
    appState: host.appState,
    notifications: host.notifications,
    config: createTestGlobalConfig(),
    paths: createContainedHomeAppPaths(),
    infoCaches: createTestInfoCaches(),
    aborts: createTestAbortRegistry(),
    imageTools: host.imageTools,
    requestRustInvoke: host.requestRustInvoke
  }
}

const ipc = createIpcRegistry()
const { handlerRegistry } = ipcViews(ipc)

/** Pins `process.platform` for one case. These cases assert the host-platform (linux) arm CI runs;
 * on a win32 host `shortcutFiles`/`getPath` no longer guess a Desktop/Documents folder (quick
 * 261111-aq4). Restore the returned value in `finally`. */
function overrideProcessPlatform(os: string): string {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: os, configurable: true })
  return original
}

registerShortcutsFlows({
  sendFrontendMessage,
  appRuntime: createTestAppRuntime(),
  ipc,
  ...hostSlices(),
  managers: createTestManagers({
    library: {
      legendary: { getGame: (...a: [string]) => mockedGetGame(...a) },
      gog: { getGame: (...a: [string]) => mockedGetGame(...a) },
      steam: { getGame: (...a: [string]) => mockedGetGame(...a) },
      nile: { getGame: (...a: [string]) => mockedGetGame(...a) },
      sideload: { getGame: (...a: [string]) => mockedGetGame(...a) }
    }
  }),
  quit: { handleExit: () => Promise.resolve() },
  stores: createTestStores(),
  runner: createTestServices().runner
})

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

describe('sidecar/shortcutsFlowRegistration.ts: shortcutsExists (260905-mv5, site 3)', () => {
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
    // Pinned to linux, CI's own arm (261111-aq4).
    const originalPlatform = overrideProcessPlatform('linux')
    try {
      const [desktopFile] = shortcutFiles(deps, 'Real Game')
      mockedExistsSync.mockImplementation(
        (path: string) => path === desktopFile
      )

      const handler = getRegisteredHandler('shortcutsExists')
      await expect(
        Promise.resolve().then(() => handler(undefined, 'AppName', 'legendary'))
      ).resolves.toBe(true)
      expect(mockedLogWarning).not.toHaveBeenCalled()
    } finally {
      overrideProcessPlatform(originalPlatform)
    }
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
    expect(() => shortcutFiles(deps, undefined as unknown as string)).toThrow(
      'Input must be string'
    )
  })

  it("shortcutFiles('') RETURNS a real non-empty path pair, it does not throw (matches plan measurement)", () => {
    // Pinned to linux, CI's own arm: on a win32 host the Desktop path needs a registry folder
    // (261111-aq4).
    const originalPlatform = overrideProcessPlatform('linux')
    let desktopFile, menuFile
    try {
      ;[desktopFile, menuFile] = shortcutFiles(deps, '')
    } finally {
      overrideProcessPlatform(originalPlatform)
    }
    expect(desktopFile).toBeTruthy()
    expect(menuFile).toBeTruthy()
    // shortcutFiles switches on process.platform (not the isMac mock above, which is irrelevant
    // here). Every platform returns a distinct pair: linux <desktop>/<name>.desktop vs
    // ~/.local/share/applications/<name>.desktop (the pair the 2026-09-15 Linux CI log's diff
    // printed, quick-260921-o95), and since 261026-clh darwin returns ~/Desktop/<name>.app vs
    // ~/Applications/<name>.app.
    expect(desktopFile).not.toEqual(menuFile)
  })

  it('addShortcuts({} as GameInfo) THROWS (rejects) at is_dlc, before ever reaching shortcutFiles (matches plan measurement)', async () => {
    // addShortcuts is async — the is_dlc property-access throw inside its
    // body surfaces as a promise rejection, not a synchronous throw.
    const game = makeStubGame({} as GameInfo)
    await expect(addShortcuts(deps, game)).rejects.toThrow()
  })
})

describe('261026-clh: shortcutsExists on darwin', () => {
  let originalPlatform: string
  beforeEach(() => {
    mockedGetGame.mockReset()
    mockedExistsSync.mockReset()
    originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    })
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  })

  it('resolves true when only the ~/Desktop .app exists', async () => {
    mockedGetGame.mockReturnValue(
      makeStubGame({ title: 'Real Game' } as GameInfo)
    )
    const [desktopApp, menuApp] = shortcutFiles(deps, 'Real Game')
    expect(desktopApp).not.toEqual(menuApp)
    mockedExistsSync.mockImplementation((path: string) => path === desktopApp)

    const handler = getRegisteredHandler('shortcutsExists')
    await expect(
      Promise.resolve().then(() => handler(undefined, 'AppName', 'legendary'))
    ).resolves.toBe(true)
  })

  it('261026-ctm resolves true for a dangling Desktop link with no Applications bundle', async () => {
    mockedGetGame.mockReturnValue(
      makeStubGame({ title: '261026-ctm Dangling' } as GameInfo)
    )
    mockedExistsSync.mockReturnValue(false)
    const [desktopApp] = shortcutFiles(deps, '261026-ctm Dangling')
    if (!desktopApp || !desktopApp.startsWith(homedir())) {
      throw new Error(`refusing to write outside the containment home`)
    }
    mkdirSync(dirname(desktopApp), { recursive: true })
    symlinkSync(
      join(homedir(), 'Applications', 'gone-261026-ctm.app'),
      desktopApp
    )
    try {
      const handler = getRegisteredHandler('shortcutsExists')
      await expect(
        Promise.resolve().then(() => handler(undefined, 'AppName', 'legendary'))
      ).resolves.toBe(true)
    } finally {
      rmSync(desktopApp, { force: true })
    }
  })

  it('261026-ctm resolves false when neither path exists nor is a link', async () => {
    mockedGetGame.mockReturnValue(
      makeStubGame({ title: '261026-ctm Nothing Here' } as GameInfo)
    )
    mockedExistsSync.mockReturnValue(false)

    const handler = getRegisteredHandler('shortcutsExists')
    await expect(
      Promise.resolve().then(() => handler(undefined, 'AppName', 'legendary'))
    ).resolves.toBe(false)
  })
})
