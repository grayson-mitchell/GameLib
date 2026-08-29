/**
 * Phase 34 Plan 02 (D-06): compiles the Node sidecar into a self-contained
 * per-OS executable via Node's Single Executable Application (SEA) feature
 * -- the "legacy 2-step" workflow (34-RESEARCH.md Pattern 3), since
 * `--build-sea` (Node 25.5.0+) is not available on this project's LTS
 * `engines.node` (`>=22`) line.
 *
 * Output: `src-tauri/binaries/gamelib-sidecar-<host-triple>[.exe]` -- the
 * Tauri `externalBin` (34-05) and CI matrix (34-06) both consume this.
 * Run with `pnpm build:sidecar-sea` (chains `pnpm build:sidecar` first).
 *
 * Follows the `meta/buildSteamBridgeShims.ts` packaging-time build-script
 * convention: argv-form spawn only (T-24-06, never a shell string), pure
 * exported argv-builders so tests can assert command construction without
 * invoking the real node/postject/codesign toolchain, and a fail-loud
 * compile gate (non-zero exit OR a missing output file both throw) --
 * orthogonal to D-04's CI signing graceful-skip, which applies only to OS
 * code signing, never to this sidecar compile step.
 *
 * Rule-1 fixes (found by direct empirical test against a real compiled SEA
 * binary, not assumed from research -- each crash below was reproduced,
 * diagnosed, and fixed this session):
 *
 * 1. `pnpm build:sidecar`'s esbuild invocation uses `--packages=external`,
 *    which leaves every node_modules dependency as a literal, unresolved
 *    `require('pkg')` call in `build/main/sidecar.js` -- fine for
 *    dev/Electron (a real node_modules sits next to it), but SEA's runtime
 *    can ONLY `require()` Node built-ins by default (34-RESEARCH.md
 *    Pitfall 3), and does so via a special `embedderRequire` that bypasses
 *    Node's normal `Module`/`Module._load` machinery entirely -- so even a
 *    `Module._load` monkeypatch (like this project's own
 *    `installElectronHook.ts`, used for the dev/Electron builds) has NO
 *    effect inside a compiled SEA binary. Fixed by bundling a fully
 *    self-contained copy for the SEA path specifically (`bundleForSea()`
 *    below), separate from `build:sidecar`'s dev/Electron output ("extend,
 *    do NOT replace").
 * 2. `electron`/`electron-store` are both genuinely reachable at sidecar
 *    startup (electron-store is a real, direct dependency of
 *    `backend/electron_store.ts`/`sidecar/handlers.ts`, not merely
 *    Electron-guarded) -- bundling them naively still crashes, because
 *    `electron-store`'s own top-level `require('electron')` becomes just
 *    another unresolvable SEA require. Fixed with esbuild's `--alias`,
 *    statically replacing every `electron` import/require (first-party AND
 *    inside bundled third-party code) with this project's own
 *    `backend/platform/index.ts` at BUILD time -- the runtime
 *    `Module._load` hook approach this repo otherwise relies on cannot
 *    reach a SEA binary (see point 1), so this is a deliberately different
 *    mechanism for the SEA bundle only.
 * 3. `@doctormckay/steam-crypto` (a transitive `steam-user` dependency)
 *    reads a small bundled public-key file via
 *    `readFileSync(__dirname + '/system.pem')` -- a runtime-computed path
 *    esbuild cannot statically inline. Fixed with a small `fs.readFileSync`
 *    monkeypatch (`meta/sidecarSeaFsShim.ts`, wired in via esbuild
 *    `--inject`) that serves the certificate's well-known public bytes
 *    directly for that one path, passing every other read through
 *    unmodified.
 * 4. `steam-user`'s `cdn_compression.js` and the `lzma` package's own
 *    `index.js` both call `require()` with a RUNTIME-COMPUTED specifier
 *    (`requireWithFallback('lzma-native', 'lzma')` and
 *    `require(path.join(__dirname, 'src', 'lzma_worker.js'))`
 *    respectively) -- esbuild cannot bundle a computed require, and this
 *    ran unconditionally at module load (not lazily), crashing every
 *    startup. Neither call's actual resolved target ever varies in this
 *    project (`lzma-native` is never installed; `__dirname` is always the
 *    package's own directory), so both were fixed with a `pnpm patch`
 *    (`patches/steam-user.patch`, `patches/lzma.patch`) replacing each
 *    computed call with the literal, statically-bundleable target it
 *    always resolved to anyway -- a behavior-neutral simplification, not a
 *    functional change, applied via this repo's existing
 *    `pnpm.patchedDependencies` mechanism (already used for
 *    `@types/node`).
 *
 * Verified end-to-end: the resulting bundle, run under a fully PATH- and
 * node_modules-scrubbed environment, starts, prints `READY_SENTINEL`, and
 * responds to the online-connectivity check with no crash.
 *
 * 5. CR-01 fix (34-08, code-review BLOCKER): the output triple comes from
 *    `GAMELIB_SIDECAR_TARGET_TRIPLE` (set per matrix leg by
 *    `.github/workflows/release-tauri.yml`, 34-11), with a `hostTriple()`
 *    fallback for local/dev builds -- NOT from `process.arch`/
 *    `process.platform` of the machine running this script. Before this
 *    fix, both `macos-latest` matrix legs (Apple-Silicon-native runners)
 *    always produced `aarch64-apple-darwin` regardless of `--target`. A
 *    cross-arch build (target triple != host triple) downloads and
 *    SHA-256-verifies the official nodejs.org Node binary for that triple
 *    rather than copying `process.execPath` (relabeling a host binary was
 *    explicitly rejected, GAP-D-02); `lipo -archs` then gates the
 *    resulting binary's real Mach-O architecture before it can ship.
 *
 * 6. Quick task 260817-pkx fix (debug/humankind-depot-full-stall.md): what
 *    used to be documented here as "Pitfall 1" -- decompressPool.ts's
 *    worker_threads pool never engaging inside the compiled SEA sidecar
 *    because it resolved `decompressWorker.js` relative to `__dirname`, a
 *    companion file the SEA executable never ships -- was NOT the accepted
 *    tradeoff it was recorded as. Five live HUMANKIND runs confirmed it was
 *    the CONFIRMED dominant throughput ceiling (~1.5h vs Steam's ~5min).
 *    Fixed by embedding a SECOND, fully self-contained esbuild bundle of
 *    `decompressWorker.ts` directly inside the SEA blob as a named
 *    `sea-config.json` asset (`bundleWorkerForSea()`, `buildSeaConfig()`
 *    below) -- read back at runtime via `require('node:sea').getAsset(...)`
 *    and spawned with `new Worker(source, { eval: true })`. This ships no
 *    companion file next to the binary, so there is nothing for Tauri
 *    `externalBin`/bundle-resources to carry, nothing to copy per matrix
 *    leg, and no `__dirname`/`process.execPath` path resolution to get
 *    wrong per OS -- see decompressPool.ts's `resolveWorkerSpec()` for the
 *    runtime consumer and the debug file for the full evidence trail.
 */

