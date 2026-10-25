/**
 * `removeShortcuts` must settle only after its deletions have finished, and must report a failed
 * deletion without rejecting (quick 261012-ca6, todo
 * `2026-10-12-gamesubmenu-shows-remove-shortcuts-before-the-write-is-known`).
 *
 * It used to call the callback-style `unlink`/`rm` and return before either finished, and its
 * callbacks logged "removed" even when they received an error. The sidecar's `removeShortcut`
 * channel answers from the disk right after `removeShortcuts` settles, so an un-awaited deletion
 * raced that answer.
 *
 * It never rejects for a deletion failure: four uninstall paths await it and one calls it
 * un-awaited, and a stale shortcut must not fail an uninstall.
 *
 * Safety: every path here resolves under the jest containment home (`jest.setupContainment.ts`).
 * `spawnSync` is mocked so the win32 known-folder lookup in `pathShim` never runs `reg.exe`, which
 * on the operator's Windows box would resolve the real OneDrive Desktop. Each test asserts that
 * both paths start with `homedir()` before it writes anything.
 */
const mockEnv = { isMac: false }

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawnSync: () => undefined
}))

// `removeShortcuts` branches on this constant rather than on `process.platform`, so the darwin
// case has to flip it as well.
// A getter, defined with `Object.defineProperty`: a getter written in an object literal next to
// a spread is evaluated once by the compiled `Object.assign`, which would freeze it at false.
jest.mock('backend/constants/environment', () =>
  Object.defineProperty(
    { ...jest.requireActual('backend/constants/environment') },
    'isMac',
    { get: () => mockEnv.isMac, enumerable: true, configurable: true }
  )
)

jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => ({
      getSettings: () => ({
        addDesktopShortcuts: true,
        addStartMenuShortcuts: true,
        addSteamShortcuts: false
      })
    })
  }
}))

jest.mock('backend/shortcuts/utils', () => ({
  getIcon: () => Promise.resolve(undefined)
}))

jest.mock('backend/storeManagers', () => ({ libraryManagerMap: {} }))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { logError } from 'backend/logger'
import { removeShortcuts, shortcutFiles } from '../shortcuts/shortcuts'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'

const mockLogError = logError as jest.Mock

function overrideProcessPlatform(os: string): string {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: os, configurable: true })
  return original
}

function gameFor(title: string): Game {
  const gameInfo = {
    runner: 'legendary',
    app_name: 'remove-outcome-test-app',
    art_cover: '',
    art_square: '',
    install: { is_dlc: false, executable: '' },
    is_installed: true,
    title,
    canRunOffline: true
  } as unknown as GameInfo
  return { getGameInfo: () => gameInfo } as unknown as Game
}

let originalPlatform: string
const created: string[] = []

afterEach(() => {
  overrideProcessPlatform(originalPlatform)
  mockEnv.isMac = false
  for (const path of created.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

/** Both shortcut paths for `title`, asserted to sit under the jest containment home. */
function containedPaths(title: string): [string, string] {
  const [desktopFile, menuFile] = shortcutFiles(title)
  expect(desktopFile.startsWith(homedir())).toBe(true)
  expect(menuFile.startsWith(homedir())).toBe(true)
  created.push(desktopFile, menuFile)
  return [desktopFile, menuFile]
}

describe('removeShortcuts on linux (261012-ca6)', () => {
  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('linux')
    mockEnv.isMac = false
  })

  it('261012-ca6 both files are already gone when the returned promise resolves, and nothing is logged as an error', async () => {
    const title = '261012-ca6 Remove Awaits Game'
    const [desktopFile, menuFile] = containedPaths(title)
    mkdirSync(dirname(desktopFile), { recursive: true })
    mkdirSync(dirname(menuFile), { recursive: true })
    writeFileSync(desktopFile, '')
    writeFileSync(menuFile, '')

    await removeShortcuts(gameFor(title))

    expect(existsSync(desktopFile)).toBe(false)
    expect(existsSync(menuFile)).toBe(false)
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it('261012-ca6 a failed deletion resolves, is logged with its path, and the next file is still removed', async () => {
    const title = '261012-ca6 Remove Fails Game'
    const [desktopFile, menuFile] = containedPaths(title)
    mkdirSync(dirname(menuFile), { recursive: true })
    // A non-empty directory at the desktop path: unlink fails (EISDIR on linux, EPERM on
    // win32 and darwin).
    mkdirSync(desktopFile, { recursive: true })
    writeFileSync(join(desktopFile, 'keep'), '')
    writeFileSync(menuFile, '')

    await expect(removeShortcuts(gameFor(title))).resolves.toBeUndefined()

    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(String((mockLogError.mock.calls[0][0] as unknown[])[0])).toContain(
      desktopFile
    )
    expect(existsSync(menuFile)).toBe(false)
    expect(existsSync(desktopFile)).toBe(true)
  })

  it('261012-ca6 files that do not exist count as already removed and are not logged as errors', async () => {
    const title = '261012-ca6 Remove Missing Game'
    containedPaths(title)

    await expect(removeShortcuts(gameFor(title))).resolves.toBeUndefined()

    expect(mockLogError).not.toHaveBeenCalled()
  })
})

describe('removeShortcuts on darwin (261012-ca6)', () => {
  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('darwin')
    mockEnv.isMac = true
  })

  it('261012-ca6 the .app directory and its contents are gone when the returned promise resolves', async () => {
    const title = '261012-ca6 Remove App Game'
    const [, menuFile] = containedPaths(title)
    mkdirSync(join(menuFile, 'Contents', 'MacOS'), { recursive: true })
    writeFileSync(join(menuFile, 'Contents', 'MacOS', 'run.sh'), '')

    await removeShortcuts(gameFor(title))

    expect(existsSync(menuFile)).toBe(false)
  })

  it('261026-clh both the Desktop and Applications .app are removed, nothing is logged', async () => {
    const title = '261026-clh Remove Both Game'
    const [desktopFile, menuFile] = containedPaths(title)
    expect(desktopFile).not.toEqual(menuFile)
    for (const app of [desktopFile, menuFile]) {
      mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
      writeFileSync(join(app, 'Contents', 'MacOS', 'run.sh'), '')
    }

    await removeShortcuts(gameFor(title))

    expect(existsSync(desktopFile)).toBe(false)
    expect(existsSync(menuFile)).toBe(false)
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it('261026-clh a Desktop-only .app is removed and nothing is logged', async () => {
    const title = '261026-clh Remove Desktop Only Game'
    const [desktopFile, menuFile] = containedPaths(title)
    mkdirSync(join(desktopFile, 'Contents', 'MacOS'), { recursive: true })
    writeFileSync(join(desktopFile, 'Contents', 'MacOS', 'run.sh'), '')

    await removeShortcuts(gameFor(title))

    expect(existsSync(desktopFile)).toBe(false)
    expect(existsSync(menuFile)).toBe(false)
    expect(mockLogError).not.toHaveBeenCalled()
  })
})
