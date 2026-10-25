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
const mockAddNonSteamGame = jest.fn()
const defaultSettings = {
  addDesktopShortcuts: true,
  addStartMenuShortcuts: true,
  addSteamShortcuts: false
}
let mockSettings: typeof defaultSettings = { ...defaultSettings }

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
      getSettings: () => mockSettings
    })
  }
}))

jest.mock('../nonesteamgame/nonesteamgame', () => ({
  addNonSteamGame: (...args: unknown[]) => mockAddNonSteamGame(...args)
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

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
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
  mockSettings = { ...defaultSettings }
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

describe('Steam game (261026-c7r)', () => {
  const steamUrl = 'gamelib://launch?appName=230070&runner=steam'
  const steamGameInfo = {
    runner: 'steam',
    app_name: '230070',
    art_cover: '',
    art_square: '',
    install: { is_dlc: false },
    is_installed: true,
    title: 'Steam Shortcut Test',
    canRunOffline: true
  } as unknown as GameInfo
  const steamGame = { getGameInfo: () => steamGameInfo } as unknown as Game

  it('linux: both .desktop files Exec the steam gamelib:// URL', async () => {
    originalPlatform = overrideProcessPlatform('linux')
    const [desktopFile, menuFile] = shortcutFiles(steamGameInfo.title)
    mkdirSync(dirname(desktopFile), { recursive: true })
    mkdirSync(dirname(menuFile), { recursive: true })

    await addShortcuts(steamGame, true)

    for (const file of [desktopFile, menuFile]) {
      expect(readFileSync(file, 'utf8')).toContain(`Exec=xdg-open ${steamUrl}`)
    }
  })

  it('win32: both .lnk writes carry the steam gamelib:// URL', async () => {
    originalPlatform = overrideProcessPlatform('win32')
    fakePowerShell(0)
    const [desktopFile, menuFile] = shortcutFiles(steamGameInfo.title)

    await addShortcuts(steamGame, true)

    expect(mockSpawn).toHaveBeenCalledTimes(2)
    const envs = mockSpawn.mock.calls.map(([, , options]) => options.env)
    expect(envs.map((env) => env.GAMELIB_LNK_PATH).sort()).toEqual(
      [desktopFile, menuFile].sort()
    )
    for (const env of envs) {
      expect(env.GAMELIB_LNK_ARGS).toContain(steamUrl)
    }
  })

  describe('darwin', () => {
    let savedShellExe: string | undefined
    beforeEach(() => {
      originalPlatform = overrideProcessPlatform('darwin')
      savedShellExe = process.env.GAMELIB_SHELL_EXE
      process.env.GAMELIB_SHELL_EXE = '/fake/GameLib.app/Contents/MacOS/GameLib'
    })
    afterEach(() => {
      if (savedShellExe === undefined) delete process.env.GAMELIB_SHELL_EXE
      else process.env.GAMELIB_SHELL_EXE = savedShellExe
      for (const app of shortcutFiles(steamGameInfo.title)) {
        rmSync(app, { recursive: true, force: true })
      }
    })

    it('writes run.sh with the quoted steam URL and an iconless plist', async () => {
      const app = shortcutFiles(steamGameInfo.title)[1]

      await addShortcuts(steamGame, true)

      const runSh = readFileSync(`${app}/Contents/MacOS/run.sh`, 'utf8')
      expect(runSh).toContain(`--no-gui '${steamUrl}'`)
      expect(runSh).toContain('"/fake/GameLib.app/Contents/MacOS/GameLib"')
      const plist = readFileSync(`${app}/Contents/Info.plist`, 'utf8')
      expect(plist).not.toContain('CFBundleIconFile')
    })
  })

  describe('addSteamShortcuts guard', () => {
    beforeEach(() => {
      originalPlatform = overrideProcessPlatform('linux')
      mockSettings = { ...defaultSettings, addSteamShortcuts: true }
      mockAddNonSteamGame.mockClear()
    })

    it('does not register a Steam game as a non-Steam game', async () => {
      const [desktopFile, menuFile] = shortcutFiles(steamGameInfo.title)
      mkdirSync(dirname(desktopFile), { recursive: true })
      mkdirSync(dirname(menuFile), { recursive: true })

      await addShortcuts(steamGame, true)

      expect(mockAddNonSteamGame).not.toHaveBeenCalled()
    })

    it('still registers a legendary game', async () => {
      const [desktopFile, menuFile] = shortcutFiles(gameInfo.title)
      mkdirSync(dirname(desktopFile), { recursive: true })
      mkdirSync(dirname(menuFile), { recursive: true })

      await addShortcuts(game, true)

      expect(mockAddNonSteamGame).toHaveBeenCalledWith(game)
    })
  })
})

describe('addShortcuts on darwin (261026-clh, 261026-ctm)', () => {
  const url = 'gamelib://launch?appName=outcome-test-app&runner=legendary'
  let savedShellExe: string | undefined
  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('darwin')
    savedShellExe = process.env.GAMELIB_SHELL_EXE
    process.env.GAMELIB_SHELL_EXE = '/fake/GameLib.app/Contents/MacOS/GameLib'
  })
  afterEach(() => {
    if (savedShellExe === undefined) delete process.env.GAMELIB_SHELL_EXE
    else process.env.GAMELIB_SHELL_EXE = savedShellExe
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)
    rmSync(desktopApp, { recursive: true, force: true })
    rmSync(menuApp, { recursive: true, force: true })
  })

  const runSh = (app: string) => join(app, 'Contents', 'MacOS', 'run.sh')

  it('shortcutFiles returns distinct Desktop and Applications .app paths', () => {
    const [desktopApp, menuApp] = shortcutFiles('X')
    expect(desktopApp).toBe(join(homedir(), 'Desktop', 'X.app'))
    expect(menuApp).toBe(join(homedir(), 'Applications', 'X.app'))
    expect(desktopApp).not.toEqual(menuApp)
  })

  it('menu add with the Desktop toggle off writes Applications only', async () => {
    mockSettings = {
      ...defaultSettings,
      addDesktopShortcuts: false,
      addStartMenuShortcuts: false
    }
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)

    await addShortcuts(game, true)

    expect(existsSync(runSh(menuApp))).toBe(true)
    expect(existsSync(desktopApp)).toBe(false)
  })

  const desktopOn = {
    ...defaultSettings,
    addDesktopShortcuts: true,
    addStartMenuShortcuts: false
  }

  it('261026-ctm menu add with the Desktop toggle on writes one bundle and a Desktop symlink to it', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)

    await addShortcuts(game, true)

    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
    expect(readFileSync(runSh(menuApp), 'utf8')).toContain(`'${url}'`)
    expect(readFileSync(runSh(desktopApp), 'utf8')).toContain(`'${url}'`)
  })

  it('261026-ctm install add with only the Desktop toggle on writes the Applications bundle and links it', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)

    await addShortcuts(game)

    expect(existsSync(runSh(menuApp))).toBe(true)
    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
  })

  it('261026-ctm a legacy real Desktop bundle is replaced by the link', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)
    mkdirSync(join(desktopApp, 'Contents', 'MacOS'), { recursive: true })
    writeFileSync(runSh(desktopApp), '')

    await addShortcuts(game, true)

    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
  })

  it('261026-ctm a dangling Desktop link is replaced by a link to the bundle', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)
    mkdirSync(dirname(desktopApp), { recursive: true })
    symlinkSync(
      join(homedir(), 'Applications', 'gone-261026-ctm.app'),
      desktopApp
    )

    await addShortcuts(game, true)

    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
  })

  it('install add with both toggles off writes nothing and resolves', async () => {
    mockSettings = {
      ...defaultSettings,
      addDesktopShortcuts: false,
      addStartMenuShortcuts: false
    }
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)

    await expect(addShortcuts(game)).resolves.toBeUndefined()

    expect(existsSync(desktopApp)).toBe(false)
    expect(existsSync(menuApp)).toBe(false)
  })

  it('a failed Desktop link rejects naming the path, and the Applications bundle is still written', async () => {
    mockSettings = {
      ...defaultSettings,
      addDesktopShortcuts: true,
      addStartMenuShortcuts: false
    }
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)
    const desktopDir = dirname(desktopApp)
    // ~/Desktop as a regular file makes the mkdir of <title>.app under it fail.
    rmSync(desktopDir, { recursive: true, force: true })
    writeFileSync(desktopDir, '')
    try {
      await expect(addShortcuts(game, true)).rejects.toThrow(desktopApp)
      expect(existsSync(runSh(menuApp))).toBe(true)
    } finally {
      rmSync(desktopDir, { force: true })
    }
  })

  it('261026-ctm a failed Applications write rejects naming both paths and creates no link', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = shortcutFiles(gameInfo.title)
    const appsDir = dirname(menuApp)
    rmSync(appsDir, { recursive: true, force: true })
    writeFileSync(appsDir, '')
    try {
      const rejection = addShortcuts(game, true)
      await expect(rejection).rejects.toThrow(menuApp)
      await expect(rejection).rejects.toThrow(desktopApp)
      expect(() => lstatSync(desktopApp)).toThrow(/ENOENT/)
    } finally {
      rmSync(appsDir, { force: true })
    }
  })
})
