/**
 * Phase 73 D-15 deletion gate: Steam depot downloads run only in Rust
 * (crates/gamelib-depot, driven through depotRust/). Fails if a deleted TS
 * pipeline module, the decompress worker, the lzma-native packaging or the
 * retired GAMELIB_DEPOT_PIPELINE flag comes back -- and, just as loudly, if the
 * two codec packages steam-user still requires at import go missing.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')
const STEAM = 'src/backend/storeManagers/steam'

const DELETED = [
  // 73-20: the TS depot pipeline and its decompress worker.
  `${STEAM}/depot/chunkDecode.ts`,
  `${STEAM}/depot/crypto.ts`,
  `${STEAM}/depot/decompress.ts`,
  `${STEAM}/depot/decompressPool.ts`,
  `${STEAM}/depot/decompressPoolSelfTest.ts`,
  `${STEAM}/depot/decompressWorker.ts`,
  `${STEAM}/depot/download.ts`,
  `${STEAM}/depot/downloadFiles.ts`,
  `${STEAM}/depot/fileAttributes.ts`,
  // finalize.ts and manifest.ts survived as finalizeAcf.ts / appManifest.ts;
  // both were deleted in Phase 75 (plan 33).
  `${STEAM}/depot/finalize.ts`,
  `${STEAM}/depot/manifest.ts`,
  `${STEAM}/depot/finalizeAcf.ts`,
  `${STEAM}/depot/appManifest.ts`,
  `${STEAM}/__tests__/manifest.test.ts`,
  `${STEAM}/depot/flagsCensus.ts`,
  `${STEAM}/depot/hostHealth.ts`,
  `${STEAM}/depot/inflightLimiter.ts`,
  `${STEAM}/depot/machO.ts`,
  `${STEAM}/depot/pathCollisions.ts`,
  `${STEAM}/depot/reconcile.ts`,
  `${STEAM}/depot/stallTracker.ts`,
  `${STEAM}/depot/lzmaLoader.ts`,
  `${STEAM}/depot/lzmaLoaderCore.ts`,
  `${STEAM}/depot/lzmaNativeBinding.ts`,
  `${STEAM}/__tests__/decompressPool.test.ts`,
  `${STEAM}/__tests__/decompressWorkerRealBuild.test.ts`,
  `${STEAM}/__tests__/depotPrimitives.test.ts`,
  `${STEAM}/__tests__/fileAttributes.test.ts`,
  `${STEAM}/__tests__/fixtures/decompressWorkerRealBuildChild.js`,
  `${STEAM}/__tests__/fixtures/poolTestWorker.js`,
  `${STEAM}/__tests__/flagsCensus.test.ts`,
  `${STEAM}/__tests__/hostHealth.test.ts`,
  `${STEAM}/__tests__/inflightLimiter.test.ts`,
  `${STEAM}/__tests__/pathCollisions.test.ts`,
  `${STEAM}/__tests__/reconcile.test.ts`,
  `${STEAM}/__tests__/lzmaNativeBinding.test.ts`,
  `${STEAM}/__tests__/lzmaNativeSeaRealBuild.test.ts`,
  'meta/buildDecompressWorkerDev.ts',
  // 73-19: the env-only pipeline flag and the TS golden oracle.
  `${STEAM}/depotRust/pipelineFlag.ts`,
  `${STEAM}/depotRust/__tests__/depotPipelineFlag.test.ts`,
  `${STEAM}/__tests__/depotGoldenOracle.ts`,
  `${STEAM}/__tests__/depotGolden.test.ts`,
  // 73-21: lzma-native's typedef, its build-time helper test and the
  // generated resolved-paths file.
  'src/common/typedefs/lzma-native.d.ts',
  'meta/__tests__/esbuildWorkerBundleShared.test.ts',
  `${STEAM}/depot/lzmaNativeResolvedPaths.generated.cjs`
]

const FORBIDDEN = [
  'lzma-native',
  'GAMELIB_DECOMPRESS_POOL_SIZE',
  'NATIVE_LZMA_REQUIRED_TRIPLES',
  'runDecompressPoolSelfTest',
  'GAMELIB_DEPOT_PIPELINE',
  'loadContentManifestParser',
  'getRawManifest'
]

// Modules the TS side still owns after the port: depot selection, appinfo
// ordering, CDN auth and content-server discovery feed the Rust job.
const KEPT = [
  `${STEAM}/depot/select.ts`,
  `${STEAM}/depot/appinfoOrder.ts`,
  `${STEAM}/depot/cdnAuth.ts`,
  `${STEAM}/depot/contentServers.ts`,
  'patches/lzma.patch',
  'patches/steam-user.patch',
  'src-tauri/crates/gamelib-depot/tests/fixtures/expected.json'
]

// This file names every forbidden symbol by design.
const SELF = join(__dirname, 'depotPortComplete.test.ts')

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|cjs|js)$/.test(e.name)) out.push(full)
  }
}

const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('depot port complete (Phase 73 D-15)', () => {
  const files: string[] = []
  walk(join(ROOT, 'src'), files)
  walk(join(ROOT, 'meta'), files)
  const scanned = files.filter((f) => f !== SELF)

  it.each(DELETED)('%s stays deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it('no forbidden depot-pipeline or lzma-native symbol remains (comments stripped)', () => {
    const hits: string[] = []
    for (const f of scanned) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const needle of FORBIDDEN) {
        if (src.includes(needle)) hits.push(`${relative(ROOT, f)}: ${needle}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('the scan can fail: a forbidden symbol in code is caught, the same symbol in a comment is not', () => {
    const code = "const x = require('lzma-native')"
    const comment = '// lzma-native was removed in 73-21\n/* lzma-native */'
    expect(stripComments(code).includes('lzma-native')).toBe(true)
    expect(stripComments(comment).includes('lzma-native')).toBe(false)
  })

  it.each(KEPT)('%s is kept', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true)
  })

  it('package.json keeps lzma and zstddec (steam-user requires both at import) and drops lzma-native', () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8')
    ) as PackageJson
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps).toHaveProperty('lzma')
    expect(deps).toHaveProperty('zstddec')
    expect(deps).not.toHaveProperty('lzma-native')
  })

  it('pnpm still patches lzma and steam-user', () => {
    const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspace).toMatch(/^\s+lzma: patches\/lzma\.patch$/m)
    expect(workspace).toMatch(/^\s+steam-user: patches\/steam-user\.patch$/m)
  })

  it('anti-vacuity: the walk scanned a real tree', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(500)
  })
})