import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  unlink,
  writeFile
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
// Debug/dev-mode-decompress-worker-electron-hook: these four were extracted
// into a side-effect-free shared module so `meta/buildDecompressWorkerDev.ts`
// can reuse them WITHOUT importing this file directly -- importing this file
// runs the full SEA build as a module-scope side effect (see this module's
// own bottom guard), which is safe only under jest (`JEST_WORKER_ID`), never
// from another CLI script. Re-exported below so this file's own existing
// imports/tests are unaffected.
import {
  DECOMPRESS_WORKER_ENTRY_PATH,
  resolveEsbuildCli,
  seaEsbuildFlags,
  spawnArgv,
  assertNodeGypBuildSingleConsumer,
  writeLzmaNativeResolvedPaths
} from './esbuildWorkerBundleShared'

export {
  DECOMPRESS_WORKER_ENTRY_PATH,
  resolveEsbuildCli,
  seaEsbuildFlags,
  spawnArgv,
  assertNodeGypBuildSingleConsumer,
  writeLzmaNativeResolvedPaths
}

// Official/fixed sentinel fuse string -- do not alter
// (https://nodejs.org/api/single-executable-applications.html).
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const SIDECAR_ENTRY_PATH = join('src', 'sidecar', 'index.ts')

// A SEA-only, FULLY self-contained bundle (no --packages=external) --
// deliberately separate from `pnpm build:sidecar`'s
// `build/main/sidecar.js` dev/Electron output (see Rule-1 fix note above).
// electron/electron-store stay external: the sidecar's Electron-guarded
// code paths never reach them at runtime outside an Electron host, and
// neither package is present for a SEA-packaged Tauri build to resolve.
const SEA_BUNDLE_PATH = join('build', 'main', 'sidecar-sea-bundle.js')

// Both intermediate artifacts live under the already-gitignored `/build`
// directory -- no new .gitignore entries needed at the repo root.
const SEA_CONFIG_PATH = join('build', 'sea-config.json')
const SEA_BLOB_PATH = join('build', 'sidecar-prep.blob')

// Debug/humankind-depot-full-stall (2026-08-17): a SECOND, fully
// self-contained esbuild bundle of decompressPool.ts's worker script,
// embedded into the SEA blob as a named `sea-config.json` asset (see
// `buildSeaConfig()` below) rather than shipped as a companion file next to
// the compiled binary -- SEA's runtime resolves worker/asset content via
// `node:sea.getAsset()`, not the filesystem, so there is nothing for Tauri
// `externalBin`/bundle-resources to carry and no `__dirname`/
// `process.execPath` path resolution to get wrong per OS. See
// decompressPool.ts's `resolveWorkerSpec()` for the runtime consumer.
const SEA_WORKER_BUNDLE_PATH = join(
  'build',
  'main',
  'decompressWorker-sea-bundle.js'
)
/** SEA asset key both this build script and decompressPool.ts's runtime
 *  `sea.getAsset()` call must agree on verbatim -- exported so a test can
 *  assert the two sides never drift apart. */
export const SEA_WORKER_ASSET_KEY = 'decompressWorker.js'

// 23.1-02 (spike 023 VALIDATED, 23.1-01-SUMMARY): the native lzma-native
// addon, embedded as a SECOND named SEA asset alongside the decompress
// worker. `LZMA_NATIVE_ASSET_KEY` is the arbitrary dictionary key the SEA
// blob's `assets` map uses -- exported (like SEA_WORKER_ASSET_KEY above) so
// a test can assert the two sides never drift apart. Plan 23.1-03's
// `lzmaNativeBinding.ts` passes this SAME literal to `sea.getRawAsset()` at
// runtime; the runtime side duplicates the literal rather than importing it
// because `src/` cannot import from `meta/` -- exactly the same arrangement
// SEA_WORKER_ASSET_KEY and decompressPool.ts already have.
export const LZMA_NATIVE_ASSET_KEY = 'lzma_native.node'

// 23.1-01-SUMMARY's spike OBSERVED this filename by listing
// node_modules/lzma-native/prebuilds/ after a real install -- it is NOT the
// `lzma_native.node` value PATTERNS.md originally assumed. The asset KEY
// above and this on-disk FILENAME are deliberately independent values and
// do not need to match; every triple also ships an `electron.napi.node`
// sibling this project never touches (the sidecar is plain Node, not
// Electron).
const LZMA_NATIVE_ADDON_FILENAME = 'node.napi.node'

const LZMA_NATIVE_PREBUILDS_ROOT = join(
  'node_modules',
  'lzma-native',
  'prebuilds'
)

/**
 * The shipping sidecar triples for which a MISSING lzma-native prebuild is
 * a hard build failure rather than a silent throughput degrade. Populated
 * from the intersection of the four shipping sidecar triples and 23.1-01's
 * reconciled prebuild inventory (Task 1 of this plan) -- every one of the
 * four has a reconciled prebuild, so none are excluded. If a future
 * shipping triple's prebuild ever went missing from that inventory, it
 * would be named here as excluded rather than added to this list.
 */
export const NATIVE_LZMA_REQUIRED_TRIPLES: readonly string[] = [
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
  'x86_64-unknown-linux-gnu',
  'x86_64-pc-windows-msvc'
]

const SIDECAR_BIN_DIR = join('src-tauri', 'binaries')

