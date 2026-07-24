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
 */

import { spawn } from 'node:child_process'
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
const POSTJECT_BIN = join('node_modules', '.bin', 'postject')
const ESBUILD_BIN = join('node_modules', '.bin', 'esbuild')

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
    binaryPath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    SENTINEL_FUSE
  ]
  if (platform === 'darwin') {
    args.push('--macho-segment-name', 'NODE_SEA')
  }
  return { command: 'postject', args }
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
    throw new Error(`nodeDistUrls: version must be v-prefixed, got "${version}"`)
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
  const result = await spawnArgv(ESBUILD_BIN, [
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--alias:electron=./src/backend/sidecar/electronStub.ts',
    '--inject:./meta/sidecarSeaFsShim.ts',
    `--outfile=${SEA_BUNDLE_PATH}`,
    SIDECAR_ENTRY_PATH
  ])
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
 * COMPILE GATE (mirrors `buildSteamBridgeShims.ts`'s `compileShim()`
 * discipline): a non-zero `node --experimental-sea-config` exit OR a
 * missing blob output both FAIL the build loudly, never silently.
 */
async function generateSeaBlob(): Promise<void> {
  const result = await spawnArgv('node', [
    '--experimental-sea-config',
    SEA_CONFIG_PATH
  ])
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

async function copyNodeBinary(triple: string): Promise<string> {
  const outputPath = sidecarOutputPath(triple)
  await mkdir(SIDECAR_BIN_DIR, { recursive: true })
  await copyFile(process.execPath, outputPath)
  await chmod(outputPath, 0o755)
  return outputPath
}

/**
 * Strips, injects, and (on macOS) re-signs the copied node binary in
 * place. Postject's own exit code AND the final binary's presence are
 * both checked -- the same "exit 0 but nothing emitted" defense used by
 * `compileShim()`'s COMPILE GATE.
 */
async function injectBlob(binaryPath: string): Promise<void> {
  const platform = process.platform
  const codesignSteps = buildCodesignArgv(binaryPath, platform)

  if (platform === 'darwin' && codesignSteps[0]) {
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

  const postjectArgv = buildPostjectArgv(binaryPath, SEA_BLOB_PATH, platform)
  const inject = await spawnArgv(POSTJECT_BIN, postjectArgv.args)
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

  if (platform === 'darwin' && codesignSteps[1]) {
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

  const triple = hostTriple()
  await bundleForSea()
  await writeSeaConfig()
  await generateSeaBlob()
  const outputPath = await copyNodeBinary(triple)
  await injectBlob(outputPath)
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
