/**
 * `addShortcuts` must report a shortcut it failed to write, so the `addShortcut` channel does
 * not send its "Shortcuts were created" toast for nothing (todos
 * `2026-10-05-windows-desktop-and-start-menu-shortcuts-are-never-written.md` and
 * `2026-10-05-desktop-and-documents-paths-ignore-real-user-folders.md`).
 *
 *   - linux: a failed `.desktop` write (e.g. a `~/Desktop` that does not exist) rejects.
 *   - win32: the `.lnk` is written by a PowerShell child fed on stdin. The runner is a fake
 *     here, so NO POWERSHELL (and no reg.exe) RUNS. A non-zero exit rejects.
 *
 * Paths resolve under the jest containment home (`jest.setupContainment.ts`).
 */
const mockRun = jest.fn()
const mockAddNonSteamGame = jest.fn()
const defaultSettings = {
  addDesktopShortcuts: true,
  addStartMenuShortcuts: true,
  addSteamShortcuts: false
}
let mockSettings: typeof defaultSettings = { ...defaultSettings }

jest.mock('../nonesteamgame/nonesteamgame', () => ({
  addNonSteamGame: (...args: unknown[]) => mockAddNonSteamGame(...args)
}))

jest.mock('backend/shortcuts/utils', () => ({
  getIcon: () => Promise.resolve(undefined)
}))

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
import gracefulFs from 'graceful-fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { addShortcuts, shortcutFiles } from '../shortcuts/shortcuts'
import type { GameInfo } from 'common/types'

import type { Game } from 'common/types/game_manager'
import { defined } from 'backend/testUtils/indexed'
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestHostServices } from 'backend/testUtils/testHostServices'

const deps = {
  libraryManagers: { gog: {} },
  runner: { run: (...args: unknown[]) => mockRun(...args) },
  config: { getSettings: () => mockSettings },
  paths: createContainedHomeAppPaths(),
  imageTools: createTestHostServices().imageTools
} as unknown as Parameters<typeof addShortcuts>[0]

/** Both shortcut paths for `title`; throws if the platform yields none. On win32 the Desktop
 * comes from the registry, so pass the folder the stub `reg.exe` answers with (261111-aq4). */
function bothFiles(title: string, windowsDesktop?: string): [string, string] {
  const [first, second] = shortcutFiles(deps, title, windowsDesktop)
  return [
    defined(first, 'desktop shortcut path'),
    defined(second, 'menu shortcut path')
  ]
}

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

/** A Desktop folder the stub `reg.exe` can answer with. It lies OUTSIDE the containment home: on a
 * POSIX host it is a relative file name in the checkout and on Windows a real `D:\` folder, so no
 * test may create a file there (261111-aq4). It is only ever asserted on through the powershell
 * env. */
const REGISTRY_DESKTOP = 'D:\\GameLibTest\\Desktop'

const regOut = (name: string, type: string, value: string) =>
  `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    ${name}    ${type}    ${value}\r\n\r\n`

/** A stand-in for the runner. `reg.exe` answers `REG_SZ <registryDesktop>` for the Desktop, or
 * exits 1 (a failed lookup) when `registryDesktop` is undefined. The PowerShell run exits with
 * `code`, after creating the `.lnk` named in its env when `code` is 0 (what a real `$lnk.Save()`
 * would do) and only when that path sits under the containment home. */
function fakePowerShell(code: number, registryDesktop?: string) {
  if (registryDesktop !== undefined && code === 0) {
    // writeWindowsShortcut checks that the .lnk exists once PowerShell exits 0, and the registry
    // Desktop must never be created for real (see REGISTRY_DESKTOP), so answer that one existence
    // check for it. `jest.spyOn` is not a DI-ceiling census site.
    const realExistsSync = gracefulFs.existsSync
    existsSyncSpy = jest
      .spyOn(gracefulFs, 'existsSync')
      .mockImplementation((path) =>
        String(path).startsWith(registryDesktop) ? true : realExistsSync(path)
      )
  }
  mockRun.mockImplementation(
    (command: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
      const base = { signal: null, stdout: '', stderr: '', timedOut: false }
      if (command === 'reg.exe') {
        return Promise.resolve(
          registryDesktop === undefined
            ? { ...base, code: 1 }
            : {
                ...base,
                code: 0,
                stdout: regOut('Desktop', 'REG_SZ', registryDesktop)
              }
        )
      }
      if (command !== 'powershell.exe')
        return Promise.resolve({ ...base, code: 1 })
      const lnk = options.env.GAMELIB_LNK_PATH!
      if (code === 0 && lnk.startsWith(homedir())) {
        // On this POSIX test host the win32 path's backslashes are part of the file name, so
        // its POSIX dirname is the folder to create.
        mkdirSync(dirname(lnk), { recursive: true })
        writeFileSync(lnk, '')
      }
      return Promise.resolve({ ...base, code })
    }
  )
}

