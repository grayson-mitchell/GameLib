/**
 * Phase 23.1 Plan 03: a `node-gyp-build` replacement, aliased in at esbuild
 * bundle time (`--alias:node-gyp-build=./lzmaNativeBinding.ts`,
 * `meta/esbuildWorkerBundleShared.ts`'s `seaEsbuildFlags()`) -- the SAME
 * mechanism CLASS as this repo's existing
 * `--alias:electron=./src/backend/platform/index.ts` fix, NOT the
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
 *
 * 261011-wrx (2026-10-11): the win32 prebuild `node.napi.node` is not
 * self-contained. 261011-mza measured its import table as exactly
 * `KERNEL32.dll` + `liblzma.dll`, and Windows resolves the latter BY NAME from
 * the addon's own directory first. The SEA used to embed only the addon and
 * write it loose into `os.tmpdir()`, so `dlopen` failed with "The specified
 * module could not be found." in 21 of 21 runs (`nativeWorkers:0`). The build
 * now embeds `liblzma.dll` as a second SEA asset (win32 only), and this file
 * extracts the addon plus the DLL into ONE private `mkdtempSync` directory --
 * never the shared temp root, because a writable directory beside a loaded
 * addon is a DLL-planting surface (the shared root is exactly that).
 */

import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
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
 * 261011-wrx: SEA dictionary key of the win32 companion `liblzma.dll` --
 * MUST equal `meta/buildSidecarSea.ts`'s `LZMA_NATIVE_DLL_ASSET_KEY`
 * verbatim. Duplicated (not imported) because `src/` cannot import from
 * `meta/`; guarded by a two-sided literal test like the addon key above.
 */
const LZMA_NATIVE_DLL_SEA_ASSET_KEY = 'liblzma.dll'

/**
 * 261011-wrx: the on-disk name the extracted DLL must carry. Load-bearing:
 * Windows resolves the addon's `liblzma.dll` import BY NAME from the addon's
 * own directory, so this must equal the name in `node.napi.node`'s import
 * table (measured by 261011-mza: `KERNEL32.dll` + `liblzma.dll`).
 */
const LZMA_NATIVE_WIN32_DLL_FILENAME = 'liblzma.dll'

/**
 * 261011-wrx: `Symbol.for(...)` key under which the SEA branch records
 * `{ dir, leftover }` on `globalThis`, per isolate. `lzmaLoader.ts` reads the
 * record to put the extraction directory and its fate in the engaged log
 * line. It is a `globalThis` registry rather than an import because the
 * loader never imports this file (it imports `lzma-native`, which reaches
 * this file only through the esbuild alias).
 */
const LZMA_NATIVE_EXTRACTION_RECORD_KEY = 'gamelib.lzmaNative.extraction'

/**
 * `mkdtempSync` prefix for the SEA branch's private extraction directory --
 * exported (as a property of the callable default below) so a test can
 * assert it directly.
 *
 * SECURITY (T-23.1-03-01, rewritten 261011-wrx): a fixed or predictable
 * path in the world-writable `os.tmpdir()` would let a local attacker
 * pre-place a hostile `.node` (or, now that the addon imports a sibling
 * `liblzma.dll`, a hostile DLL) and have the sidecar load it. Unpredictability
 * and exclusivity now come from `mkdtempSync`'s atomic create-NEW-directory:
 * it cannot succeed on a pre-existing path. The old per-file random name
 * loose in the shared temp root is retired -- the DLL must sit next to the
 * addon, and the shared root is exactly the planting surface.
 */
function nativeExtractDirPrefix(): string {
  return join(tmpdir(), `${LZMA_NATIVE_EXTRACT_DIR_NAME_PREFIX}${process.pid}-`)
}

/**
 * 261012-82w: the fixed leading part of every extraction directory name.
 * `nativeExtractDirPrefix()` (the minting side) and `STALE_EXTRACT_DIR_NAME`
 * (the sweep side) both build from this one constant, so the pattern the
 * sweep matches and the names the binding mints cannot drift apart.
 */
const LZMA_NATIVE_EXTRACT_DIR_NAME_PREFIX = 'gamelib-lzma-native-'

/**
 * 261012-82w: upper bound on liveness probes (and therefore lstats and
 * removals) per sweep call. Bounds boot cost against a pathological temp dir.
 */
const LZMA_NATIVE_STALE_SWEEP_MAX_DIRS = 64

/**
 * 261012-82w: `Symbol.for(...)` key under which the SEA branch records the
 * sweep's `{ examined, removed }` on `globalThis`, per isolate. `lzmaLoader.ts`
 * reads it by the same literal to put a sentence in its engaged log line --
 * the same `globalThis`-registry design (and the same reason) as
 * `LZMA_NATIVE_EXTRACTION_RECORD_KEY`.
 */
