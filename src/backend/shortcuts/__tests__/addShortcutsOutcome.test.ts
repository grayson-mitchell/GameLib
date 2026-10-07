/**
 * `addShortcuts` must report a shortcut it failed to write, so the `addShortcut` channel does
 * not send its "Shortcuts were created" toast for nothing (todos
 * `2026-10-05-windows-desktop-and-start-menu-shortcuts-are-never-written.md` and
 * `2026-10-05-desktop-and-documents-paths-ignore-real-user-folders.md`).
 *
 *   - linux: a failed `.desktop` write (e.g. a `~/Desktop` that does not exist) rejects.
 *   - win32: the `.lnk` is written by a PowerShell child fed on stdin. `child_process.spawn` is
 *     replaced by a fake here, so NO POWERSHELL RUNS. A non-zero exit rejects.
 *
 * Paths resolve under the jest containment home (`jest.setupContainment.ts`).
 */
import { EventEmitter } from 'events'

const mockSpawn = jest.fn()

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: (...args: unknown[]) => mockSpawn(...args),
  // The win32 known-folder lookup in `pathShim` must not run `reg.exe` either; `undefined`
  // makes it fall back to `homedir()/Desktop`.
  spawnSync: () => undefined
}))

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
import { dirname } from 'path'
import { addShortcuts, shortcutFiles } from '../shortcuts/shortcuts'
import type { GameInfo } from 'common/types'
import type { Game } from 'common/types/game_manager'

function overrideProcessPlatform(os: string): string {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: os, configurable: true })
  return original
}

const gameInfo = {
  runner: 'legendary',
  app_name: 'outcome-test-app',
  art_cover: '',
  art_square: '',
  install: { is_dlc: false, executable: '' },
  is_installed: true,
  title: 'Outcome Test Game',
  canRunOffline: true
} as unknown as GameInfo
const game = { getGameInfo: () => gameInfo } as unknown as Game

type FakeChild = EventEmitter & {
  stdin: { write: jest.Mock; end: jest.Mock; on: jest.Mock }
  stderr: EventEmitter
  kill: jest.Mock
}

/** A stand-in for the PowerShell child: exits with `code` on the next macrotask, after creating
 * the `.lnk` named in its env when `code` is 0 (what a real `$lnk.Save()` would do). */
function fakePowerShell(code: number) {
  mockSpawn.mockImplementation(
    (
      _command: string,
      _args: string[],
      options: { env: NodeJS.ProcessEnv }
    ) => {
      const child = new EventEmitter() as FakeChild
      child.stdin = { write: jest.fn(), end: jest.fn(), on: jest.fn() }
      child.stderr = new EventEmitter()
      child.kill = jest.fn()
      setImmediate(() => {
        if (code === 0) {
          // On this POSIX test host the win32 path's backslashes are part of the file name, so
          // its POSIX dirname is the folder to create.
          mkdirSync(dirname(options.env.GAMELIB_LNK_PATH!), { recursive: true })
          writeFileSync(options.env.GAMELIB_LNK_PATH!, '')
        }
        child.emit('close', code)
      })
      return child
    }
  )
}

let originalPlatform: string

afterEach(() => {
  overrideProcessPlatform(originalPlatform)
})

describe('addShortcuts on linux', () => {
  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('linux')
  })

  it('rejects when the desktop entry cannot be written', async () => {
    const [desktopFile, menuFile] = shortcutFiles(gameInfo.title)
    rmSync(dirname(desktopFile), { recursive: true, force: true })
    mkdirSync(dirname(menuFile), { recursive: true })

    await expect(addShortcuts(game, true)).rejects.toThrow(desktopFile)
  })

  it('resolves and writes both entries when both folders exist', async () => {
    const [desktopFile, menuFile] = shortcutFiles(gameInfo.title)
    mkdirSync(dirname(desktopFile), { recursive: true })
    mkdirSync(dirname(menuFile), { recursive: true })

    await expect(addShortcuts(game, true)).resolves.toBeUndefined()
    expect(existsSync(desktopFile)).toBe(true)
    expect(existsSync(menuFile)).toBe(true)
  })
})

describe('addShortcuts on win32', () => {
  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('win32')
  })

  it('rejects when PowerShell fails to write the .lnk', async () => {
    fakePowerShell(1)

    await expect(addShortcuts(game, true)).rejects.toThrow()
    expect(mockSpawn).toHaveBeenCalled()
  })

  it('writes the desktop and Start Menu .lnk through PowerShell, paths in env, never a shell', async () => {
    fakePowerShell(0)
    const [desktopFile, menuFile] = shortcutFiles(gameInfo.title)

    await expect(addShortcuts(game, true)).resolves.toBeUndefined()

    expect(mockSpawn).toHaveBeenCalledTimes(2)
    const written = mockSpawn.mock.calls.map(([command, args, options]) => {
      expect(command).toBe('powershell.exe')
      expect(args).toEqual([
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '-'
      ])
      expect(options.shell).toBeFalsy()
      return options.env.GAMELIB_LNK_PATH
    })
    expect(written.sort()).toEqual([desktopFile, menuFile].sort())
  })
})