/** The powershell.exe runs only (reg.exe lookups excluded). */
function powershellCalls(): unknown[][] {
  return mockRun.mock.calls.filter(([command]) => command === 'powershell.exe')
}

let originalPlatform: string
let existsSyncSpy: jest.SpyInstance | undefined

afterEach(() => {
  existsSyncSpy?.mockRestore()
  existsSyncSpy = undefined
  overrideProcessPlatform(originalPlatform)
  mockSettings = { ...defaultSettings }
})

describe('addShortcuts on linux', () => {
  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('linux')
  })

  it('rejects when the desktop entry cannot be written', async () => {
    const [desktopFile, menuFile] = bothFiles(gameInfo.title)
    rmSync(dirname(desktopFile), { recursive: true, force: true })
    mkdirSync(dirname(menuFile), { recursive: true })

    await expect(addShortcuts(deps, game, true)).rejects.toThrow(desktopFile)
  })

  it('resolves and writes both entries when both folders exist', async () => {
    const [desktopFile, menuFile] = bothFiles(gameInfo.title)
    mkdirSync(dirname(desktopFile), { recursive: true })
    mkdirSync(dirname(menuFile), { recursive: true })

    await expect(addShortcuts(deps, game, true)).resolves.toBeUndefined()
    expect(existsSync(desktopFile)).toBe(true)
    expect(existsSync(menuFile)).toBe(true)
  })
})