/**
 * CR-02/GAP-2 fix: previously this file hardcoded
 * `join('node_modules', '.bin', 'postject'|'esbuild')` and spawned those
 * paths directly. On Windows, pnpm materialises `.bin` entries as a POSIX
 * shell shim plus `.CMD`/`.ps1` siblings -- there is no extensionless
 * native executable there at all. `spawn()` given an explicit,
 * extensionless relative path performs no PATHEXT resolution (that lookup
 * is a `cmd.exe`/shell behavior), so Windows `CreateProcess` fails before
 * either tool ever runs, killing the whole `windows-latest` matrix leg
 * before it reaches `tauri-action`.
 *
 * Passing a `shell` option to `spawn()` is NOT an acceptable fix here
 * (T-24-06 argv-form-only rule -- see `spawnArgv` below). Instead both CLI
 * tools are resolved as ordinary Node modules via `require.resolve`, and
 * run through `process.execPath` -- the already-running Node interpreter,
 * which is never looked up via `PATH`/PATHEXT and is therefore spawnable
 * identically on every OS. This is also shell-free and platform-neutral.
 *
 * `resolveEsbuildCli()` itself now lives in `esbuildWorkerBundleShared.ts`
 * (imported/re-exported above) -- `resolvePostjectCli()` below stays here,
 * it is SEA-packaging-only and has no dev-mode-worker-bundle consumer.
 */
export function resolvePostjectCli(): string {
  try {
    return require.resolve('postject/dist/cli.js')
  } catch (error) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/CR-02): cannot resolve postject/dist/cli.js -- ` +
        `is the dependency installed? (${(error as Error).message})`
    )
  }
}

// WR-05 (gap cycle 2 review): an exported `isWindowsSpawnable(command)`
// predicate used to live here. It was never called by any production code
// path -- `spawnArgv()`, `buildEsbuildArgv()`, `buildPostjectArgv()` and
// `copyNodeBinary()` all ignored it -- and its own docstring conceded it was
// documentary. Its headline test asserted a regex against three hardcoded
// string literals that appear nowhere in this file, so it could not regress
// when this script regressed: exported API surface plus the APPEARANCE of
// coverage where there was none. Deleted. The real GAP-2 guards are the
// source-scan tests in `meta/__tests__/buildSidecarSea.test.ts` ("no
// node_modules/.bin path construction", "no bare 'node' spawn") plus the
// assertions that every resolved command exists on disk, all of which
// inspect the argv this file actually executes.

// Cross-arch Node base-binary download cache, under the already-gitignored
// `/build` directory (CR-01 fix, Task 2) -- no new .gitignore entries.
const NODE_DIST_CACHE_DIR = join('build', 'node-dist')

/** Path to the generated `sea-config.json` (Pattern 3). */
export function buildSeaConfigPath(): string {
  return SEA_CONFIG_PATH
}

/**
 * Matches `meta/buildSteamBridgeShims.ts`'s `helperOutputPath`/
 * `shimOutputPath` naming convention. `.exe` suffix applies ONLY to
 * Windows triples (`sidecarOutputPath('x86_64-pc-windows-msvc')`), never
 * macOS/Linux -- 34-05's `externalBin` entry expects the bare
 * `binaries/gamelib-sidecar` sidecar-name convention per triple.
 */
export function sidecarOutputPath(triple: string): string {
  const ext = triple.includes('windows') ? '.exe' : ''
  return join(SIDECAR_BIN_DIR, `gamelib-sidecar-${triple}${ext}`)
}

/**
 * Argv-form (never a shell string, T-24-06) `postject` invocation shape
 * (Pattern 3). The `--macho-segment-name NODE_SEA` flag is darwin-only --
 * asserted by `meta/__tests__/buildSidecarSea.test.ts`. Exported so tests
 * can assert the exact command construction, incl. the fixed sentinel
 * fuse string, without invoking the real `postject` binary.
 */
export function buildPostjectArgv(
  binaryPath: string,
  blobPath: string,
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  const args = [
    resolvePostjectCli(),
    binaryPath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    SENTINEL_FUSE
  ]
  if (platform === 'darwin') {
    args.push('--macho-segment-name', 'NODE_SEA')
  }
  return { command: process.execPath, args }
}

/**
 * Argv-form (never a shell string, T-24-06) esbuild SEA-bundle invocation
 * shape, mirroring `buildPostjectArgv`'s CR-02 fix -- with one necessary
 * divergence discovered empirically while implementing this task: unlike
 * postject's `dist/cli.js` (always plain JS), esbuild's OWN installer
 * (`node_modules/esbuild/install.js`, `maybeOptimizePackage()`) hardlinks
 * `bin/esbuild` to the raw native platform binary on every OS EXCEPT
 * win32 (and never under yarn) -- a documented esbuild optimization to
 * skip the JS-wrapper hop. On macOS/Linux the resolved path is therefore
 * already a directly-spawnable native executable, not a script
 * `process.execPath` can parse as JS (confirmed empirically: running it
 * through `process.execPath` throws `SyntaxError: Invalid or unexpected
 * token` on the Mach-O header). Only on win32 does `bin/esbuild` remain
 * esbuild's `#!/usr/bin/env node` JS wrapper, which must run through
 * `process.execPath` like postject's CLI. Flags are exactly the eight
 * arguments `bundleForSea()` passed directly to `spawnArgv` before this
 * refactor -- in particular `--packages=external` is deliberately ABSENT
 * (Rule-1 fix 1, file header); re-adding it crashes the SEA sidecar at
 * startup with `ERR_UNKNOWN_BUILTIN_MODULE`.
 *
 * WR-06 fix (gap cycle 2 review): `platform` is an injectable parameter,
 * matching `buildPostjectArgv`/`buildCodesignArgv`. It previously read
 * `process.platform` internally, which forced its test into an
 * `if (process.platform === 'win32')` shape -- so the win32 branch was never
 * evaluated on macOS/Linux dev machines nor on three of the four CI legs.
 * GAP-2 exists precisely BECAUSE Windows behavior had never been validated;
 * an unreachable-off-Windows branch reproduces that blind spot. Both
 * branches are now asserted unconditionally by the test suite.
 */
