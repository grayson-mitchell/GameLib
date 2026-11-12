/**
 * The boot's `resolveAppPaths` seams that moved out of the retired `sidecar/pathShim`:
 * the lazy `exe` accessor (GAMELIB_SHELL_EXE, T-34.5-01/02) and the CI=e2e config root, which is
 * a name only (no I/O: the 'app-folder' step creates it). Jest's `setupFiles` redirect the home
 * and the XDG/APPDATA variables, so everything resolved here is contained.
 */
import { existsSync, realpathSync } from 'fs'
import { dirname } from 'path'
import { tmpdir } from 'os'

function freshResolve(): () => Record<string, unknown> {
  let resolveAppPaths!: () => Record<string, unknown>
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    resolveAppPaths = require('../bootstrap').resolveAppPaths
  })
  return resolveAppPaths
}

describe('resolveAppPaths', () => {
  let savedExe: string | undefined
  let savedCi: string | undefined

  beforeEach(() => {
    savedExe = process.env.GAMELIB_SHELL_EXE
    savedCi = process.env.CI
    delete process.env.GAMELIB_SHELL_EXE
  })

  afterEach(() => {
    // Restore exactly, including "was absent": a leaked value would make a later "throws when
    // unset" case pass for the wrong reason.
    if (savedExe === undefined) delete process.env.GAMELIB_SHELL_EXE
    else process.env.GAMELIB_SHELL_EXE = savedExe
    if (savedCi === undefined) delete process.env.CI
    else process.env.CI = savedCi
  })

  it('exe returns GAMELIB_SHELL_EXE verbatim when set', () => {
    const paths = freshResolve()()
    process.env.GAMELIB_SHELL_EXE =
      '/Applications/GameLib.app/Contents/MacOS/GameLib'
    expect(paths.exe).toBe('/Applications/GameLib.app/Contents/MacOS/GameLib')
  })

  it('exe throws a named error when GAMELIB_SHELL_EXE is unset, and boot does not read it', () => {
    const paths = freshResolve()()
    expect(() => paths.exe).toThrow(/GAMELIB_SHELL_EXE was not set/)
  })

  it('exe throws on the empty string: never an empty launch command (T-34.5-02)', () => {
    const paths = freshResolve()()
    process.env.GAMELIB_SHELL_EXE = ''
    expect(() => paths.exe).toThrow(/GAMELIB_SHELL_EXE was not set/)
  })

  it('knownFolder resolves Desktop and Documents under the contained home', () => {
    const paths = freshResolve()() as {
      knownFolder(name: 'desktop' | 'documents'): string
      userHome: string
    }
    if (process.platform === 'win32') return
    expect(paths.knownFolder('desktop')).toMatch(/Desktop$/)
    expect(paths.knownFolder('documents')).toMatch(/Documents$/)
  })

  it('CI=e2e: appFolder sits under a fresh temp name and resolving it creates nothing', () => {
    process.env.CI = 'e2e'
    const paths = freshResolve()() as { appFolder: string; userData: string }
    const configRoot = dirname(paths.appFolder)
    expect(dirname(configRoot)).toBe(realpathSync(tmpdir()))
    expect(existsSync(configRoot)).toBe(false)
    // userData still follows the OS appData, not the e2e root.
    expect(paths.userData).not.toContain(configRoot)
  })
})
