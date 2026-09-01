/**
 * Phase 24 Plan 07 (R5): packaging-time native build for the macOS Steam
 * bridge. Hooked into `dist:mac` / `release:mac` BEFORE `electron-vite
 * build` (24-RESEARCH.md Pattern 5 -- two native-build steps must run before
 * the app bundles).
 *
 * Two native builds, both from ALREADY-COMMITTED source (D-07 -- built
 * binaries are never committed, only generated/hand-written source is):
 *
 *   1. Compiles native/steam-bridge/helper/bridge_helper.c (Plan 24-02) with
 *      system `clang` -> `public/bin/${targetArch}/darwin/steam-bridge-helper`,
 *      `chmod 755` -- the exact non-win32 `downloadAsset` convention from
 *      meta/downloadHelperBinaries.ts.
 *
 *   2. Cross-compiles native/steam-bridge/generated/steam_api_shim.c + .def
 *      (Plan 24-01's committed generator output) with the pinned zig
 *      toolchain (meta/downloadZig.ts) via `zig cc -target x86-windows-gnu`
 *      -> `public/bin/${targetArch}/darwin/steam_api.dll` -- the SINGLE
 *      SHARED BUNDLED LOCATION (BLOCKER 2), matching
 *      src/backend/constants/paths.ts's `builtBridgeShimPath` byte-for-byte.
 *      This script intentionally does NOT import paths.ts -- that module
 *      imports Electron's `app` at load time and would crash under plain
 *      `node`; the path is independently reconstructed here using the exact
 *      same `join('public', 'bin', <arch>, 'darwin', ...)` segments
 *      publicDir itself resolves to at dev-run time.
 *
 * CR-01 (34-REVIEW.md gap cycle 2): `targetArch` above is the BUILD TARGET's
 * arch (`resolveBridgeArch()`), NOT the build host's `process.arch`. Both
 * `macos-latest` release matrix legs run on Apple-Silicon runners, so a
 * host-driven path emitted `bin/arm64/darwin/...` even on the
 * `--target x86_64-apple-darwin` leg -- while the x86_64 bundle's sidecar
 * resolves `bin/x64/darwin/...` at runtime (`process.arch === 'x64'`) and
 * found nothing, silently killing the whole Phase 24 bridge feature in that
 * bundle. The helper was arm64 Mach-O regardless, because `clang` was
 * invoked with no `-arch` flag. This is the same host-vs-target bug family
 * as `meta/buildSidecarSea.ts`'s `resolveTriple()`/
 * `GAMELIB_SIDECAR_TARGET_TRIPLE`, and is fixed the same way.
 *
 * The shim cross-compile is a REAL COMPILE GATE (review finding #5a): a
 * non-zero `zig cc` exit OR a missing `.dll` output FAILS the build. This is
 * the earliest, cheapest proof that gen_vtables.ts's hand-authored
 * `__thiscall`/`ret N`/sret ABI actually assembles under a real PE32
 * toolchain -- far before Plan 24-10's human hardware gate. The gate itself
 * is unchanged; the two linker byproducts it also emits (`steam_api.pdb`,
 * `steam_api_shim.lib`, todo item 6 / quick-260901-kl2) are unlinked
 * immediately after it passes -- see `pruneShimBuildByproducts()` below.
 *
 * Also stages `steam_appid.txt`=480 next to the built helper (finding #4) --
 * the helper's runtime cwd (set by Plan 24-06 to that directory) resolves
 * the D-04 identity-only AppID from this file.
 *
 * No electron-builder.yml change needed -- `mac.files` already covers
 * `build/bin/${arch}/darwin/*` (24-RESEARCH.md Pattern 5, independently
 * verified by reading electron-builder.yml).
 *
 * Run with `pnpm build-steam-bridge`.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { chmod, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { downloadZig } from './downloadZig'

const HELPER_SOURCE_PATH = join(
  'native',
  'steam-bridge',
  'helper',
  'bridge_helper.c'
)
const SHIM_SOURCE_PATH = join(
  'native',
  'steam-bridge',
  'generated',
  'steam_api_shim.c'
)
const SHIM_DEF_PATH = join(
  'native',
  'steam-bridge',
  'generated',
  'steam_api.def'
)
// D-04: the committed source-of-truth for the identity-only AppID (480,
// Spacewar). Staged (copied, never regenerated) next to the built helper by
// stageSteamAppId() below.
const STEAM_APPID_SOURCE_PATH = join(
  'native',
  'steam-bridge',
  'steam_appid.txt'
)

/**
 * CR-01 fix (mirrors `meta/buildSidecarSea.ts`'s `resolveTriple()`): the
 * bundled-output arch must be driven by the build TARGET, not by
 * `process.arch` of the machine running this script.
 * `GAMELIB_BRIDGE_TARGET_ARCH` is set per matrix leg by
 * `.github/workflows/release-tauri.yml`; when unset (local `pnpm
 * build-steam-bridge` / `dist:mac`) it falls back to `process.arch`, so the
 * native/dev path is byte-for-byte unaffected. GitHub Actions renders an
 * unset matrix field as the empty string, so `''` is also treated as unset.
 *
 * The value is a Node `process.arch` token (`x64`/`arm64`) because that is
 * what the RUNTIME consumer (`publicDir`/`bin/${process.arch}/darwin` in
 * src/backend/constants/paths.ts) uses to resolve these files.
 */