describe('addShortcuts on win32', () => {
  beforeEach(() => {
    originalPlatform = overrideProcessPlatform('win32')
    mockRun.mockReset()
  })

  it('shortcutFiles has no Desktop path without a registry folder, and uses it when given (261111-aq4)', () => {
    const [noDesktop, menu] = shortcutFiles(deps, gameInfo.title)
    expect(noDesktop).toBeUndefined()
    expect(defined(menu, 'menu path')).toBe(
      `${deps.paths.appData}\\Microsoft\\Windows\\Start Menu\\Programs\\${gameInfo.title}.lnk`
    )
    const [desktop, sameMenu] = shortcutFiles(
      deps,
      gameInfo.title,
      REGISTRY_DESKTOP
    )
    expect(desktop).toBe(`${REGISTRY_DESKTOP}\\${gameInfo.title}.lnk`)
    expect(sameMenu).toBe(menu)
  })

  it('rejects when PowerShell fails to write the .lnk', async () => {
    fakePowerShell(1, REGISTRY_DESKTOP)

    await expect(addShortcuts(deps, game, true)).rejects.toThrow()
    expect(powershellCalls().length).toBeGreaterThan(0)
  })

  it('registry lookup fails: writes only the Start Menu .lnk and rejects naming the Desktop, never via getPath (261111-aq4)', async () => {
    fakePowerShell(0)
    const [, menuFile] = shortcutFiles(deps, gameInfo.title)

    const rejection = addShortcuts(deps, game, true)
    await expect(rejection).rejects.toThrow(/Desktop/)
    await expect(rejection).rejects.toThrow(/registry/)
    // getPath('desktop') would throw the pathShim error; it must never be reached.
    await expect(rejection).rejects.not.toThrow(/pathShim/)

    expect(powershellCalls()).toHaveLength(1)
    const env = (powershellCalls()[0]![2] as { env: NodeJS.ProcessEnv }).env
    expect(env.GAMELIB_LNK_PATH).toBe(menuFile)
    expect(existsSync(defined(menuFile, 'menu path'))).toBe(true)
  })

  it('registry lookup fails but no Desktop shortcut was requested: resolves, Start Menu .lnk only (261111-aq4)', async () => {
    mockSettings = {
      ...defaultSettings,
      addDesktopShortcuts: false,
      addStartMenuShortcuts: true
    }
    fakePowerShell(0)
    const [, menuFile] = shortcutFiles(deps, gameInfo.title)

    await expect(addShortcuts(deps, game)).resolves.toBeUndefined()

    expect(powershellCalls()).toHaveLength(1)
    const env = (powershellCalls()[0]![2] as { env: NodeJS.ProcessEnv }).env
    expect(env.GAMELIB_LNK_PATH).toBe(menuFile)
  })

  it('writes the desktop and Start Menu .lnk through PowerShell, paths in env, never a shell', async () => {
    fakePowerShell(0, REGISTRY_DESKTOP)
    const [desktopFile, menuFile] = bothFiles(gameInfo.title, REGISTRY_DESKTOP)

    await expect(addShortcuts(deps, game, true)).resolves.toBeUndefined()

    expect(powershellCalls()).toHaveLength(2)
    const written = powershellCalls().map(([command, args, rawOptions]) => {
      const options = rawOptions as { env: NodeJS.ProcessEnv; shell?: unknown }
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
    const [desktopFile, menuFile] = bothFiles(steamGameInfo.title)
    mkdirSync(dirname(desktopFile), { recursive: true })
    mkdirSync(dirname(menuFile), { recursive: true })

    await addShortcuts(deps, steamGame, true)

    for (const file of [desktopFile, menuFile]) {
      expect(readFileSync(file, 'utf8')).toContain(`Exec=xdg-open ${steamUrl}`)
    }
  })

  it('win32: both .lnk writes pass the steam gamelib:// URL as one quoted explorer.exe argument', async () => {
    originalPlatform = overrideProcessPlatform('win32')
    fakePowerShell(0, REGISTRY_DESKTOP)
    const [desktopFile, menuFile] = bothFiles(
      steamGameInfo.title,
      REGISTRY_DESKTOP
    )

    await addShortcuts(deps, steamGame, true)

    expect(powershellCalls()).toHaveLength(2)
    const envs = powershellCalls().map(
      ([, , options]) => (options as { env: NodeJS.ProcessEnv }).env
    )
    expect(envs.map((env) => env.GAMELIB_LNK_PATH).sort()).toEqual(
      [desktopFile, menuFile].sort()
    )
    for (const env of envs) {
      expect(env.GAMELIB_LNK_ARGS).toBe(`"${steamUrl}"`)
      expect(env.GAMELIB_LNK_TARGET).toMatch(/explorer\.exe$/)
    }
  })

  it('win32: a hostile app_name cannot add a second quote or leak raw into the URL (T-66.4-76)', async () => {
    originalPlatform = overrideProcessPlatform('win32')
    fakePowerShell(0, REGISTRY_DESKTOP)
    const hostileName = 'x" /root,C:\\ &x'
    const hostileInfo = {
      ...gameInfo,
      runner: 'legendary',
      app_name: hostileName,
      title: 'Hostile Name Test'
    } as unknown as GameInfo
    const hostileGame = { getGameInfo: () => hostileInfo } as unknown as Game

    await addShortcuts(deps, hostileGame, true)

    expect(powershellCalls()).toHaveLength(2)
    for (const [, , options] of powershellCalls()) {
      const args =
        (options as { env: NodeJS.ProcessEnv }).env.GAMELIB_LNK_ARGS ?? ''
      expect(args.match(/"/g)).toHaveLength(2)
      expect(args).toBe(
        `"gamelib://launch?appName=${encodeURIComponent(hostileName)}&runner=legendary"`
      )
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
      for (const app of shortcutFiles(deps, steamGameInfo.title)) {
        if (app) rmSync(app, { recursive: true, force: true })
      }
    })

    it('writes run.sh with the quoted steam URL and an iconless plist', async () => {
      const app = bothFiles(steamGameInfo.title)[1]

      await addShortcuts(deps, steamGame, true)

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
      const [desktopFile, menuFile] = bothFiles(steamGameInfo.title)
      mkdirSync(dirname(desktopFile), { recursive: true })
      mkdirSync(dirname(menuFile), { recursive: true })

      await addShortcuts(deps, steamGame, true)

      expect(mockAddNonSteamGame).not.toHaveBeenCalled()
    })

    it('still registers a legendary game', async () => {
      const [desktopFile, menuFile] = bothFiles(gameInfo.title)
      mkdirSync(dirname(desktopFile), { recursive: true })
      mkdirSync(dirname(menuFile), { recursive: true })

      await addShortcuts(deps, game, true)

      expect(mockAddNonSteamGame).toHaveBeenCalledWith(deps, game)
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
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)
    rmSync(desktopApp, { recursive: true, force: true })
    rmSync(menuApp, { recursive: true, force: true })
  })

  const runSh = (app: string) => join(app, 'Contents', 'MacOS', 'run.sh')

  it('shortcutFiles returns distinct Desktop and Applications .app paths', () => {
    const [desktopApp, menuApp] = bothFiles('X')
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
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)

    await addShortcuts(deps, game, true)

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
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)

    await addShortcuts(deps, game, true)

    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
    expect(readFileSync(runSh(menuApp), 'utf8')).toContain(`'${url}'`)
    expect(readFileSync(runSh(desktopApp), 'utf8')).toContain(`'${url}'`)
  })

  it('261026-ctm install add with only the Desktop toggle on writes the Applications bundle and links it', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)

    await addShortcuts(deps, game)

    expect(existsSync(runSh(menuApp))).toBe(true)
    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
  })

  it('261026-ctm a legacy real Desktop bundle is replaced by the link', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)
    mkdirSync(join(desktopApp, 'Contents', 'MacOS'), { recursive: true })
    writeFileSync(runSh(desktopApp), '')

    await addShortcuts(deps, game, true)

    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
  })

  it('261026-ctm a dangling Desktop link is replaced by a link to the bundle', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)
    mkdirSync(dirname(desktopApp), { recursive: true })
    symlinkSync(
      join(homedir(), 'Applications', 'gone-261026-ctm.app'),
      desktopApp
    )

    await addShortcuts(deps, game, true)

    expect(lstatSync(desktopApp).isSymbolicLink()).toBe(true)
    expect(readlinkSync(desktopApp)).toBe(menuApp)
  })

  it('install add with both toggles off writes nothing and resolves', async () => {
    mockSettings = {
      ...defaultSettings,
      addDesktopShortcuts: false,
      addStartMenuShortcuts: false
    }
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)

    await expect(addShortcuts(deps, game)).resolves.toBeUndefined()

    expect(existsSync(desktopApp)).toBe(false)
    expect(existsSync(menuApp)).toBe(false)
  })

  it('a failed Desktop link rejects naming the path, and the Applications bundle is still written', async () => {
    mockSettings = {
      ...defaultSettings,
      addDesktopShortcuts: true,
      addStartMenuShortcuts: false
    }
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)
    const desktopDir = dirname(desktopApp)
    // ~/Desktop as a regular file makes the mkdir of <title>.app under it fail.
    rmSync(desktopDir, { recursive: true, force: true })
    writeFileSync(desktopDir, '')
    try {
      await expect(addShortcuts(deps, game, true)).rejects.toThrow(desktopApp)
      expect(existsSync(runSh(menuApp))).toBe(true)
    } finally {
      rmSync(desktopDir, { force: true })
    }
  })

  it('261026-ctm a failed Applications write rejects naming both paths and creates no link', async () => {
    mockSettings = desktopOn
    const [desktopApp, menuApp] = bothFiles(gameInfo.title)
    const appsDir = dirname(menuApp)
    rmSync(appsDir, { recursive: true, force: true })
    writeFileSync(appsDir, '')
    try {
      const rejection = addShortcuts(deps, game, true)
      await expect(rejection).rejects.toThrow(menuApp)
      await expect(rejection).rejects.toThrow(desktopApp)
      expect(() => lstatSync(desktopApp)).toThrow(/ENOENT/)
    } finally {
      rmSync(appsDir, { force: true })
    }
  })
})
