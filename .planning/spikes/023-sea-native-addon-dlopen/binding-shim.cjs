// Spike 023, task 3: a `node-gyp-build` replacement, aliased in at esbuild
// bundle time (`--alias:node-gyp-build=./binding-shim.cjs`), the same
// mechanism CLASS as this repo's existing
// `--alias:electron=./src/backend/sidecar/electronStub.ts` fix.
//
// lzma-native's own index.js calls `require('node-gyp-build')(__dirname)` --
// after the alias, that becomes `resolveNativeBinding(__dirname)` below.
// `module.exports` MUST be the directly-callable function itself (lzma-native
// calls the module as a function), which is why this file is `.cjs`, not an
// ES module (an ES `export default` transpiled to `{ default: fn }` would
// not be directly callable the way lzma-native invokes it).
//
// FINDING (empirically confirmed this task, not assumed from the plan text):
// once esbuild BUNDLES lzma-native's index.js together with this shim into a
// single output file, `__dirname` inside BOTH files stops reflecting each
// file's ORIGINAL on-disk location and instead reflects the single bundled
// OUTPUT file's location at runtime (confirmed with a minimal two-file
// esbuild repro: a nested module's own `__dirname` printed the OUTPUT file's
// directory, not its source directory, and changed when the outfile moved).
// This is a known esbuild limitation for `--bundle` + CJS
// (__dirname/__filename are genuine Node runtime globals that only exist
// once, for the single executing file -- esbuild cannot make them differ
// per originally-separate source module in one output file). Concretely:
// the `dir` argument this function receives is NOT trustworthy for locating
// lzma-native's real package root once bundled -- it will be
// `build/`-relative (or, worse, meaningless inside an eval'd Worker with no
// backing file at all), never `.../node_modules/lzma-native`.
//
// Fix: the real prebuild location is resolved at BUILD TIME (see
// build-sea.mjs) and baked into `resolved-paths.generated.cjs` as plain
// string literals -- a plain `require()` of a small generated data file,
// with no `__dirname` dependency of its own, sidesteps the bundling
// limitation entirely. `dir` is still logged (useful forensic evidence,
// and still catches the "some OTHER bundled package also calls
// node-gyp-build" case via the console.error below) but is NOT used for
// path resolution.

const fs = require('fs')
const os = require('os')
const path = require('path')

/** Baked at build time -- see build-sea.mjs's writeResolvedPaths(). */
const { LZMA_NATIVE_PKG_ROOT, NATIVE_NODE_FILENAME } = require('./resolved-paths.generated.cjs')

/** SEA asset key literal -- plans 23.1-03/04 must use this exact string
 *  verbatim on both the build (sea-config.json `assets` key) and runtime
 *  (`sea.getRawAsset(...)`) sides. Deliberately NOT the real on-disk
 *  prebuild filename (`node.napi.node`, task 2's observed fact) -- the SEA
 *  asset key is an arbitrary dictionary key independent of the source
 *  filename it was embedded from. */
const SEA_ASSET_KEY = 'lzma_native.node'

module.exports = function resolveNativeBinding(dir) {
  console.error(
    `[binding-shim] resolveNativeBinding called with dir="${dir}" ` +
      `(NOTE: not used for path resolution -- see file header finding)`
  )

  let sea
  try {
    sea = require('node:sea')
  } catch {
    sea = null
  }

  if (sea && sea.isSea()) {
    console.error('[binding-shim] SEA branch: getRawAsset + dlopen')
    const raw = sea.getRawAsset(SEA_ASSET_KEY)
    // getRawAsset() returns the RAW backing buffer, not a copy -- never
    // write into it directly (Node docs warning). Buffer.from(raw) here
    // makes an actual copy before it ever reaches fs.writeFileSync.
    const addonPath = path.join(
      os.tmpdir(),
      `lzma-native-sea-${process.pid}-${Date.now()}.node`
    )
    fs.writeFileSync(addonPath, Buffer.from(raw))
    const m = { exports: {} }
    process.dlopen(m, addonPath)
    return m.exports
  }

  console.error('[binding-shim] dev branch: direct dlopen from resolved prebuild path')
  const platformArch = `${process.platform}-${process.arch}`
  const addonPath = path.join(
    LZMA_NATIVE_PKG_ROOT,
    'prebuilds',
    platformArch,
    NATIVE_NODE_FILENAME
  )
  if (!fs.existsSync(addonPath)) {
    throw new Error(
      `[binding-shim] dev branch: no prebuild at ${addonPath} (platformArch=${platformArch})`
    )
  }
  const m = { exports: {} }
  process.dlopen(m, addonPath)
  return m.exports
}

module.exports.SEA_ASSET_KEY = SEA_ASSET_KEY