/**
 * Debug/humankind-depot-full-stall (2026-08-17): factored out of
 * `buildEsbuildArgv()` so `buildWorkerEsbuildArgv()` below can produce the
 * IDENTICAL nine flags for the decompress-worker SEA bundle (parameterised
 * only by outfile/entry) instead of re-listing them and risking the two
 * bundles silently drifting apart. `buildEsbuildArgv()`'s own signature and
 * output stay verbatim unchanged -- its existing tests need no edits.
 *
 * Debug/dev-mode-decompress-worker-electron-hook: `seaEsbuildFlags()` itself
 * now lives in `esbuildWorkerBundleShared.ts` (imported/re-exported above),
 * so `meta/buildDecompressWorkerDev.ts` (the dev-mode worker bundle) can
 * reuse these EXACT flags without importing this file directly (which would
 * trigger the full SEA build as a module-scope side effect -- see this
 * module's own bottom guard).
 */
export function buildEsbuildArgv(
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  const esbuildCli = resolveEsbuildCli()
  const flags = seaEsbuildFlags(SEA_BUNDLE_PATH, SIDECAR_ENTRY_PATH)
  if (platform === 'win32') {
    return { command: process.execPath, args: [esbuildCli, ...flags] }
  }
  return { command: esbuildCli, args: flags }
}

/**
 * Debug/humankind-depot-full-stall (2026-08-17): SEA-bundle argv for
 * decompressPool.ts's worker script, mirroring `buildEsbuildArgv()` exactly
 * (same nine flags via `seaEsbuildFlags()`, same win32-vs-other command
 * split) except for the outfile/entry pair. The worker bundle MUST carry
 * the identical `--alias:electron`/`--alias:i18next-fs-backend`/
 * `--inject:./meta/sidecarSeaFsShim.ts` flags: `decompressWorker.ts` imports
 * `./decompress`, which reaches `backend/logger`, which reaches the
 * electron stub -- omitting the alias here would reproduce Rule-1 fix 2
 * (file header) inside the worker isolate. `--packages=external` stays
 * ABSENT for the same reason it is absent from `buildEsbuildArgv()`.
 */
export function buildWorkerEsbuildArgv(
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  const esbuildCli = resolveEsbuildCli()
  const flags = seaEsbuildFlags(
    SEA_WORKER_BUNDLE_PATH,
    DECOMPRESS_WORKER_ENTRY_PATH
  )
  if (platform === 'win32') {
    return { command: process.execPath, args: [esbuildCli, ...flags] }
  }
  return { command: esbuildCli, args: flags }
}

/**
 * Codesign steps (Pattern 3 strip-then-resign) -- darwin only. Step 0 is
 * the pre-injection `--remove-signature` strip, step 1 is the
 * post-injection `--sign -` ad-hoc re-sign (so Gatekeeper doesn't reject
 * the binary outright). Windows/Linux never codesign -- returns `[]`.
 */
export function buildCodesignArgv(
  binaryPath: string,
  platform: NodeJS.Platform = process.platform
): Array<{ command: string; args: string[] }> {
  if (platform !== 'darwin') {
    return []
  }
  return [
    { command: 'codesign', args: ['--remove-signature', binaryPath] },
    { command: 'codesign', args: ['--sign', '-', binaryPath] }
  ]
}

// Argv-form spawn (T-24-06) -- never a shell string. Resolves with the exit
// code + captured output rather than throwing, so callers decide what a
// non-zero exit means (compile-gate failure vs. a plain build error).
// Debug/dev-mode-decompress-worker-electron-hook: `spawnArgv()` itself now
// lives in `esbuildWorkerBundleShared.ts` (imported/re-exported above), for
// the same reason as `seaEsbuildFlags()`.

/** Matches the plan's verify-command host-triple resolution exactly. */
export function hostTriple(): string {
  if (process.platform === 'win32') {
    return 'x86_64-pc-windows-msvc'
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'aarch64-apple-darwin'
      : 'x86_64-apple-darwin'
  }
  return 'x86_64-unknown-linux-gnu'
}

/**
 * CR-01 fix: the sidecar's output triple must be driven by the build
 * TARGET, not by `process.arch`/`process.platform` of the machine running
 * this script. Before this fix, both `macos-latest` matrix legs (which are
 * Apple-Silicon-native runners) called `hostTriple()` directly and always
 * produced `aarch64-apple-darwin`, so the `--target x86_64-apple-darwin`
 * leg either failed to resolve its Tauri `externalBin` or shipped arm64
 * bytes mislabeled as x86_64.
 *
 * `GAMELIB_SIDECAR_TARGET_TRIPLE` is set per matrix leg by
 * `.github/workflows/release-tauri.yml` (34-11); when it is unset (local
 * `tauri dev` / a bare `pnpm build:sidecar-sea`) this falls back to
 * `hostTriple()`, so the native/dev path is unaffected. GitHub Actions
 * renders an unset matrix field as the empty string, so `''` is also
 * treated as unset.
 */
export function resolveTriple(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.GAMELIB_SIDECAR_TARGET_TRIPLE
  if (typeof override === 'string' && override.length > 0) {
    return override
  }
  return hostTriple()
}

/**
 * Maps a target triple to the platform value `buildPostjectArgv`/
 * `buildCodesignArgv` expect. Exists because `injectBlob()` previously
 * derived this from the HOST platform (`process.platform`) rather than the
 * TARGET triple -- the same host-vs-target bug family as CR-01.
 */
export function triplePlatform(triple: string): NodeJS.Platform {
  if (triple.endsWith('-apple-darwin')) {
    return 'darwin'
  }
  if (triple.includes('-windows-')) {
    return 'win32'
  }
  if (triple.includes('-linux-')) {
    return 'linux'
  }
  throw new Error(`unsupported sidecar target triple: ${triple}`)
}

/**
 * Expected `lipo -archs` output for a darwin target triple -- the arch
 * gate (`verifyBinaryArch()`) is darwin-only by design, so this throws for
 * any non-darwin triple.
 */
export function expectedMachoArch(triple: string): string {
  if (triple === 'aarch64-apple-darwin') {
    return 'arm64'
  }
  if (triple === 'x86_64-apple-darwin') {
    return 'x86_64'
  }
  throw new Error(`unsupported sidecar target triple: ${triple}`)
}

