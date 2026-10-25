/**
 * quick 261025-mfz: readKnownFixesLayered -- local > bundled > remote, with
 * trusted-only keys (`registry`) stripped from the remote layer (decision 6).
 * All three layer directories resolve under tmp in jest; os.homedir is
 * redirected as in knownFixes.test.ts.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-knownfixes-layered-home-${process.pid}`
      )
  }
})

jest.mock('../logger', () => ({
  logWarning: jest.fn()
}))

import { readKnownFixes, readKnownFixesLayered } from '../knownFixes'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'
import { logWarning as mockedLogWarning } from '../logger'

const REG = [
  {
    key: 'HKLM\\Software\\X',
    name: 'N',
    type: 'REG_DWORD',
    value: 1
  }
]

function put(dir: string, app: string, content: unknown, raw = false) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${app}-steam.json`),
    raw ? (content as string) : JSON.stringify(content)
  )
}

function clean() {
  rmSync(fixesPath, { recursive: true, force: true })
  rmSync(localFixesPath, { recursive: true, force: true })
  rmSync(bundledFixesPath, { recursive: true, force: true })
}

describe('readKnownFixesLayered', () => {
  beforeEach(() => {
    clean()
    jest.clearAllMocks()
  })
  afterAll(clean)

  it('returns null when no layer has a file', () => {
    expect(readKnownFixesLayered('1', 'steam')).toBeNull()
  })

  it('returns the bundled object with registry intact', () => {
    put(bundledFixesPath, '1', { title: 'b', registry: REG })
    expect(readKnownFixesLayered('1', 'steam')).toEqual({
      title: 'b',
      registry: REG
    })
  })

  it('local wins over bundled as a whole file', () => {
    put(bundledFixesPath, '1', { title: 'b', winetricks: ['x'], registry: REG })
    put(localFixesPath, '1', { title: 'l' })
    expect(readKnownFixesLayered('1', 'steam')).toEqual({ title: 'l' })
  })

  it('malformed local warns and falls through to bundled', () => {
    put(bundledFixesPath, '1', { title: 'b' })
    put(localFixesPath, '1', '{nope', true)
    expect(readKnownFixesLayered('1', 'steam')).toEqual({ title: 'b' })
    expect(mockedLogWarning).toHaveBeenCalled()
  })

  it('non-object JSON is treated as malformed', () => {
    put(bundledFixesPath, '1', { title: 'b' })
    put(localFixesPath, '1', [1, 2])
    expect(readKnownFixesLayered('1', 'steam')).toEqual({ title: 'b' })
  })

  it('strips registry from the remote layer with a warning', () => {
    put(fixesPath, '1', { title: 'r', winetricks: ['v'], registry: REG })
    const result = readKnownFixesLayered('1', 'steam')
    expect(result).toEqual({ title: 'r', winetricks: ['v'] })
    expect(result).not.toHaveProperty('registry')
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('registry')
    )
  })

  it('local wins when bundled is absent and remote is present', () => {
    put(fixesPath, '1', { title: 'r' })
    put(localFixesPath, '1', { title: 'l', registry: REG })
    expect(readKnownFixesLayered('1', 'steam')).toEqual({
      title: 'l',
      registry: REG
    })
  })

  it.each([
    ['local', () => localFixesPath],
    ['bundled', () => bundledFixesPath],
    ['remote', () => fixesPath]
  ])('rejects a traversing appName in the %s layer', (_n, dir) => {
    // Plant a file at the traversal target so reading it would be visible.
    const target = join(dir(), '..', '..', 'etc')
    mkdirSync(target, { recursive: true })
    writeFileSync(
      join(target, 'x-steam.json'),
      JSON.stringify({ title: 'evil' })
    )
    try {
      expect(readKnownFixesLayered('../../etc/x', 'steam')).toBeNull()
      expect(mockedLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('outside')
      )
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('readKnownFixes still returns registry untouched from fixesPath', () => {
    put(fixesPath, '1', { title: 'r', registry: REG })
    expect(readKnownFixes('1', 'steam')).toEqual({ title: 'r', registry: REG })
  })
})
