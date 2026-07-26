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
 *    `backend/sidecar/electronStub.ts` at BUILD time -- the runtime
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
 */

import { spawn } from 'node:child_process'
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
 */
export function resolveEsbuildCli(): string {
  try {
    return require.resolve('esbuild/bin/esbuild')
  } catch (error) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/CR-02): cannot resolve esbuild/bin/esbuild -- ` +
        `is the dependency installed? (${(error as Error).message})`
    )
  }
}

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
  platform: NodeJS.Platform | string = process.platform
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
export function buildEsbuildArgv(
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  const esbuildCli = resolveEsbuildCli()
  const flags = [
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--alias:electron=./src/backend/sidecar/electronStub.ts',
    // 34.3-09 D-13 live-gate fix: esbuild resolves an `import` specifier's
    // package.json `exports` map via the `import` condition regardless of
    // the bundle's own `--format=cjs` output -- a dual-package hazard, not
    // an esbuild bug. `i18next-fs-backend`'s `.` export's `import`/`default`
    // condition points at `./esm/index.js`, whose `writeFile.js`/
    // `readFile.js` use a top-level `await import(...)` Deno-detection
    // guard -- unsupported in a cjs bundle, so `bootstrap.ts`'s
    // `import Backend from 'i18next-fs-backend'` (added by 34.2-01's sidecar
    // i18next init, D-02) broke this SEA bundle the moment it was reached.
    // The package's OWN `./cjs` subpath export is plain CJS
    // (`require('node:fs')`, no top-level await) -- alias forces esbuild to
    // resolve there instead, matching the electron alias above.
    '--alias:i18next-fs-backend=i18next-fs-backend/cjs',
    '--inject:./meta/sidecarSeaFsShim.ts',
    `--outfile=${SEA_BUNDLE_PATH}`,
    SIDECAR_ENTRY_PATH
  ]
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
  platform: NodeJS.Platform | string = process.platform
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
function spawnArgv(
  command: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

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

async function writeSeaConfig(): Promise<void> {
  if (!existsSync(SEA_BUNDLE_PATH)) {
    throw new Error(
      `Missing ${SEA_BUNDLE_PATH} -- bundleForSea() must run before writeSeaConfig()`
    )
  }
  await mkdir(join('build'), { recursive: true })
  const config = {
    main: SEA_BUNDLE_PATH,
    output: SEA_BLOB_PATH,
    disableExperimentalSEAWarning: true
  }
  await writeFile(SEA_CONFIG_PATH, JSON.stringify(config, null, 2))
}

/**
 * Rule-1 fixes 1-3 (see file header): produces a FULLY self-contained
 * bundle (every node_modules dependency inlined, `--packages=external`
 * deliberately OMITTED) for the SEA compile step specifically -- SEA's
 * runtime can only `require()` built-in Node modules by default
 * (Pitfall 3), so any unresolved `require('somePackage')` left in the SEA
 * main script crashes at startup with `ERR_UNKNOWN_BUILTIN_MODULE`.
 * `electron` is aliased (not left external) to this project's own
 * `electronStub.ts` so `electron-store` can be safely bundled too (fix 2);
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
  // Pitfall 1 (34-RESEARCH.md): decompressPool.ts's worker_threads spawn
  // resolves `decompressWorker.js` next to the sidecar bundle at
  // `build/main/` today only because electron-vite happens to also emit it
  // there -- a compiled SEA executable does not ship that folder. This is
  // NOT a correctness blocker: `spawnWorker()`'s existing try/catch falls
  // back to inline single-thread decompression. Flagged loudly, once, at
  // build time as an accepted, deliberate throughput regression.
  console.warn(
    '[build:sidecar-sea] Note (Pitfall 1): decompressPool worker_threads ' +
      'spawn falls back to inline single-thread decode inside the compiled ' +
      'SEA sidecar (no build/main/decompressWorker.js companion file is ' +
      'shipped). Accepted throughput regression -- see 34-RESEARCH.md.'
  )

  const triple = resolveTriple()
  const isCrossBuild = triple !== hostTriple()
  console.log(
    `[build:sidecar-sea] Resolved target triple: ${triple}` +
      (isCrossBuild
        ? ` (cross-build, host is ${hostTriple()})`
        : ' (native build)')
  )

  await bundleForSea()
  await writeSeaConfig()
  await generateSeaBlob()
  const outputPath = await copyNodeBinary(triple)
  await injectBlob(outputPath, triple)
  await verifyBinaryArch(outputPath, triple)
  console.log(`SEA sidecar compiled -> ${outputPath}`)
}

// esbuild-bundled, run via `... | node` stdin -- Node never sets
// `require.main` for a script read from stdin. `JEST_WORKER_ID` reliably
// distinguishes "imported under test" from "run as a script" (same guard
// as meta/buildSteamBridgeShims.ts / meta/gen_vtables.ts).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
