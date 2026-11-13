/**
 * `resolveWindowsShortcutIcon` picks the icon of a Windows `.lnk` (G-66.4-W2 defect 2): the store's
 * own executable, else the game's exe found by a bounded scan of its install directory, else the
 * GameLib shell exe. The fixtures are real temp directories with empty files of chosen sizes,
 * named after install layouts measured on the operator's Windows box on 2026-11-13 (34 installed
 * Steam games across two libraries). No PowerShell runs and nothing is mocked; every case runs on
 * every OS.
 *
 * "Depth" below is the number of directory levels between the install root and the file: a file in
 * the root is depth 0, `bin/x64/factorio.exe` is depth 2.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { resolveWindowsShortcutIcon } from '../shortcuts/windowsShortcutIcon'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gamelib-icon-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Creates `<root>/<dirName>` holding the given files (relative `/` paths -> byte sizes). */
function install(dirName: string, files: Record<string, number>): string {
  const installPath = join(root, dirName)
  mkdirSync(installPath, { recursive: true })
  for (const [relative, size] of Object.entries(files)) {
    const file = join(installPath, ...relative.split('/'))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.alloc(size))
  }
  return installPath
}

/** A shell exe on disk, or a getter that throws exactly as `paths.exe` does when unset. */
function shellDeps(exe?: string) {
  return {
    paths: {
      get exe(): string {
        if (exe === undefined) throw new Error('GAMELIB_SHELL_EXE is not set')
        return exe
      }
    }
  }
}

function shellExe(): string {
  const file = join(root, 'gamelib-shell.exe')
  writeFileSync(file, Buffer.alloc(8))
  return file
}

describe('resolveWindowsShortcutIcon install-dir scan (measured layouts)', () => {
  const cases: Array<{
    name: string
    dir: string
    title: string
    files: Record<string, number>
    expected: string
  }> = [
    {
      // On disk the launcher is the smaller (49 MB against 74 MB); it is made larger here so the
      // name match, not size, is shown to decide.
      name: 'Pharaoh: the name match beats a larger launcher',
      dir: 'Total War PHARAOH DYNASTIES',
      title: 'Total War: PHARAOH DYNASTIES',
      files: { 'Pharaoh.exe': 100, 'launcher/launcher.exe': 900 },
      expected: 'Pharaoh.exe'
    },
    {
      name: 'WazHack: the game exe beats a larger crash handler',
      dir: 'WazHack',
      title: 'WazHack',
      files: { 'UnityCrashHandler32.exe': 900, 'WazHack.exe': 100 },
      expected: 'WazHack.exe'
    },
    {
      name: 'Schedule I: the exact title match wins',
      dir: 'Schedule I Demo',
      title: 'Schedule I: Free Sample',
      files: {
        'UnityCrashHandler64.exe': 900,
        'Schedule I Free Sample.exe': 100
      },
      expected: 'Schedule I Free Sample.exe'
    },
    {
      name: 'Darkest Dungeon: contained name, same depth, largest wins; helpers excluded',
      dir: 'DarkestDungeon',
      title: 'Darkest Dungeon',
      files: {
        '_windows/steam_workshop_upload.exe': 900,
        '_windows/win32/localization.exe': 800,
        '_windows/win32/Darkest.exe': 100,
        '_windows/win64/Darkest.exe': 300,
        '_windowsnosteam/win64/Darkest.exe': 200
      },
      expected: '_windows/win64/Darkest.exe'
    },
    {
      name: 'Manor Lords: the exact match at the root beats the larger shipping exe',
      dir: 'ManorLords',
      title: 'Manor Lords',
      files: {
        'Binaries/Win64/ManorLords-Win64-Shipping.exe': 900,
        'Engine/Binaries/Win64/CrashReportClient.exe': 800,
        'ManorLords.exe': 100
      },
      expected: 'ManorLords.exe'
    },
    {
      name: '7 Days To Die: an exact match beats a larger contained one',
      dir: '7 Days To Die',
      title: '7 Days To Die',
      files: {
        '7DaysToDie_EAC.exe': 900,
        '7dLauncher.exe': 800,
        'UnityCrashHandler64.exe': 700,
        'EasyAntiCheat/EasyAntiCheat_EOS_Setup.exe': 600,
        '7DaysToDie.exe': 100
      },
      expected: '7DaysToDie.exe'
    },
    {
      name: 'Age of Decadence (no name match): the largest at the shallowest depth',
      dir: 'The Age of Decadence',
      title: 'The Age of Decadence',
      files: {
        'AoD64.exe': 900,
        'AoD.exe': 100,
        'CrashSender1402x64.exe': 950
      },
      expected: 'AoD64.exe'
    },
    {
      name: 'Galactic Civilizations III (no name match): the largest root exe beats helpers and tools',
      dir: 'Galactic Civilizations III',
      title: 'Galactic Civilizations III',
      files: {
        'GalCiv3.exe': 900,
        'tachyon.exe': 300,
        'gc3_prefs_wipe.exe': 950,
        'Tools/GalCiv3FlavorTextEditor.exe': 990
      },
      expected: 'GalCiv3.exe'
    },
    {
      name: 'Factorio: an exe two directory levels deep is in reach',
      dir: 'Factorio',
      title: 'Factorio',
      files: { 'bin/x64/factorio.exe': 100 },
      expected: 'bin/x64/factorio.exe'
    }
  ]

  it.each(cases)('$name', async ({ dir, title, files, expected }) => {
    const installPath = install(dir, files)

    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title,
      installPath
    })

    expect(result).toEqual({
      icon: join(installPath, ...expected.split('/')),
      iconIndex: 0,
      source: 'install-dir'
    })
  })

  it('does not find an exe four directory levels below the root, and falls back', async () => {
    const installPath = install('Deep', { 'a/b/c/d/Deep.exe': 100 })
    const exe = shellExe()

    const result = await resolveWindowsShortcutIcon(shellDeps(exe), {
      title: 'Deep',
      installPath
    })

    expect(result).toEqual({ icon: exe, iconIndex: 0, source: 'gamelib-shell' })
  })

  it('finds an exe three directory levels below the root', async () => {
    const installPath = install('Reach', { 'a/b/c/Reach.exe': 100 })

    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title: 'Reach',
      installPath
    })

    expect(result?.icon).toBe(join(installPath, 'a', 'b', 'c', 'Reach.exe'))
  })

  it('does not follow a symlink or junction out of the install directory', async () => {
    const outside = install('Outside', { 'Outside.exe': 100 })
    const installPath = install('Linked', {})
    symlinkSync(outside, join(installPath, 'link'), 'junction')
    const exe = shellExe()

    const result = await resolveWindowsShortcutIcon(shellDeps(exe), {
      title: 'Linked',
      installPath
    })

    expect(result?.source).toBe('gamelib-shell')
  })

  it('never throws on an install path that does not exist', async () => {
    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title: 'Gone',
      installPath: join(root, 'does-not-exist')
    })

    expect(result).toBeUndefined()
  })
})