/** Maps a Rust target triple to Node's dist platform-arch segment. */
export function nodeDistName(triple: string): string {
  switch (triple) {
    case 'aarch64-apple-darwin':
      return 'darwin-arm64'
    case 'x86_64-apple-darwin':
      return 'darwin-x64'
    case 'x86_64-unknown-linux-gnu':
      return 'linux-x64'
    case 'aarch64-unknown-linux-gnu':
      return 'linux-arm64'
    case 'x86_64-pc-windows-msvc':
      return 'win-x64'
    default:
      throw new Error(`unsupported sidecar target triple: ${triple}`)
  }
}

/**
 * Maps a target triple to node-gyp-build's own `<platform>-<arch>` prebuild
 * directory naming -- deliberately a SEPARATE switch from `nodeDistName()`
 * above, not a delegation to it. `nodeDistName()` returns Node's own dist
 * naming (`win-x64`), while `node-gyp-build` computes
 * `${process.platform}-${process.arch}`, which on Windows is `win32-x64`.
 * Reusing `nodeDistName()` here would silently produce a path that never
 * exists and degrade every Windows release leg to pure-JS decode with no
 * build-time signal -- exactly the trap this function exists to avoid (see
 * the regression test asserting the two functions disagree on Windows).
 * Pure; never reads `process.platform`/`process.arch` (CR-01 host-vs-target
 * discipline -- driven only by the TARGET triple parameter).
 */
export function lzmaNativePrebuildDir(triple: string): string {
  switch (triple) {
    case 'aarch64-apple-darwin':
      return 'darwin-arm64'
    case 'x86_64-apple-darwin':
      return 'darwin-x64'
    case 'x86_64-unknown-linux-gnu':
      return 'linux-x64'
    case 'aarch64-unknown-linux-gnu':
      return 'linux-arm64'
    case 'x86_64-pc-windows-msvc':
      return 'win32-x64'
    default:
      throw new Error(`unsupported sidecar target triple: ${triple}`)
  }
}

/**
 * The on-disk path to lzma-native's prebuilt native addon for a target
 * triple. Pure -- no filesystem access, no `process.platform`/
 * `process.arch` read anywhere (CR-01 discipline). Existence is checked
 * separately by `resolveNativeLzmaAsset()` below, keeping this function
 * usable in a plain unit test with no real `node_modules` tree required.
 */
export function lzmaNativePrebuildPath(triple: string): string {
  return join(
    LZMA_NATIVE_PREBUILDS_ROOT,
    lzmaNativePrebuildDir(triple),
    LZMA_NATIVE_ADDON_FILENAME
  )
}

/**
 * The only impure piece of the native-LZMA asset resolution. Computes the
 * expected prebuild path for `triple` and checks it on disk:
 *   - present -> returns the path, to be embedded as a second SEA asset;
 *   - absent AND `triple` is in `NATIVE_LZMA_REQUIRED_TRIPLES` -> throws a
 *     COMPILE GATE failure, mirroring `bundleWorkerForSea()`'s throw-loud
 *     discipline verbatim. This project has just spent an entire debug arc
 *     (see file header, fix note 6) discovering that a decode path was
 *     silently degraded in every shipped build -- a required triple losing
 *     its prebuild must break the build, not the throughput;
 *   - absent AND `triple` is NOT required -> returns `undefined` after a
 *     single loud `console.warn`, so an unsupported triple's release leg
 *     degrades to the existing pure-JS `lzma` decode path instead of
 *     bricking entirely. Loud, not silent -- what the COMPILE GATE
 *     discipline actually requires.
 */
async function resolveNativeLzmaAsset(
  triple: string
): Promise<string | undefined> {
  const prebuildPath = lzmaNativePrebuildPath(triple)
  if (existsSync(prebuildPath)) {
    return prebuildPath
  }
  if (NATIVE_LZMA_REQUIRED_TRIPLES.includes(triple)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): missing required lzma-native prebuild ` +
        `for target triple ${triple} at ${prebuildPath} -- this triple is ` +
        `declared native-capable (NATIVE_LZMA_REQUIRED_TRIPLES) and must ` +
        'not silently ship a pure-JS-only decode path'
    )
  }
  console.warn(
    `[build:sidecar-sea] NATIVE LZMA UNAVAILABLE for ${triple} -- no ` +
      `prebuild found at ${prebuildPath}; this release leg will ship with ` +
      'pure-JS lzma decode only.'
  )
  return undefined
}

/**
 * Resolves the official nodejs.org dist archive/checksum/inner-binary
 * locations for a target triple. `version` defaults to `process.version`
 * (already `v`-prefixed) -- the base binary MUST match the Node version
 * generating the SEA blob, so callers should not override this in
 * production code (only tests pin an explicit version).
 *
 * `innerBinaryPath` is an archive-internal member path handed to `tar`,
 * not a host filesystem path -- built with forward slashes verbatim, never
 * `path.join`.
 */
export function nodeDistUrls(
  triple: string,
  version: string = process.version
): {
  archiveName: string
  archiveUrl: string
  shasumsUrl: string
  innerBinaryPath: string
} {
  if (!version.startsWith('v')) {
    throw new Error(
      `nodeDistUrls: version must be v-prefixed, got "${version}"`
    )
  }
  const dist = nodeDistName(triple)
  const isWindows = dist.startsWith('win-')
  const archiveName = `node-${version}-${dist}.${isWindows ? 'zip' : 'tar.gz'}`
  const archiveUrl = `https://nodejs.org/dist/${version}/${archiveName}`
  const shasumsUrl = `https://nodejs.org/dist/${version}/SHASUMS256.txt`
  const innerBinaryPath = isWindows
    ? `node-${version}-${dist}/node.exe`
    : `node-${version}-${dist}/bin/node`
  return { archiveName, archiveUrl, shasumsUrl, innerBinaryPath }
}

