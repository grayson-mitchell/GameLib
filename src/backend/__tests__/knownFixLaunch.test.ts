/**
 * quick 261029-mbl: exeOverride launch-time containment, on real temp dirs
 * (including symlink escapes). No child process is spawned.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

const mockLogWarning = jest.fn()
jest.mock('../logger', () => ({
  logWarning: (...a: unknown[]) => mockLogWarning(...a),
  logInfo: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

const mockReadKnownFixes = jest.fn()
jest.mock('../knownFixes', () => ({
  ...jest.requireActual('../knownFixes'),
  readKnownFixes: (...a: unknown[]) => mockReadKnownFixes(...a)
}))

import {
  readKnownFixLaunchOverrides,
  resolveKnownFixExeOverride
} from '../knownFixLaunch'

let base: string
let install: string
let outside: string

beforeEach(() => {
  jest.clearAllMocks()
  base = mkdtempSync(join(tmpdir(), 'gamelib-exeoverride-'))
  install = join(base, 'install')
  outside = join(base, 'outside')
  mkdirSync(join(install, 'bin'), { recursive: true })
  mkdirSync(outside)
  writeFileSync(join(install, 'bin', 'game.exe'), 'x')
  writeFileSync(join(outside, 'real.exe'), 'x')
  writeFileSync(join(base, 'outside.exe'), 'x')
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

const run = (o: string, p = install) => resolveKnownFixExeOverride(p, o, 'L')

describe('resolveKnownFixExeOverride', () => {
  it('accepts a relative file and returns the lexical path', () => {
    expect(run('bin/game.exe')).toBe(resolve(install, 'bin/game.exe'))
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  it('accepts the backslash form', () => {
    expect(run('bin\\game.exe')).toBe(resolve(install, 'bin/game.exe'))
  })

  it.each([
    ['absolute', '/etc/passwd'],
    ['dotdot', '../outside.exe'],
    ['nested dotdot', 'bin/../../outside.exe']
  ])('rejects %s', (_n, o) => {
    expect(run(o)).toBeUndefined()
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  it('rejects a symlinked file escaping the install', () => {
    symlinkSync(join(outside, 'real.exe'), join(install, 'link.exe'))
    expect(run('link.exe')).toBeUndefined()
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  it('rejects a path through a symlinked dir escaping the install', () => {
    symlinkSync(outside, join(install, 'linkdir'))
    expect(run('linkdir/real.exe')).toBeUndefined()
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  it('accepts a symlinked install root', () => {
    const linked = join(base, 'linked-install')
    symlinkSync(install, linked)
    expect(run('bin/game.exe', linked)).toBe(resolve(linked, 'bin/game.exe'))
  })

  it('rejects a missing file, a directory and a missing install', () => {
    expect(run('bin/nope.exe')).toBeUndefined()
    expect(run('bin')).toBeUndefined()
    expect(run('bin/game.exe', join(base, 'nope'))).toBeUndefined()
    expect(mockLogWarning).toHaveBeenCalledTimes(3)
  })
})

describe('readKnownFixLaunchOverrides', () => {
  it('returns empty overrides with no fix', () => {
    mockReadKnownFixes.mockReturnValue(null)
    expect(readKnownFixLaunchOverrides('a', 'gog', install)).toEqual({
      launchArgs: [],
      exeOverride: undefined
    })
  })

  it('returns launchArgs and a resolved exeOverride', () => {
    mockReadKnownFixes.mockReturnValue({
      title: 't',
      launchArgs: ['-x'],
      exeOverride: 'bin/game.exe'
    })
    expect(readKnownFixLaunchOverrides('a', 'gog', install)).toEqual({
      launchArgs: ['-x'],
      exeOverride: resolve(install, 'bin/game.exe')
    })
  })

  it('drops exeOverride with a warning when installPath is undefined', () => {
    mockReadKnownFixes.mockReturnValue({
      title: 't',
      launchArgs: ['-x'],
      exeOverride: 'bin/game.exe'
    })
    expect(readKnownFixLaunchOverrides('a', 'gog', undefined)).toEqual({
      launchArgs: ['-x'],
      exeOverride: undefined
    })
    expect(mockLogWarning).toHaveBeenCalled()
  })
})
