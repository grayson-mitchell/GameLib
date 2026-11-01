/**
 * Phase 57 D-12: readKnownFixesWithLayer returns the winning tier-1 entry plus
 * the layer it came from. All layer dirs resolve under tmp in jest; os.homedir
 * is redirected and bundledFixesPath is pointed at a tmp dir as in
 * knownFixesLayered.test.ts.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-knownfixes-layer-home-${process.pid}`)
  }
})

jest.mock('../constants/paths', () => {
  const actual = jest.requireActual('../constants/paths')
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  return {
    ...actual,
    bundledFixesPath: path.join(
      os.tmpdir(),
      `gamelib-bundled-fixes-test-${process.pid}-withlayer`,
      'public',
      'fixes'
    )
  }
})

jest.mock('../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { readKnownFixes, readKnownFixesWithLayer } from '../knownFixes'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'

function put(dir: string, app: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${app}-steam.json`),
    JSON.stringify({ title: 'T', macArch: '32' })
  )
}

function clean() {
  rmSync(fixesPath, { recursive: true, force: true })
  rmSync(localFixesPath, { recursive: true, force: true })
  rmSync(bundledFixesPath, { recursive: true, force: true })
}

const bundledRoot = join(bundledFixesPath, '..', '..')
afterAll(() => {
  clean()
  rmSync(bundledRoot, { recursive: true, force: true })
})

describe('readKnownFixesWithLayer (D-12)', () => {
  beforeEach(clean)

  it('returns null when no layer has a file', () => {
    expect(readKnownFixesWithLayer('77', 'steam')).toBeNull()
    expect(readKnownFixes('77', 'steam')).toBeNull()
  })

  it('walks local > bundled > remote and matches readKnownFixes', () => {
    put(localFixesPath, '77')
    put(bundledFixesPath, '77')
    put(fixesPath, '77')

    const expected = ['local', 'bundled', 'remote'] as const
    const dirs = [localFixesPath, bundledFixesPath, fixesPath]
    expected.forEach((layer, i) => {
      const res = readKnownFixesWithLayer('77', 'steam')
      expect(res?.layer).toBe(layer)
      expect(res?.fix).toEqual(readKnownFixes('77', 'steam'))
      rmSync(dirs[i], { recursive: true, force: true })
    })
    expect(readKnownFixesWithLayer('77', 'steam')).toBeNull()
  })
})