/**
 * Debug/humankind-depot-full-stall (2026-08-17): pure sea-config shape,
 * extracted so a test can assert the `decompressWorker.js` asset wiring
 * without running a real build. `assets` maps the SEA asset key
 * (`SEA_WORKER_ASSET_KEY`) to the worker bundle's build output path --
 * `node --experimental-sea-config` embeds the file at that path into the
 * blob under that key, and decompressPool.ts's `resolveWorkerSpec()` reads
 * it back at runtime via `sea.getAsset(SEA_WORKER_ASSET_KEY, 'utf8')`.
 *
 * 23.1-02: `nativeLzmaPath` is optional -- when provided (a resolved,
 * on-disk lzma-native prebuild path), a second `LZMA_NATIVE_ASSET_KEY`
 * entry is added to `assets`; when omitted, `assets` carries only the
 * worker entry (the degraded, native-unavailable shape). Stays pure --
 * no `existsSync()` here; the existence decision belongs to
 * `resolveNativeLzmaAsset()`, so this config shape stays unit-testable
 * without a filesystem, matching this file's established pure-argv-builder
 * discipline.
 */
export function buildSeaConfig(nativeLzmaPath?: string): {
  main: string
  output: string
  disableExperimentalSEAWarning: boolean
  assets: Record<string, string>
} {
  const assets: Record<string, string> = {
    [SEA_WORKER_ASSET_KEY]: SEA_WORKER_BUNDLE_PATH
  }
  if (typeof nativeLzmaPath === 'string' && nativeLzmaPath.length > 0) {
    assets[LZMA_NATIVE_ASSET_KEY] = nativeLzmaPath
  }
  return {
    main: SEA_BUNDLE_PATH,
    output: SEA_BLOB_PATH,
    disableExperimentalSEAWarning: true,
    assets
  }
}

async function writeSeaConfig(nativeLzmaPath?: string): Promise<void> {
  if (!existsSync(SEA_BUNDLE_PATH)) {
    throw new Error(
      `Missing ${SEA_BUNDLE_PATH} -- bundleForSea() must run before writeSeaConfig()`
    )
  }
  if (!existsSync(SEA_WORKER_BUNDLE_PATH)) {
    throw new Error(
      `Missing ${SEA_WORKER_BUNDLE_PATH} -- bundleWorkerForSea() must run before writeSeaConfig()`
    )
  }
  await mkdir(join('build'), { recursive: true })
  await writeFile(
    SEA_CONFIG_PATH,
    JSON.stringify(buildSeaConfig(nativeLzmaPath), null, 2)
  )
}

/**
 * Rule-1 fixes 1-3 (see file header): produces a FULLY self-contained
 * bundle (every node_modules dependency inlined, `--packages=external`
 * deliberately OMITTED) for the SEA compile step specifically -- SEA's
 * runtime can only `require()` built-in Node modules by default
 * (Pitfall 3), so any unresolved `require('somePackage')` left in the SEA
 * main script crashes at startup with `ERR_UNKNOWN_BUILTIN_MODULE`.
 * `electron` is aliased (not left external) to this project's own
 * `backend/platform/index.ts` so `electron-store` can be safely bundled too (fix 2);
 * `sidecarSeaFsShim.ts` is injected to patch the one dynamic asset read
 * fix 2 doesn't cover (fix 3). Deliberately independent of
 * `pnpm build:sidecar`'s dev/Electron bundle (`build/main/sidecar.js`,
 * left untouched -- "extend, do NOT replace").
 */
async function bundleForSea(): Promise<void> {
  if (!existsSync(SIDECAR_ENTRY_PATH)) {
    throw new Error(`Missing sidecar entry point at ${SIDECAR_ENTRY_PATH}`)
  }
  await mkdir(join('build', 'main'), { recursive: true })
  const esbuildArgv = buildEsbuildArgv()
  const result = await spawnArgv(esbuildArgv.command, esbuildArgv.args)
  if (result.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): esbuild SEA bundle exited ${result.code}:\n${result.stderr}`
    )
  }
  if (!existsSync(SEA_BUNDLE_PATH)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): esbuild exited 0 but no bundle was emitted at ${SEA_BUNDLE_PATH}`
    )
  }
}

/**
 * Debug/humankind-depot-full-stall (2026-08-17): mirrors `bundleForSea()`'s
 * COMPILE GATE discipline exactly (entry-point guard, non-zero exit throws,
 * "exit 0 but no file emitted" throws) for the SECOND, worker-only esbuild
 * bundle. Produces `SEA_WORKER_BUNDLE_PATH`, later embedded into the SEA
 * blob as the `decompressWorker.js` asset by `writeSeaConfig()`/
 * `buildSeaConfig()`.
 */
async function bundleWorkerForSea(): Promise<void> {
  if (!existsSync(DECOMPRESS_WORKER_ENTRY_PATH)) {
    throw new Error(
      `Missing decompress worker entry point at ${DECOMPRESS_WORKER_ENTRY_PATH}`
    )
  }
  await mkdir(join('build', 'main'), { recursive: true })
  // Phase 23.1 plan 05: MUST run before the esbuild invocation below --
  // esbuild resolves lzmaNativeBinding.ts's relative
  // `require('./lzmaNativeResolvedPaths.generated.cjs')` by reading the
  // file's real on-disk content at BUILD TIME, so the generated file must
  // already exist. assertNodeGypBuildSingleConsumer() is the T-23.1-03-02
  // security check, relocated to build time -- see
  // esbuildWorkerBundleShared.ts's own header comment for why the runtime
  // `dir`-based version this replaces could never actually work once
  // genuinely bundled.
  assertNodeGypBuildSingleConsumer()
  const lzmaNativePkgRoot = writeLzmaNativeResolvedPaths()
  console.log(
    `[build:sidecar-sea] lzma-native resolved paths baked for the worker bundle (root=${lzmaNativePkgRoot})`
  )
  const esbuildArgv = buildWorkerEsbuildArgv()
  const result = await spawnArgv(esbuildArgv.command, esbuildArgv.args)
  if (result.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): esbuild decompress-worker SEA bundle exited ${result.code}:\n${result.stderr}`
    )
  }
  if (!existsSync(SEA_WORKER_BUNDLE_PATH)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): esbuild exited 0 but no worker bundle was emitted at ${SEA_WORKER_BUNDLE_PATH}`
    )
  }
}

