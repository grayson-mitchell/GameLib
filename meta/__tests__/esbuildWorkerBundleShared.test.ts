// Phase 23.1 plan 05 (coordinator-directed fix, live-hardware finding
// 2026-08-18): coverage for the build-time mechanism that replaced
// lzmaNativeBinding.ts's retired `dir`-based runtime identity guard --
// resolveLzmaNativePkgRoot()/writeLzmaNativeResolvedPaths() (spike 023's
// resolved-paths.generated.cjs pattern, ported into this project's real
// build pipeline) and assertNodeGypBuildSingleConsumer()/
// findOtherNodeGypBuildConsumers() (the T-23.1-03-02 security property,
// relocated here because it can no longer be evaluated reliably at
// runtime once genuinely bundled -- see esbuildWorkerBundleShared.ts's own
// header comment for the full finding).

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH,
  resolveLzmaNativePkgRoot,
  writeLzmaNativeResolvedPaths,
  findOtherNodeGypBuildConsumers,
  assertNodeGypBuildSingleConsumer
} from '../esbuildWorkerBundleShared'

describe('resolveLzmaNativePkgRoot / writeLzmaNativeResolvedPaths', () => {
  afterEach(() => {
    rmSync(LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH, { force: true })
  })

  it('resolves a real, existing lzma-native package root', () => {
    const root = resolveLzmaNativePkgRoot()
    expect(root).toContain('lzma-native')
    expect(() => readFileSync(join(root, 'package.json'))).not.toThrow()
  })

  it('writes a generated CJS module that lzmaNativeBinding.ts can require() by a plain relative specifier, containing the resolved root', () => {
    const returned = writeLzmaNativeResolvedPaths()
    const written = readFileSync(
      LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH,
      'utf-8'
    )
    expect(written).toContain('GENERATED')
    expect(written).toContain('do not edit by hand')
    expect(written).toContain(returned.replace(/\\/g, '\\\\'))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require(
      '../../' + LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH.replace(/\\/g, '/')
    ) as { LZMA_NATIVE_PKG_ROOT: string }
    expect(required.LZMA_NATIVE_PKG_ROOT).toBe(returned)
  })
})

describe('findOtherNodeGypBuildConsumers / assertNodeGypBuildSingleConsumer (T-23.1-03-02, relocated to build time)', () => {
  it("reports zero offenders against this project's REAL node_modules -- the alias is currently safe", () => {
    expect(findOtherNodeGypBuildConsumers()).toEqual([])
    expect(() => assertNodeGypBuildSingleConsumer()).not.toThrow()
  })

  it('excludes lzma-native and node-gyp-build themselves from the offender list (they legitimately declare/are the dependency)', () => {
    const offenders = findOtherNodeGypBuildConsumers()
    expect(offenders).not.toContain('lzma-native')
    expect(offenders).not.toContain('node-gyp-build')
  })

  describe('against a synthetic node_modules fixture (known-bad-input case)', () => {
    let fixtureRoot: string

    afterEach(() => {
      rmSync(fixtureRoot, { recursive: true, force: true })
    })

    function writeFixturePkg(
      nodeModulesDir: string,
      name: string,
      deps: Record<string, string>
    ) {
      const pkgDir = join(nodeModulesDir, name)
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', dependencies: deps })
      )
    }

    it('DOES detect a second, unrelated package that declares a node-gyp-build dependency -- the assertion must fail against a known-bad input, not just pass against the (currently clean) real tree', () => {
      fixtureRoot = mkdtempSync(
        join(tmpdir(), 'gamelib-node-gyp-build-fixture-')
      )
      const nodeModulesDir = join(fixtureRoot, 'node_modules')
      writeFixturePkg(nodeModulesDir, 'lzma-native', {
        'node-gyp-build': '^4.0.0'
      })
      writeFixturePkg(nodeModulesDir, 'some-other-native-pkg', {
        'node-gyp-build': '^4.0.0'
      })
      writeFixturePkg(nodeModulesDir, 'unrelated-pure-js-pkg', {})

      const offenders = findOtherNodeGypBuildConsumers(nodeModulesDir)
      expect(offenders).toEqual(['some-other-native-pkg'])
      expect(() => assertNodeGypBuildSingleConsumer(nodeModulesDir)).toThrow(
        /some-other-native-pkg/
      )
      expect(() => assertNodeGypBuildSingleConsumer(nodeModulesDir)).toThrow(
        /T-23\.1-03-02/
      )
    })

    it('correctly walks scoped packages (@scope/name) one level deeper', () => {
      fixtureRoot = mkdtempSync(
        join(tmpdir(), 'gamelib-node-gyp-build-fixture-scoped-')
      )
      const nodeModulesDir = join(fixtureRoot, 'node_modules')
      writeFixturePkg(nodeModulesDir, 'lzma-native', {
        'node-gyp-build': '^4.0.0'
      })
      writeFixturePkg(join(nodeModulesDir, '@somescope'), 'native-thing', {
        'node-gyp-build': '^4.0.0'
      })

      const offenders = findOtherNodeGypBuildConsumers(nodeModulesDir)
      expect(offenders).toEqual([join('@somescope', 'native-thing')])
    })

    it('returns empty (not a throw) against a nonexistent node_modules directory -- callers passing a synthetic/incomplete fixture in other tests must not spuriously fail here', () => {
      const bogusDir = join(
        tmpdir(),
        'gamelib-nonexistent-node-modules-' + Date.now()
      )
      expect(findOtherNodeGypBuildConsumers(bogusDir)).toEqual([])
    })
  })
})