export function resolveBridgeArch(
  env: NodeJS.ProcessEnv = process.env
): string {
  const override = env.GAMELIB_BRIDGE_TARGET_ARCH
  if (typeof override === 'string' && override.length > 0) {
    return override
  }
  return process.arch
}

/**
 * Maps a Node `process.arch` token to the `clang -arch` Mach-O architecture
 * name. Without an explicit `-arch`, clang emits host-native bytes -- so an
 * Apple-Silicon runner produced an arm64 helper even when building the
 * x86_64 bundle (CR-01). Throws for anything outside the two darwin arches
 * this bridge supports rather than silently falling back to host-native.
 */
export function machoArchFlag(arch: string): string {
  if (arch === 'arm64') {
    return 'arm64'
  }
  if (arch === 'x64') {
    return 'x86_64'
  }
  throw new Error(
    `unsupported steam-bridge target arch: ${arch} (expected 'arm64' or 'x64')`
  )
}

/**
 * Build-time equivalent of `publicDir` (src/backend/constants/paths.ts) --
 * `pnpm build-steam-bridge` (run via `node meta/runTs.cjs`, the meta/
 * convention)
 * always runs from the repo root, so `join('public', 'bin', ...)` -- which
 * resolves relative to `process.cwd()`, not this file's compiled location --
 * resolves to the exact same location `publicDir` resolves to at dev-run
 * time.
 */
function bundledBinDir(arch: string = resolveBridgeArch()): string {
  return join('public', 'bin', arch, 'darwin')
}

/** Matches steamBridgeHelperPath (src/backend/constants/paths.ts, Plan 24-06). */
export function helperOutputPath(arch: string = resolveBridgeArch()): string {
  return join(bundledBinDir(arch), 'steam-bridge-helper')
}

/**
 * BLOCKER 2 -- the SINGLE shared bundled location. Must match
 * src/backend/constants/paths.ts's `builtBridgeShimPath` exactly; Plan
 * 24-05's `shimGenerate.ts` reads FROM this exact path at runtime.
 */
export function shimOutputPath(arch: string = resolveBridgeArch()): string {
  return join(bundledBinDir(arch), 'steam_api.dll')
}

/**
 * `zig cc -shared`'s OWN debug-symbol (`.pdb`) and import-library (`.lib`)
 * linker byproducts -- not build output this repo or its runtime ever reads.
 * They added 2,822,208 B to every shipped macOS `.app` (todo item 6,
 * quick-260901-kl2). Removal is a POST-BUILD unlink, not a compile flag:
 * every flag candidate was measured and rejected during planning --
 * `-Wl,-s` suppresses the `.pdb` but rewrites 455,308 of the DLL's 805,888
 * bytes (805,888 -> 511,488 B), and `-Wl,--out-implib=<sink>` redirects only
 * the `.lib` (the `.pdb` still lands) while still perturbing the DLL's
 * CodeView build-id. Do not re-attempt either.
 */
export const SHIM_BUILD_BYPRODUCTS = ['steam_api.pdb', 'steam_api_shim.lib'] as const

/** The two `SHIM_BUILD_BYPRODUCTS` names, joined under this arch's bundled darwin dir. */
export function shimByproductPaths(
  arch: string = resolveBridgeArch()
): string[] {
  return SHIM_BUILD_BYPRODUCTS.map((name) => join(bundledBinDir(arch), name))
}

/**
 * Unlinks the two zig-cc linker byproducts. Exported (not module-private) so
 * unit tests can call it directly against a fixture, without instrumenting a
 * real compile -- that is what makes the P2 same-build proof (prune cannot
 * alter the DLL) possible. `force: true` tolerates absence, so re-running
 * after a partial failure is safe (a no-op the second time). Fails loud if a
 * byproduct survives its own removal -- a real fs error (e.g. EACCES) must
 * still surface, not be swallowed.
 */
export function pruneShimBuildByproducts(
  arch: string = resolveBridgeArch()
): void {
  for (const path of shimByproductPaths(arch)) {
    rmSync(path, { force: true })
    if (existsSync(path)) {
      throw new Error(
        `Failed to remove shim build byproduct -- still present at ${path}`
      )
    }
  }
}

/** Staged next to the built helper (finding #4 -- helper cwd resolution). */
export function steamAppIdOutputPath(
  arch: string = resolveBridgeArch()
): string {
  return join(bundledBinDir(arch), 'steam_appid.txt')
}