/**
 * Argv-form (never a shell string, T-24-06) `--experimental-sea-config`
 * invocation shape, exported so tests can assert the exact command without
 * running a real SEA build.
 *
 * CR-03 fix (gap cycle 2 review): this spawned a bare `'node'` resolved from
 * `PATH`, which broke a correctness invariant this file documents twice --
 * "the base binary MUST match the Node version generating the SEA blob"
 * (`nodeDistUrls`) and "the SEA blob is generated by THIS running `node`, so
 * the base binary injected with it must be the exact same Node version"
 * (`obtainCrossNodeBinary`). Neither statement held: `copyNodeBinary()`
 * sources the base binary from `process.execPath` (native) or from
 * `nodeDistUrls(triple)` defaulted to `process.version` (cross), while the
 * blob came from whatever `node` happened to be first on `PATH` (an nvm/fnm
 * shim, Corepack, a volta pin, a stale `.nvmrc`). A mismatch produces a blob
 * from Node X injected into a Node Y base binary -- a runtime crash or subtly
 * wrong behavior in the SHIPPED sidecar, not a build error: `verifyBinaryArch()`
 * gates the Mach-O arch but nothing gates the version, and both the exit-code
 * and `existsSync()` checks pass. Using `process.execPath` makes the
 * documented invariant true by construction (and matches GAP-2's stated
 * rationale for the esbuild/postject spawns).
 */
export function buildSeaBlobArgv(): { command: string; args: string[] } {
  return {
    command: process.execPath,
    args: ['--experimental-sea-config', SEA_CONFIG_PATH]
  }
}

/**
 * COMPILE GATE (mirrors `buildSteamBridgeShims.ts`'s `compileShim()`
 * discipline): a non-zero `node --experimental-sea-config` exit OR a
 * missing blob output both FAIL the build loudly, never silently.
 */
async function generateSeaBlob(): Promise<void> {
  const seaBlobArgv = buildSeaBlobArgv()
  const result = await spawnArgv(seaBlobArgv.command, seaBlobArgv.args)
  if (result.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): node --experimental-sea-config exited ${result.code}:\n${result.stderr}`
    )
  }
  if (!existsSync(SEA_BLOB_PATH)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): node --experimental-sea-config exited 0 but no blob was emitted at ${SEA_BLOB_PATH}`
    )
  }
}

/**
 * CR-01 fix: obtains a genuine base Node binary for a cross-arch TARGET
 * triple (i.e. `triple !== hostTriple()`) by downloading and
 * SHA-256-verifying the official nodejs.org release for that triple --
 * never by copying/relabeling `process.execPath` (explicitly rejected,
 * GAP-D-02). `nodeDistUrls()` defaults its `version` argument to
 * `process.version`, which is REQUIRED for correctness here: the SEA blob
 * (`generateSeaBlob()`) is generated by THIS running `node`, so the base
 * binary injected with it must be the exact same Node version.
 */
async function obtainCrossNodeBinary(triple: string): Promise<string> {
  if (triplePlatform(triple) === 'win32') {
    throw new Error(
      'COMPILE GATE FAILED (D-06/CR-01): cross-building the sidecar for a ' +
        'Windows triple is not implemented -- the release matrix builds ' +
        'Windows natively on windows-latest. This is a deliberate, ' +
        'documented limit, not a silent fallback.'
    )
  }

  const { archiveName, archiveUrl, shasumsUrl, innerBinaryPath } =
    nodeDistUrls(triple)

  await mkdir(NODE_DIST_CACHE_DIR, { recursive: true })
  const archivePath = join(NODE_DIST_CACHE_DIR, archiveName)

  if (!existsSync(archivePath)) {
    const response = await fetch(archiveUrl)
    if (!response.ok) {
      throw new Error(
        `COMPILE GATE FAILED (D-06/T-34-15): failed to download ${archiveUrl} ` +
          `(HTTP ${response.status})`
      )
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(archivePath, buffer)
  }

  // Re-verify against SHASUMS256.txt every time, even on a cache hit.
  const shasumsResponse = await fetch(shasumsUrl)
  if (!shasumsResponse.ok) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/T-34-15): failed to download ${shasumsUrl} ` +
        `(HTTP ${shasumsResponse.status})`
    )
  }
  const shasumsText = await shasumsResponse.text()
  const shasumsLine = shasumsText
    .split('\n')
    .find((line) => line.trim().split(/\s+/)[1] === archiveName)
  if (!shasumsLine) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/T-34-15): no SHASUMS256.txt entry found for ` +
        `${archiveName} at ${shasumsUrl}`
    )
  }
  const expectedHash = shasumsLine.trim().split(/\s+/)[0].toLowerCase()

  const archiveBytes = await readFile(archivePath)
  const actualHash = createHash('sha256').update(archiveBytes).digest('hex')

  if (actualHash.toLowerCase() !== expectedHash) {
    await unlink(archivePath).catch(() => undefined)
    throw new Error(
      `COMPILE GATE FAILED (D-06/T-34-15): SHA256 mismatch for ${archiveName} ` +
        `(expected ${expectedHash}, got ${actualHash.toLowerCase()})`
    )
  }

  const extract = await spawnArgv('tar', [
    '-xzf',
    archivePath,
    '-C',
    NODE_DIST_CACHE_DIR,
    innerBinaryPath
  ])
  if (extract.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/T-34-15): tar extraction of ${innerBinaryPath} ` +
        `from ${archiveName} exited ${extract.code}:\n${extract.stderr}`
    )
  }
  const extractedPath = join(NODE_DIST_CACHE_DIR, innerBinaryPath)
  if (!existsSync(extractedPath)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/T-34-15): tar exited 0 but ${extractedPath} ` +
        `does not exist`
    )
  }
  return extractedPath
}

/**
 * The native/dev branch (`triple === hostTriple()`) MUST remain
 * byte-for-byte the pre-CR-01 behavior (copy `process.execPath`) so
 * `tauri dev` and local native builds are unaffected. A cross-arch build
 * (`triple !== hostTriple()`) sources a checksum-verified official
 * nodejs.org binary via `obtainCrossNodeBinary()` instead -- never a
 * relabeled host binary (GAP-D-02).
 */
async function copyNodeBinary(triple: string): Promise<string> {
  const outputPath = sidecarOutputPath(triple)
  await mkdir(SIDECAR_BIN_DIR, { recursive: true })
  const source =
    triple === hostTriple()
      ? process.execPath
      : await obtainCrossNodeBinary(triple)
  await copyFile(source, outputPath)
  await chmod(outputPath, 0o755)
  return outputPath
}

