/**
 * Phase 57 D-12: readKnownFixesWithLayer returns the winning tier-1 entry plus
 * the layer it came from. All layer dirs resolve under tmp in jest; os.homedir
 * is redirected and bundledFixesPath is pointed at a tmp dir as in
 * knownFixesLayered.test.ts.
 */

import { tmpdir } from 'os'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
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

jest.mock('../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { readKnownFixes, readKnownFixesWithLayer } from '../knownFixes'
import { defined } from './helpers/defined'

// A per-file disposable AppPaths root (66.4-17): the known-fix readers take their layer directories
// from `deps.paths`, so no module is mocked. The bundled layer is nested as `<root>/public/fixes`,
// the same depth as the shipped `<app>/public/fixes`.
const TEST_ROOT = join(
  tmpdir(),
  `gamelib-bundled-fixes-test-${process.pid}-withlayer`
)
const paths = createTestAppPaths(TEST_ROOT, {
  bundledFixesPath: join(TEST_ROOT, 'public', 'fixes')
})
const { bundledFixesPath, fixesPath, localFixesPath } = paths
const deps = { paths }

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
    expect(readKnownFixesWithLayer(deps, '77', 'steam')).toBeNull()
    expect(readKnownFixes(deps, '77', 'steam')).toBeNull()
  })

  it('walks local > bundled > remote and matches readKnownFixes', () => {
    put(localFixesPath, '77')
    put(bundledFixesPath, '77')
    put(fixesPath, '77')

    const expected = ['local', 'bundled', 'remote'] as const
    const dirs = [localFixesPath, bundledFixesPath, fixesPath]
    expected.forEach((layer, i) => {
      const res = readKnownFixesWithLayer(deps, '77', 'steam')
      expect(res?.layer).toBe(layer)
      expect(res?.fix).toEqual(readKnownFixes(deps, '77', 'steam'))
      rmSync(defined(dirs[i], 'layer dir'), { recursive: true, force: true })
    })
    expect(readKnownFixesWithLayer(deps, '77', 'steam')).toBeNull()
  })
})