/**
 * Argv-form (never a shell string, T-24-06) command for compiling the
 * native host helper. Exported so tests can assert the exact command
 * construction without invoking real clang.
 *
 * CR-01: carries an explicit `-arch` matching the TARGET arch, so the
 * emitted Mach-O really is the architecture its bundled path claims --
 * `-o public/bin/x64/darwin/...` must not contain arm64 bytes.
 */
export function buildHelperCompileArgv(arch: string = resolveBridgeArch()): {
  command: string
  args: string[]
} {
  return {
    command: 'clang',
    args: [
      '-O2',
      '-arch',
      machoArchFlag(arch),
      '-o',
      helperOutputPath(arch),
      HELPER_SOURCE_PATH
    ]
  }
}

/**
 * Argv-form (never a shell string, T-24-06) command for cross-compiling the
 * PE shim with the pinned zig toolchain. Exported so tests can assert the
 * `-target x86-windows-gnu` flag, the 24-01 generated source as input, and
 * the single shared output location (BLOCKER 2) without invoking real zig.
 */
export function buildShimCompileArgv(
  zigBinPath: string,
  arch: string = resolveBridgeArch()
): { command: string; args: string[] } {
  return {
    command: zigBinPath,
    args: [
      'cc',
      '-target',
      'x86-windows-gnu',
      '-shared',
      '-o',
      shimOutputPath(arch),
      SHIM_SOURCE_PATH,
      SHIM_DEF_PATH,
      '-lws2_32'
    ]
  }
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

async function compileHelper(): Promise<void> {
  mkdirSync(bundledBinDir(), { recursive: true })
  const { command, args } = buildHelperCompileArgv()
  console.log(
    `Compiling native ${resolveBridgeArch()} helper: ${command} ${args.join(' ')}`
  )
  const result = await spawnArgv(command, args)
  if (result.code !== 0) {
    throw new Error(
      `clang failed to compile the native helper (exit ${result.code}):\n${result.stderr}`
    )
  }
  // chmod 755 -- the exact non-win32 downloadAsset convention
  // (meta/downloadHelperBinaries.ts).
  await chmod(helperOutputPath(), 0o755)
  console.log(`Helper compiled -> ${helperOutputPath()}`)
}

async function stageSteamAppId(): Promise<void> {
  if (!existsSync(STEAM_APPID_SOURCE_PATH)) {
    throw new Error(
      `Missing committed ${STEAM_APPID_SOURCE_PATH} -- expected the D-04 identity-only AppID (480) source file`
    )
  }
  mkdirSync(bundledBinDir(), { recursive: true })
  await copyFile(STEAM_APPID_SOURCE_PATH, steamAppIdOutputPath())
  console.log(
    `Staged steam_appid.txt -> ${steamAppIdOutputPath()} (finding #4)`
  )
}

/**
 * The real zig-cc COMPILE GATE (finding #5a). A non-zero exit or a missing
 * `.dll` output FAILS the build -- this is intentional, not a soft warning:
 * it is the earliest, cheapest proof that gen_vtables.ts's hand-authored
 * `__thiscall`/`ret N`/sret ABI actually assembles under a real PE32
 * toolchain, far before Plan 24-10's human hardware gate.
 */
async function compileShim(): Promise<void> {
  if (!existsSync(SHIM_SOURCE_PATH) || !existsSync(SHIM_DEF_PATH)) {
    throw new Error(
      `Missing generated shim source (${SHIM_SOURCE_PATH} / ${SHIM_DEF_PATH}) -- run \`pnpm gen-vtables\` first (Plan 24-01)`
    )
  }

  const zigBinPath = await downloadZig()
  mkdirSync(bundledBinDir(), { recursive: true })
  const { command, args } = buildShimCompileArgv(zigBinPath)
  console.log(`Compile gate: ${command} ${args.join(' ')}`)
  const result = await spawnArgv(command, args)

  if (result.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (finding #5a): zig cc exited ${result.code} -- the generated shim source does not assemble:\n${result.stderr}`
    )
  }
  if (!existsSync(shimOutputPath())) {
    throw new Error(
      `COMPILE GATE FAILED (finding #5a): zig cc exited 0 but no .dll was emitted at ${shimOutputPath()}`
    )
  }
  console.log(`Compile gate PASSED -> ${shimOutputPath()}`)
  pruneShimBuildByproducts()
}

export async function main(): Promise<void> {
  await compileHelper()
  await stageSteamAppId()
  await compileShim()
}

// See meta/gen_vtables.ts for why this can't use the usual
// `require.main === module` idiom (run via `node meta/runTs.cjs`, which
// DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite). `JEST_WORKER_ID` reliably distinguishes "imported under test" from
// "run as a CLI" (same guard as meta/gen_vtables.ts / meta/buildCrossoverIndex.ts).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
