/**
 * Phase 23.1 Plan 03: a `node-gyp-build` replacement, aliased in at esbuild
 * bundle time (`--alias:node-gyp-build=./lzmaNativeBinding.ts`,
 * `meta/esbuildWorkerBundleShared.ts`'s `seaEsbuildFlags()`) -- the SAME
 * mechanism CLASS as this repo's existing
 * `--alias:electron=./src/backend/sidecar/electronStub.ts` fix, NOT the
 * `pnpm.patchedDependencies` computed-require rewrite RESEARCH.md Pitfall 4
 * rules out for a native addon.
 *
 * `lzma-native`'s own `index.js` calls `require('node-gyp-build')(__dirname)`
 * -- after the alias, that call becomes `resolveNativeBinding(__dirname)`
 * below. `module.exports` MUST be the directly-callable function itself
 * (`lzma-native` invokes the module AS a function), so this file deliberately
 * carries NO ECMAScript `export` keyword anywhere -- not even `export
 * const`/`export function` for its "named" values, which are instead
 * attached as properties on the exported function object. TypeScript's own
 * CJS-export-assignment syntax (`export = resolveNativeBinding`, what the
 * spike's reference shim's mechanism class maps to) does NOT compile under
 * this repo's actual `tsconfig.json` (`"module": "esnext"` -- verified via a
 * direct `tsc` probe: `export =` throws TS1203, "Export assignment cannot be
 * used when targeting ECMAScript modules"). Mixing `export const` with
 * `export =` is independently disallowed by TypeScript itself (TS1231). This
 * is a Rule-1 fix over the plan's literal text, which assumed a mechanism
 * that cannot pass `pnpm codecheck` in this repo: a bare `module.exports =`
 * assignment (with attached properties) type-checks cleanly under the exact
 * project tsconfig flags and produces the identical bundled CJS shape esbuild
 * needs (verified empirically: a bundled alias target with ANY `export`
 * keyword gets ESM-interop-wrapped by esbuild into `{ default: fn,
 * __esModule: true }`, which is not directly callable and reproduces the
 * exact "not a function" crash this file exists to avoid; a target with only
 * `import` statements and a raw `module.exports = fn` assignment survives
 * `--format=cjs` bundling untouched). Other TypeScript files that need this
 * module's values (this plan's own test file) reach it via a guarded
 * `require(...)` + type cast, mirroring the `require('node:sea')` convention
 * `decompressPool.ts`'s `resolveWorkerSpec()` and
 * `humbleFlowRegistration.ts`'s `isPackagedSidecar()` already use -- not an
 * oversight, the same deliberate mechanism class.
 *
 * FINDING carried forward from spike 023 (`.planning/spikes/
 * 023-sea-native-addon-dlopen/binding-shim.cjs`, `README.md`): once esbuild
 * BUNDLES `lzma-native`'s `index.js` together with this shim into a single
 * output file, `__dirname` inside BOTH files stops reflecting each file's
 * ORIGINAL on-disk location and instead reflects the single bundled OUTPUT
 * file's location at runtime -- confirmed empirically by the spike with a
 * minimal two-file esbuild repro, and CONFIRMED LIVE twice this phase (plan
 * 23.1-05, 2026-08-18): a real compiled SEA binary's eval'd worker (`dir`
 * arrived as `"."`, since an eval'd worker has no backing file at all) and a
 * real dev-mode `pnpm tauri:dev` build (`dir` arrived as the worker bundle's
 * own OUTPUT directory, `.../build/main`) -- two DIFFERENT collapsed values,
 * neither `lzma-native`'s real package root, confirming this is not a
 * single fixable edge case but a structural property of bundling: `dir` is
 * NOT a reliable way to locate `lzma-native`'s real package root once this
 * shim is reached via the ALIASED indirect path from inside a bundled
 * worker, in EITHER build.
 *
 * FIX (plan 23.1-05, reusing spike 023's own proven mechanism rather than
 * reinventing it): the real package root is now resolved at BUILD TIME
 * (`meta/esbuildWorkerBundleShared.ts`'s `writeLzmaNativeResolvedPaths()`,
 * called by both `buildSidecarSea.ts` and `buildDecompressWorkerDev.ts`
 * before their esbuild invocations) and baked into a generated data module,
 * `lzmaNativeResolvedPaths.generated.cjs` -- exactly the `resolved-paths
 * .generated.cjs` pattern the spike's `build-sea.mjs` used, ported into
 * this project's real build pipeline instead of the plan-03 placeholder
 * that deferred it. `dir` is no longer used for PATH RESOLUTION at all (see
 * `resolveLzmaNativePkgRoot()` below) -- only the SEA/dev-mode BRANCH
 * decision (`sea.isSea()`) still matters, and that was never `dir`-derived.
 *
 * The T-23.1-03-02 (Spoofing) SECURITY property `dir`-based rejection used
 * to provide -- some OTHER bundled package's own `node-gyp-build` call must
 * not silently receive lzma-native's native binding -- is NOT dropped, it
 * is RELOCATED to build time, where it can actually be evaluated reliably:
 * `assertNodeGypBuildSingleConsumer()` (same shared module) scans the REAL,
 * unbundled dependency tree for any other `node-gyp-build` consumer and
 * fails the build loudly if one exists, BEFORE either worker bundle is even
 * produced. This is strictly MORE reliable than the runtime check it
 * replaces: once bundled, EVERY caller reaching this alias -- lzma-native or
 * a hypothetical other package -- passes the exact same collapsed `dir`
 * value, so no runtime inspection of `dir` could ever have distinguished
 * them anyway, a fact this exact live-hardware finding demonstrates
 * directly (two different real builds, two different collapsed values,
 * neither meaningful).
 */

import { writeFileSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * SEA asset key literal -- MUST equal `meta/buildSidecarSea.ts`'s
 * `LZMA_NATIVE_ASSET_KEY` verbatim on both the build (`sea-config.json`
 * `assets` key) and runtime (`sea.getRawAsset(...)`) sides. Duplicated here
 * (not imported) because `src/` cannot import from `meta/` -- the identical
 * arrangement `SEA_WORKER_ASSET_KEY` already has between `buildSidecarSea.ts`
 * and `decompressPool.ts`, guarded there (and here) by a two-sided literal
 * test. Deliberately NOT the real on-disk prebuild filename -- the SEA asset
 * key is an arbitrary dictionary key independent of the source filename it
 * was embedded from (23.1-01-SUMMARY.md, spike 023).
 */
const LZMA_NATIVE_SEA_ASSET_KEY = 'lzma_native.node'

/**
 * 23.1-01-SUMMARY's spike OBSERVED this filename by listing
 * `node_modules/lzma-native/prebuilds/` after a real install -- it is NOT the
 * `lzma_native.node` value PATTERNS.md originally assumed. Every triple also
 * ships an `electron.napi.node` sibling this project never touches (the
 * sidecar/worker here is plain Node, not Electron).
 */
const LZMA_NATIVE_ADDON_FILENAME = 'node.napi.node'

/**
 * Pure path builder for the SEA branch's `dlopen()` target -- exported (as a
 * property of the callable default below) so a test can assert
 * unpredictability directly.
 *
 * SECURITY (T-23.1-03-01): a fixed or predictable filename in the
 * world-writable `os.tmpdir()` would let a local attacker pre-place a
 * hostile `.node` at that exact path and have the sidecar `dlopen()` it. The
 * pid + 8 random bytes make the path unpredictable per invocation; the
 * Node docs' own `myaddon.node` fixed-name example is deliberately NOT
 * copied here.
 */
function nativeAddonTempPath(): string {
  return join(
    tmpdir(),
    `gamelib-lzma-native-${process.pid}-${randomBytes(8).toString('hex')}.node`
  )
}

/**
 * Phase 23.1 plan 05: replaces the retired `dir`-based
 * `dirBelongsToLzmaNative()` guard for the DEV branch's path resolution --
 * see this file's own header for why `dir` is structurally unusable for
 * this once bundled. Prefers the build-time-generated data module (the
 * REAL mechanism inside either compiled worker bundle -- this `require()`
 * of a relative, no-`__dirname`-dependency specifier gets resolved by
 * esbuild reading the file's actual on-disk content at BUILD TIME and
 * inlining it as a literal object, immune to the collapse). Falls back to
 * resolving it live via this (unbundled) module's own real `__dirname`/
 * module resolution when the generated file is absent -- the case for this
 * file's own unit tests (never bundled by esbuild) and a fresh checkout
 * whose build pipeline hasn't run yet.
 */
function resolveLzmaNativePkgRoot(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const generated = require('./lzmaNativeResolvedPaths.generated.cjs') as {
      LZMA_NATIVE_PKG_ROOT?: string
    }
    if (generated?.LZMA_NATIVE_PKG_ROOT) {
      return generated.LZMA_NATIVE_PKG_ROOT
    }
  } catch {
    // Generated file absent -- fall through to a live resolution below.
    // Not logged: this is the EXPECTED path for this file's own unit tests,
    // which never run through the esbuild alias at all.
  }
  return dirname(require.resolve('lzma-native/package.json'))
}

/** Module-scope memoization -- matches `getLzma()`'s once-per-isolate
 *  caching discipline. Two calls in the same process/isolate must not
 *  `getRawAsset()`/`dlopen()` a second time. */
let cachedBinding: unknown