/**
 * Strips, injects, and (on macOS) re-signs the copied node binary in
 * place. Postject's own exit code AND the final binary's presence are
 * both checked -- the same "exit 0 but nothing emitted" defense used by
 * `compileShim()`'s COMPILE GATE.
 *
 * CR-01 fix: `platform` now comes from the TARGET triple
 * (`triplePlatform(triple)`), not `process.platform` -- `injectBlob()`
 * previously decided `--macho-segment-name` from the HOST platform, the
 * same host-vs-target bug family as the sidecar output triple itself.
 * Codesign steps stay gated on BOTH the host actually being macOS
 * (`process.platform === 'darwin'`, since `codesign` only exists there)
 * AND the target being darwin.
 */
async function injectBlob(binaryPath: string, triple: string): Promise<void> {
  const targetPlatform = triplePlatform(triple)
  const codesignSteps = buildCodesignArgv(binaryPath, targetPlatform)
  const canCodesign =
    process.platform === 'darwin' && targetPlatform === 'darwin'

  if (canCodesign && codesignSteps[0]) {
    const strip = await spawnArgv(
      codesignSteps[0].command,
      codesignSteps[0].args
    )
    if (strip.code !== 0) {
      throw new Error(
        `COMPILE GATE FAILED (D-06): codesign --remove-signature exited ${strip.code}:\n${strip.stderr}`
      )
    }
  }

  const postjectArgv = buildPostjectArgv(
    binaryPath,
    SEA_BLOB_PATH,
    targetPlatform
  )
  const inject = await spawnArgv(postjectArgv.command, postjectArgv.args)
  if (inject.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): postject exited ${inject.code}:\n${inject.stderr}`
    )
  }
  if (!existsSync(binaryPath)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06): postject exited 0 but no binary exists at ${binaryPath}`
    )
  }

  if (canCodesign && codesignSteps[1]) {
    const resign = await spawnArgv(
      codesignSteps[1].command,
      codesignSteps[1].args
    )
    if (resign.code !== 0) {
      throw new Error(
        `COMPILE GATE FAILED (D-06): codesign --sign - exited ${resign.code}:\n${resign.stderr}`
      )
    }
  }
}

/**
 * T-34-14 (CR-01) arch gate: proves the produced binary's REAL Mach-O
 * architecture matches the requested triple via `lipo -archs`, rather than
 * trusting that the base binary + injection produced the right bytes. Only
 * runs on darwin targets built on a darwin host (`lipo` is a macOS tool);
 * otherwise logs a single line explaining why the gate was skipped --
 * never a silent no-op.
 */
async function verifyBinaryArch(
  binaryPath: string,
  triple: string
): Promise<void> {
  if (triplePlatform(triple) !== 'darwin' || process.platform !== 'darwin') {
    console.log(
      `[build:sidecar-sea] Arch gate skipped for ${triple}: lipo -archs is ` +
        'a macOS-only check (either the target or the host is non-darwin).'
    )
    return
  }

  const lipo = await spawnArgv('lipo', ['-archs', binaryPath])
  if (lipo.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/T-34-14): lipo -archs exited ${lipo.code}:\n${lipo.stderr}`
    )
  }
  const actual = lipo.stdout.trim()
  const expected = expectedMachoArch(triple)
  if (!actual.includes(expected)) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/T-34-14): ${binaryPath} reports arch ` +
        `"${actual}" but triple ${triple} requires "${expected}" -- ` +
        'refusing to ship a relabeled binary'
    )
  }
  console.log(`SEA sidecar arch verified: ${actual} (${triple})`)
}

export async function main(): Promise<void> {
  // Debug/humankind-depot-full-stall (2026-08-17): Pitfall 1 (34-RESEARCH.md)
  // is no longer an accepted tradeoff -- it was the CONFIRMED dominant
  // throughput ceiling behind HUMANKIND taking ~1.5h vs Steam's ~5min (see
  // that debug file for the full evidence trail). decompressPool.ts's
  // worker_threads spawn now resolves the worker from a SEA asset embedded
  // in this blob (`resolveWorkerSpec()`), not a `build/main/`-adjacent
  // companion file that a compiled SEA executable never shipped.
  console.log(
    '[build:sidecar-sea] decompress worker bundled and embedded as SEA ' +
      `asset "${SEA_WORKER_ASSET_KEY}" -- consumed at runtime by ` +
      'DecompressPool via node:sea.getAsset().'
  )

  const triple = resolveTriple()
  const isCrossBuild = triple !== hostTriple()
  console.log(
    `[build:sidecar-sea] Resolved target triple: ${triple}` +
      (isCrossBuild
        ? ` (cross-build, host is ${hostTriple()})`
        : ' (native build)')
  )

  // 23.1-02 (spike 023 VALIDATED): resolve the native lzma-native asset by
  // TARGET triple before any bundling starts, so a required-triple failure
  // fails fast rather than after paying for two esbuild bundles.
  const nativeLzmaPath = await resolveNativeLzmaAsset(triple)
  console.log(
    nativeLzmaPath
      ? `[build:sidecar-sea] native LZMA addon embedded as SEA asset ` +
          `"${LZMA_NATIVE_ASSET_KEY}" from ${nativeLzmaPath}`
      : `[build:sidecar-sea] native LZMA addon NOT embedded for ${triple} ` +
          '-- this leg ships pure-JS lzma decode only.'
  )

  await bundleForSea()
  await bundleWorkerForSea()
  await writeSeaConfig(nativeLzmaPath)
  await generateSeaBlob()
  const outputPath = await copyNodeBinary(triple)
  await injectBlob(outputPath, triple)
  await verifyBinaryArch(outputPath, triple)
  console.log(`SEA sidecar compiled -> ${outputPath}`)
}

// Run via `node meta/runTs.cjs` (package.json `build:sidecar-sea`), which
// DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite. `JEST_WORKER_ID` reliably distinguishes "imported under test" from
// "run as a CLI" (same guard as meta/buildSteamBridgeShims.ts /
// meta/gen_vtables.ts).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