const LZMA_NATIVE_STALE_SWEEP_RECORD_KEY = 'gamelib.lzmaNative.staleSweep'

/**
 * A name `mkdtempSync(nativeExtractDirPrefix())` could have minted: the
 * prefix, a decimal pid, a dash, and mkdtemp's six-character alphanumeric
 * suffix (measured: 200 of 200 on the dev box). Anchored at both ends.
 */
const STALE_EXTRACT_DIR_NAME = new RegExp(
  `^${LZMA_NATIVE_EXTRACT_DIR_NAME_PREFIX}(\\d{1,10})-[A-Za-z0-9]{6}$`
)

/**
 * 261012-82w: removes extraction directories left in `root` by sidecar
 * processes that have exited, and returns `{ examined, removed }`. Called on
 * win32 only, immediately before this binding's own `mkdtempSync`, because on
 * Windows a loaded addon (and the `liblzma.dll` it maps) cannot be unlinked
 * while its process runs, so every decode worker of every native-engaged
 * sidecar leaves one directory behind (measured 261011-wrx: 16 per
 * packaged-app session). The operator chose this sweep over a once-per-
 * process extraction.
 *
 * Why each guard exists:
 * - The snapshot (`readdirSync`) comes BEFORE the probe, and that ordering is
 *   load-bearing. Every name in the snapshot was minted by a process holding
 *   that pid before the snapshot was taken. An ESRCH afterwards therefore
 *   proves that process has exited; a pid reused since can only make the
 *   probe SUCCEED, which means skip.
 * - Own pid is skipped (at no cost to the budget): sibling decode worker
 *   threads share `process.pid`, and their directories are live.
 * - Pid 0 and pids above 0x7fffffff are skipped. `process.kill(0, 0)` targets
 *   the process group on POSIX and did not throw on win32 when measured.
 * - The cap (`LZMA_NATIVE_STALE_SWEEP_MAX_DIRS`) bounds boot cost.
 * - Synchronous only. This is the sidecar exit contract: the sidecar exits by
 *   event-loop drain at stdin EOF, so nothing may be added to the loop -- no
 *   timer, no promise, no async fs.
 * - A fresh `lstatSync` at delete time mirrors `reapStaleRoots()` in
 *   `src/backend/jest.globalSetup.js`: a symlink or junction planted at a
 *   matching name is never followed, a non-directory is never removed, and an
 *   entry a sibling worker already removed (lstat returns undefined) is not
 *   counted twice.
 * - Only ESRCH deletes. Measured 2026-10-12 on Node v24.19.0 (win32), main
 *   thread and a `worker_threads` Worker alike: a dead pid throws ESRCH, pid 4
 *   (System) throws EPERM, the own pid does not throw, and pid 0 does not
 *   throw. EPERM or any other outcome means the owner may be alive: keep.
 * - Every error is swallowed. A sweep failure must never stop the extraction,
 *   `dlopen` or the `finally` cleanup that follow it.
 */
