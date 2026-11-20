/**
 * The boot's `resolveAppPaths` seams that moved out of the retired `sidecar/pathShim`:
 * the lazy `exe` accessor (GAMELIB_SHELL_EXE, T-34.5-01/02) and the production config root (the OS
 * appData, with no I/O: the 'app-folder' step owns the rename). Jest's `setupFiles` redirect the home
 * and the XDG/APPDATA variables, so everything resolved here is contained.
 */
import { existsSync } from 'fs'
import { dirname } from 'path'

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

  beforeEach(() => {
    savedExe = process.env.GAMELIB_SHELL_EXE
    delete process.env.GAMELIB_SHELL_EXE
  })

  afterEach(() => {
    // Restore exactly, including "was absent": a leaked value would make a later "throws when
    // unset" case pass for the wrong reason.
    if (savedExe === undefined) delete process.env.GAMELIB_SHELL_EXE
    else process.env.GAMELIB_SHELL_EXE = savedExe
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

  it('appFolder sits directly under the OS appData and resolving it creates nothing', () => {
    const paths = freshResolve()() as { appFolder: string; userData: string }
    // The config root and userData share the OS appData parent: no redirected root.
    expect(dirname(paths.appFolder)).toBe(dirname(paths.userData))
    expect(existsSync(paths.appFolder)).toBe(false)
  })
})