/**
 * The callable export itself. `lzma-native` calls this AS a function
 * (`require('node-gyp-build')(__dirname)`), so this MUST stay the directly
 * invocable value assigned to `module.exports` at the bottom of this file --
 * see the file header for why an ES `export` of any kind (including `export
 * default`) would break that shape once bundled.
 *
 * This function throws on ANY failure (missing SEA asset, missing/unresolved
 * dev-mode prebuild, a `dlopen()` failure). It never degrades to a pure-JS
 * fallback itself -- plan 23.1-04's loader is the one layer that catches and
 * degrades, so that decision lives in exactly one place and is logged there
 * (not duplicated/silently re-decided here).
 *
 * Phase 23.1 plan 05: `dir` is accepted (matches `lzma-native`'s own
 * `require('node-gyp-build')(__dirname)` call shape) but deliberately NOT
 * used for path resolution or as an identity gate anymore -- see this
 * file's header comment for the live-hardware finding that made the
 * previous `dirBelongsToLzmaNative()` throw-gate reject the legitimate
 * call, and why no runtime `dir` inspection can distinguish callers once
 * genuinely bundled. The T-23.1-03-02 security property this used to
 * provide now lives at BUILD TIME (`assertNodeGypBuildSingleConsumer()`,
 * `meta/esbuildWorkerBundleShared.ts`, called before either worker bundle
 * is produced).
 */
function resolveNativeBinding(_dir: string): unknown {
  if (cachedBinding !== undefined) {
    return cachedBinding
  }

  let sea: { isSea: () => boolean; getRawAsset: (key: string) => ArrayBuffer } | null =
    null
  try {
    // node:sea is a Node builtin; a guarded runtime require (not a
    // relative/alias path) is the deliberate mechanism here, mirroring
    // decompressPool.ts's resolveWorkerSpec() and
    // humbleFlowRegistration.ts's isPackagedSidecar() -- not an oversight.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sea = require('node:sea') as {
      isSea: () => boolean
      getRawAsset: (key: string) => ArrayBuffer
    }
  } catch {
    // node:sea unavailable (older/dev Node) -- fall through to the dev
    // branch below.
    sea = null
  }

  if (sea && sea.isSea()) {
    // getRawAsset() returns the RAW backing buffer of the SEA blob, not a
    // copy (Node docs warning). Buffer.from(arrayBuffer) creates a VIEW over
    // that same memory -- still not a copy -- so this code only ever READS
    // through it (via writeFileSync below) and never writes into it,
    // guaranteeing it cannot corrupt other assets sharing the blob
    // (T-23.1-03-04).
    const raw = sea.getRawAsset(LZMA_NATIVE_SEA_ASSET_KEY)
    const addonPath = nativeAddonTempPath()
    writeFileSync(addonPath, Buffer.from(raw), { mode: 0o600 })

    const nativeModule: { exports: unknown } = { exports: {} }
    process.dlopen(nativeModule, addonPath)

    try {
      rmSync(addonPath)
    } catch {
      // Expected/ignorable on Windows, where a file backing a currently
      // loaded native module cannot be unlinked while it is still mapped
      // into the process.
    }

    cachedBinding = nativeModule.exports
    return cachedBinding
  }

  // Dev branch (also the fall-through when the SEA branch's try/catch
  // fires). Deliberately does NOT delegate to the real `node-gyp-build`
  // module -- the esbuild alias rewrites that specifier straight back to
  // THIS file, so a `require('node-gyp-build')` call at this point would
  // recurse infinitely (T-23.1-03-03). This is the single most likely thing
  // a future maintainer would "simplify" back into that infinite loop.
  //
  // Phase 23.1 plan 05: resolves the package root via
  // `resolveLzmaNativePkgRoot()` (build-time-baked, or a live fallback for
  // this file's own unit tests) instead of the `dir` argument -- see this
  // file's header for why `dir` cannot be trusted here once bundled.
  const addonPath = join(
    resolveLzmaNativePkgRoot(),
    'prebuilds',
    `${process.platform}-${process.arch}`,
    LZMA_NATIVE_ADDON_FILENAME
  )
  const nativeModule: { exports: unknown } = { exports: {} }
  process.dlopen(nativeModule, addonPath)
  cachedBinding = nativeModule.exports
  return cachedBinding
}

/**
 * Typed view of the callable-with-attached-statics shape assigned to
 * `module.exports` below -- lets TypeScript check the property assignments
 * that follow without widening `resolveNativeBinding`'s own declared type.
 */
interface LzmaNativeBindingResolver {
  (dir: string): unknown
  LZMA_NATIVE_SEA_ASSET_KEY: string
  LZMA_NATIVE_ADDON_FILENAME: string
  nativeAddonTempPath: () => string
}

const lzmaNativeBinding = resolveNativeBinding as LzmaNativeBindingResolver
lzmaNativeBinding.LZMA_NATIVE_SEA_ASSET_KEY = LZMA_NATIVE_SEA_ASSET_KEY
lzmaNativeBinding.LZMA_NATIVE_ADDON_FILENAME = LZMA_NATIVE_ADDON_FILENAME
lzmaNativeBinding.nativeAddonTempPath = nativeAddonTempPath

// CJS export-assignment shape, deliberately NOT `export = `/`export default`
// -- see this file's header comment for the full rationale (TS1203 under
// this repo's `"module": "esnext"` tsconfig, and the esbuild ESM-interop
// wrapping that any `export` keyword would trigger for a bundled alias
// target).
module.exports = lzmaNativeBinding
