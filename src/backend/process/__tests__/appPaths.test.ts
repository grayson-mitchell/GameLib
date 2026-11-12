import {
  derivePaths,
  fixAsarPath,
  resolveAppDataDir,
  resolveKnownFolder
} from '../appPaths'
import type { AppPathRoots } from '../appPaths'

const roots: AppPathRoots = {
  appData: '/A',
  configRoot: '/A',
  home: '/H',
  userHome: '/H',
  flatpakHome: '/H',
  appRoot: '/R',
  assetDir: 'public',
  arch: 'arm64',
  tempDir: '/T'
}

describe('derivePaths', () => {
  test('derives the standard layout', () => {
    const p = derivePaths(roots)
    expect(p.appFolder).toBe('/A/GameLib')
    expect(p.toolsPath).toBe('/A/GameLib/tools')
    expect(p.defaultUmuPath).toBe('/A/GameLib/tools/runtimes/umu/umu_run.py')
    expect(p.heroicInstallPath).toBe('/H/Games/GameLib')
    expect(p.publicDir).toBe('/R/public')
    expect(p.builtBridgeShimPath).toBe(
      '/R/public/bin/arm64/darwin/steam_api.dll'
    )
    expect(p.steamBridgeHelperStateDir).toBe('/A/GameLib/steam-bridge')
    expect(p.steamSupportPath).toBe('/A/GameLib/steam_store')
    expect(p.userData).toBe('/A/GameLib')
    expect(p.temp).toBe('/T')
  })

  test('configRoot splits appFolder from userData (e2e)', () => {
    const p = derivePaths({ ...roots, configRoot: '/E' })
    expect(p.appFolder).toBe('/E/GameLib')
    expect(p.userData).toBe('/A/GameLib')
  })

  test('returns a frozen object', () => {
    expect(Object.isFrozen(derivePaths(roots))).toBe(true)
  })
})

describe('fixAsarPath', () => {
  test('rewrites app.asar to app.asar.unpacked', () => {
    expect(fixAsarPath('x/app.asar/y')).toBe('x/app.asar.unpacked/y')
  })
  test('leaves an unpacked path unchanged', () => {
    expect(fixAsarPath('x/app.asar.unpacked/y')).toBe('x/app.asar.unpacked/y')
  })
})

describe('resolveAppDataDir', () => {
  test('per platform', () => {
    expect(resolveAppDataDir('darwin', {}, '/H')).toBe(
      '/H/Library/Application Support'
    )
    expect(resolveAppDataDir('win32', { APPDATA: 'C:/X' }, '/H')).toBe('C:/X')
    expect(resolveAppDataDir('linux', { XDG_CONFIG_HOME: '/x' }, '/H')).toBe(
      '/x'
    )
    expect(resolveAppDataDir('linux', {}, '/H')).toBe('/H/.config')
  })
})

describe('resolveKnownFolder (moved from the retired pathShim)', () => {
  const noXdg = () => undefined

  test('darwin: <home>/Desktop and <home>/Documents', () => {
    expect(resolveKnownFolder('desktop', 'darwin', {}, '/H', noXdg)).toBe(
      '/H/Desktop'
    )
    expect(resolveKnownFolder('documents', 'darwin', {}, '/H', noXdg)).toBe(
      '/H/Documents'
    )
  })

  test('linux: falls back to <home>/<Name> when nothing else answers', () => {
    expect(resolveKnownFolder('desktop', 'linux', {}, '/H', noXdg)).toBe(
      '/H/Desktop'
    )
    expect(resolveKnownFolder('documents', 'linux', {}, '/H', noXdg)).toBe(
      '/H/Documents'
    )
  })

  test('linux: the exported XDG variable wins over user-dirs.dirs', () => {
    const read = jest.fn(() => '/from/user-dirs')
    expect(
      resolveKnownFolder(
        'desktop',
        'linux',
        { XDG_DESKTOP_DIR: '/from/env' },
        '/H',
        read
      )
    ).toBe('/from/env')
    expect(read).not.toHaveBeenCalled()
  })

  test('linux: user-dirs.dirs answers when the env var is unset (a localized desktop)', () => {
    const read = jest.fn((key: string) =>
      key === 'XDG_DESKTOP_DIR' ? '/H/Schreibtisch' : '/H/Dokumente'
    )
    expect(resolveKnownFolder('desktop', 'linux', {}, '/H', read)).toBe(
      '/H/Schreibtisch'
    )
    expect(resolveKnownFolder('documents', 'linux', {}, '/H', read)).toBe(
      '/H/Dokumente'
    )
  })

  test('win32: both folders throw, never a guessed <home>\\Desktop (quick 261111-aq4)', () => {
    expect(() =>
      resolveKnownFolder('desktop', 'win32', {}, 'C:\\H', noXdg)
    ).toThrow(/desktop.*readWindowsShellFolder/)
    expect(() =>
      resolveKnownFolder('documents', 'win32', {}, 'C:\\H', noXdg)
    ).toThrow(/documents.*readWindowsShellFolder/)
  })
})