describe('resolveWindowsShortcutIcon store executable', () => {
  it('uses an existing store executable joined with the install path, without scanning', async () => {
    const installPath = install('Stored', {
      'game/Stored.exe': 10,
      'Other.exe': 900
    })

    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title: 'Stored',
      installPath,
      storeExecutable: 'game/Stored.exe'
    })

    expect(result).toEqual({
      icon: join(installPath, 'game', 'Stored.exe'),
      iconIndex: 0,
      source: 'store-executable'
    })
  })

  it('uses an absolute store executable as given when there is no install path', async () => {
    const installPath = install('Absolute', { 'Absolute.exe': 10 })
    const storeExecutable = join(installPath, 'Absolute.exe')

    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title: 'Absolute',
      storeExecutable
    })

    expect(result).toEqual({
      icon: storeExecutable,
      iconIndex: 0,
      source: 'store-executable'
    })
  })

  it('falls through to the scan when the store executable is missing on disk', async () => {
    const installPath = install('Missing', { 'Missing.exe': 10 })

    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title: 'Missing',
      installPath,
      storeExecutable: 'gone/Missing.exe'
    })

    expect(result).toEqual({
      icon: join(installPath, 'Missing.exe'),
      iconIndex: 0,
      source: 'install-dir'
    })
  })

  it('falls through when the store executable is not an exe, ico or dll', async () => {
    const installPath = install('Script', { 'start.sh': 10, 'Script.exe': 10 })

    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title: 'Script',
      installPath,
      storeExecutable: 'start.sh'
    })

    expect(result?.source).toBe('install-dir')
  })

  it('accepts an .ico store file case-insensitively', async () => {
    const installPath = install('Icon', { 'Game.ICO': 10 })

    const result = await resolveWindowsShortcutIcon(shellDeps(), {
      title: 'Icon',
      installPath,
      storeExecutable: 'Game.ICO'
    })

    expect(result?.source).toBe('store-executable')
  })
})

describe('resolveWindowsShortcutIcon fallbacks', () => {
  it('returns the GameLib shell exe for an install dir holding only artwork, never the artwork', async () => {
    const installPath = install('Art', { 'cover.jpg': 500, 'icon.png': 600 })
    const exe = shellExe()

    const result = await resolveWindowsShortcutIcon(shellDeps(exe), {
      title: 'Art',
      installPath
    })

    expect(result).toEqual({ icon: exe, iconIndex: 0, source: 'gamelib-shell' })
    expect(result?.icon).not.toMatch(/\.(jpg|png)$/i)
  })

  it('returns undefined, without throwing, when there is no install path and paths.exe throws', async () => {
    await expect(
      resolveWindowsShortcutIcon(shellDeps(), { title: 'Nothing' })
    ).resolves.toBeUndefined()
  })

  it('returns undefined when the shell exe path does not exist on disk', async () => {
    await expect(
      resolveWindowsShortcutIcon(shellDeps(join(root, 'nope.exe')), {
        title: 'Nothing'
      })
    ).resolves.toBeUndefined()
  })

  it('returns undefined when the shell path is not an exe, ico or dll', async () => {
    const file = join(root, 'shell.txt')
    writeFileSync(file, '')

    await expect(
      resolveWindowsShortcutIcon(shellDeps(file), { title: 'Nothing' })
    ).resolves.toBeUndefined()
  })
})