function sweepStaleExtractDirs(root: string = tmpdir()): {
  examined: number
  removed: number
} {
  let examined = 0
  let removed = 0
  try {
    let names: string[]
    try {
      names = readdirSync(root)
    } catch {
      return { examined: 0, removed: 0 }
    }
    for (const name of names) {
      const match = STALE_EXTRACT_DIR_NAME.exec(name)
      if (!match) {
        continue
      }
      const pid = Number(match[1])
      if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fffffff) {
        continue
      }
      if (pid === process.pid) {
        continue
      }
      if (examined >= LZMA_NATIVE_STALE_SWEEP_MAX_DIRS) {
        break
      }
      examined++
      try {
        process.kill(pid, 0)
        continue // probe succeeded: the owner is alive
      } catch (probeErr) {
        const code =
          typeof probeErr === 'object' && probeErr !== null
            ? (probeErr as { code?: unknown }).code
            : undefined
        if (code !== 'ESRCH') {
          continue
        }
      }
      try {
        const full = join(root, name)
        const stats = lstatSync(full, { throwIfNoEntry: false })
        if (!stats || !stats.isDirectory() || stats.isSymbolicLink()) {
          continue
        }
        rmSync(full, { recursive: true, force: true })
        removed++
      } catch {
        // Skip this entry; the next one is independent.
      }
    }
  } catch {
    // Unexpected: report the counts reached so far, never throw.
  }
  return { examined, removed }
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

  let sea: {
    isSea: () => boolean
    getRawAsset: (key: string) => ArrayBuffer
  } | null = null
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
    //
    // Read BOTH assets before any filesystem write, so a missing asset
    // throws without creating a directory.
    const raw = sea.getRawAsset(LZMA_NATIVE_SEA_ASSET_KEY)
    const dllRaw =
      process.platform === 'win32'
        ? sea.getRawAsset(LZMA_NATIVE_DLL_SEA_ASSET_KEY)
        : undefined

    // 261012-82w: reclaim directories left by exited processes before minting
    // our own. win32 only: on POSIX the `finally` unlink below succeeds, so
    // nothing accumulates, and /tmp there can be shared across users and pid
    // namespaces where ESRCH does not prove the owner is gone. %TEMP% on
    // Windows is per-user and pids are system-global. (Operator-chosen sweep,
    // option 2 of the accumulation todo's "Decision the operator owes".)
    if (process.platform === 'win32') {
      ;(globalThis as unknown as Record<symbol, unknown>)[
        Symbol.for(LZMA_NATIVE_STALE_SWEEP_RECORD_KEY)
      ] = sweepStaleExtractDirs(tmpdir())
    }

    // ONE private directory per extraction (T-23.1-03-01, 261011-wrx).
    // Outside the try: if mkdtemp itself throws there is nothing to clean.
    const dir = mkdtempSync(nativeExtractDirPrefix())
    const addonPath = join(dir, LZMA_NATIVE_ADDON_FILENAME)
    let leftover = false

    const nativeModule: { exports: unknown } = { exports: {} }
    try {
      // mkdtemp's requested 0700 is masked by the umask (umask 0277 yields
      // 0500), so the chmod restores owner-write; it is not redundant. On
      // Windows the per-user temp-root ACL is the real control and 0o700
      // only clears the read-only bit.
      chmodSync(dir, 0o700)
      if (dllRaw !== undefined) {
        writeFileSync(
          join(dir, LZMA_NATIVE_WIN32_DLL_FILENAME),
          Buffer.from(dllRaw),
          { mode: 0o600 }
        )
      }
      writeFileSync(addonPath, Buffer.from(raw), { mode: 0o600 })
      process.dlopen(nativeModule, addonPath)
    } finally {
      // Runs on BOTH paths so a failed dlopen cannot leave an executable
      // .node (or its DLL) behind in os.tmpdir(). The dlopen error still
      // propagates (no catch here) and `cachedBinding` stays unassigned, so
      // a later call retries.
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // Expected/ignorable on Windows, where a file backing a currently
        // loaded native module (the addon, or the liblzma.dll it maps)
        // cannot be unlinked while it is still mapped into the process. On
        // the throw path nothing is mapped, so removal succeeds on every OS;
        // this catch exists for the success path on Windows. Recorded below
        // so the loader can surface the leftover.
        leftover = true
      }
      ;(globalThis as unknown as Record<symbol, unknown>)[
        Symbol.for(LZMA_NATIVE_EXTRACTION_RECORD_KEY)
      ] = { dir, leftover }
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
  LZMA_NATIVE_DLL_SEA_ASSET_KEY: string
  LZMA_NATIVE_WIN32_DLL_FILENAME: string
  LZMA_NATIVE_EXTRACTION_RECORD_KEY: string
  nativeExtractDirPrefix: () => string
  sweepStaleExtractDirs: typeof sweepStaleExtractDirs
  LZMA_NATIVE_STALE_SWEEP_MAX_DIRS: number
  LZMA_NATIVE_STALE_SWEEP_RECORD_KEY: string
}

const lzmaNativeBinding = resolveNativeBinding as LzmaNativeBindingResolver
lzmaNativeBinding.LZMA_NATIVE_SEA_ASSET_KEY = LZMA_NATIVE_SEA_ASSET_KEY
lzmaNativeBinding.LZMA_NATIVE_ADDON_FILENAME = LZMA_NATIVE_ADDON_FILENAME
lzmaNativeBinding.LZMA_NATIVE_DLL_SEA_ASSET_KEY = LZMA_NATIVE_DLL_SEA_ASSET_KEY
lzmaNativeBinding.LZMA_NATIVE_WIN32_DLL_FILENAME =
  LZMA_NATIVE_WIN32_DLL_FILENAME
lzmaNativeBinding.LZMA_NATIVE_EXTRACTION_RECORD_KEY =
  LZMA_NATIVE_EXTRACTION_RECORD_KEY
lzmaNativeBinding.nativeExtractDirPrefix = nativeExtractDirPrefix
lzmaNativeBinding.sweepStaleExtractDirs = sweepStaleExtractDirs
lzmaNativeBinding.LZMA_NATIVE_STALE_SWEEP_MAX_DIRS =
  LZMA_NATIVE_STALE_SWEEP_MAX_DIRS
lzmaNativeBinding.LZMA_NATIVE_STALE_SWEEP_RECORD_KEY =
  LZMA_NATIVE_STALE_SWEEP_RECORD_KEY

// CJS export-assignment shape, deliberately NOT `export = `/`export default`
// -- see this file's header comment for the full rationale (TS1203 under
// this repo's `"module": "esnext"` tsconfig, and the esbuild ESM-interop
// wrapping that any `export` keyword would trigger for a bundled alias
// target).
module.exports = lzmaNativeBinding
