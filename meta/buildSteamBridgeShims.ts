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
 *      toolchain, as a RELEASE build (-O2, UBSan off; SHIM_RELEASE_CFLAGS), (meta/downloadZig.ts) via `zig cc -target x86-windows-gnu`
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
// 51-10 Task 2: bridge_helper.c `#include "bridge_dispatch.h"` -- the
// generated header meta/gen_vtables.ts's generateDispatchHeader() emits
// into THIS directory, a sibling of (not the same directory as)
// bridge_helper.c's own `helper/`. clang's quoted #include first searches
// the including file's own directory, then -I paths in order -- without
// this flag the #include would fail to resolve at all.
const HELPER_INCLUDE_DIR = join('native', 'steam-bridge', 'generated')
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
// 51-15 Task 2: 51-15 Task 1's generated x64 export table (D-51-13 GO).
const SHIM_DEF64_PATH = join(
  'native',
  'steam-bridge',
  'generated',
  'steam_api64.def'
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
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts, which
// lives outside this gate's tsconfig.json scope (include: ["src"]) -- that
// real usage is invisible to ts-prune.
// ts-prune-ignore-next
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
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
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
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export function helperOutputPath(arch: string = resolveBridgeArch()): string {
  return join(bundledBinDir(arch), 'steam-bridge-helper')
}

/**
 * BLOCKER 2 -- the SINGLE shared bundled location. Must match
 * src/backend/constants/paths.ts's `builtBridgeShimPath` exactly; Plan
 * 24-05's `shimGenerate.ts` reads FROM this exact path at runtime.
 */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export function shimOutputPath(arch: string = resolveBridgeArch()): string {
  return join(bundledBinDir(arch), 'steam_api.dll')
}

/**
 * 51-15 Task 2: the Win64 shim's single shared bundled location, beside
 * (not replacing) `shimOutputPath`'s x86 `steam_api.dll` -- the EXISTING
 * `src-tauri/tauri.macos.conf.json` bundle rule already covers the whole
 * `build/bin/arm64/darwin/` directory (D-51-13), so no Tauri config change
 * is needed for this second file to ship.
 */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export function shim64OutputPath(arch: string = resolveBridgeArch()): string {
  return join(bundledBinDir(arch), 'steam_api64.dll')
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
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export const SHIM_BUILD_BYPRODUCTS = [
  'steam_api.pdb',
  'steam_api_shim.lib'
] as const

/** The two `SHIM_BUILD_BYPRODUCTS` names, joined under this arch's bundled darwin dir. */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
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
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
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

/**
 * 51-15 Task 2: the x64 compile's OWN zig-cc linker byproducts. MEASURED
 * directly (scratchpad proof, not guessed): zig cc names the `.pdb` after
 * the `-o` OUTPUT filename (`steam_api64.pdb` for `steam_api64.dll`) but
 * the import `.lib` after the SOURCE filename regardless of `-o`
 * (`steam_api_shim.lib`, identical to the x86 build's own byproduct name)
 * -- never `steam_api64_shim.lib`. This list and the x86
 * `SHIM_BUILD_BYPRODUCTS` therefore literally share one entry; that is
 * expected, not a bug, and is why `compileShim()` (x86) must prune its
 * byproducts BEFORE `compileShim64()` runs -- `main()`'s own sequencing
 * already guarantees this (helper, x86 shim, x64 shim, in that order).
 */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export const SHIM64_BUILD_BYPRODUCTS = [
  'steam_api64.pdb',
  'steam_api_shim.lib'
] as const

/** The two `SHIM64_BUILD_BYPRODUCTS` names, joined under this arch's bundled darwin dir. */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export function shim64ByproductPaths(
  arch: string = resolveBridgeArch()
): string[] {
  return SHIM64_BUILD_BYPRODUCTS.map((name) => join(bundledBinDir(arch), name))
}

/** Same fail-loud post-condition as `pruneShimBuildByproducts` above, for
 * the x64 build's own byproducts -- neither list ever names a keeper
 * `.dll` (T-24-06-shaped guard, carried over from the x86 precedent). */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export function pruneShim64BuildByproducts(
  arch: string = resolveBridgeArch()
): void {
  for (const path of shim64ByproductPaths(arch)) {
    rmSync(path, { force: true })
    if (existsSync(path)) {
      throw new Error(
        `Failed to remove x64 shim build byproduct -- still present at ${path}`
      )
    }
  }
}

/** Staged next to the built helper (finding #4 -- helper cwd resolution). */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
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
      '-I',
      HELPER_INCLUDE_DIR,
      '-o',
      helperOutputPath(arch),
      HELPER_SOURCE_PATH
    ]
  }
}

/**
 * Release flags for BOTH shim compiles (quick 261023-tyf). Without an -O flag
 * zig defaults to Debug with UBSan, and the sanitizer rejects input that is
 * legal for the platform: 32-bit MSVC code passes 4-byte-aligned
 * `LARGE_INTEGER*`, and spike 033 run C aborted Hoard with `panic: member
 * access within misaligned address`. UBSan is turned OFF, not into trap mode:
 * trap mode would still kill the game on the same legal input (ud2 instead of
 * a readable panic). One flag set serves dev and packaged builds, because dev
 * builds place these same DLLs into real bottles. `-fno-sanitize=undefined`
 * is explicit although bare -O2 also drops UBSan under zig 0.16.0, so the
 * intent does not depend on how a future zig maps -O2. Measured sizes:
 * x86 894464 -> 286720, x64 848896 -> 223744.
 */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts and
// meta/__tests__/shimAbiGate.test.ts (outside this gate's tsconfig.json
// scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export const SHIM_RELEASE_CFLAGS = ['-O2', '-fno-sanitize=undefined'] as const

/**
 * Argv-form (never a shell string, T-24-06) command for cross-compiling the
 * PE shim (a release build, see SHIM_RELEASE_CFLAGS) with the pinned zig toolchain. Exported so tests can assert the
 * `-target x86-windows-gnu` flag, the 24-01 generated source as input, and
 * the single shared output location (BLOCKER 2) without invoking real zig.
 */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
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
      ...SHIM_RELEASE_CFLAGS,
      '-o',
      shimOutputPath(arch),
      SHIM_SOURCE_PATH,
      SHIM_DEF_PATH,
      '-lws2_32'
    ]
  }
}

/**
 * 51-15 Task 2 (D-51-13 GO): the SAME generated shim SOURCE
 * (`steam_api_shim.c`, arch-neutral -- 51-15 Task 1's THISCALL macro and
 * explicit hidden-pointer signatures compile correctly under both
 * targets with no forked generator), cross-compiled a SECOND time with
 * `-target x86_64-windows-gnu` against the x64 export table 51-15 Task 1
 * generated (`steam_api64.def`), to the Win64 shim's own bundled location.
 * Also a release build (SHIM_RELEASE_CFLAGS).
 */
// Exported only for meta/__tests__/buildSteamBridgeShims.test.ts (outside
// this gate's tsconfig.json scope -- see resolveBridgeArch above).
// ts-prune-ignore-next
export function buildShim64CompileArgv(
  zigBinPath: string,
  arch: string = resolveBridgeArch()
): { command: string; args: string[] } {
  return {
    command: zigBinPath,
    args: [
      'cc',
      '-target',
      'x86_64-windows-gnu',
      '-shared',
      ...SHIM_RELEASE_CFLAGS,
      '-o',
      shim64OutputPath(arch),
      SHIM_SOURCE_PATH,
      SHIM_DEF64_PATH,
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

/**
 * 51-15 Task 2: the SECOND real zig-cc COMPILE GATE, for the Win64 shim --
 * same fail-loud shape as `compileShim()` above (non-zero exit or a
 * missing `.dll` FAILS the build), proving the x64-targeted
 * `steam_api_shim.c`/`steam_api64.def` pair 51-15 Task 1 generates
 * actually assembles under a real PE32+ toolchain. Runs AFTER
 * `compileShim()` (see `main()`) -- not because of a dependency between
 * the two outputs, but because `SHIM64_BUILD_BYPRODUCTS` and
 * `SHIM_BUILD_BYPRODUCTS` share the `steam_api_shim.lib` name (measured:
 * zig cc names the import lib after the SOURCE file, not `-o`), so x86's
 * own prune must already have run before this one starts.
 */
async function compileShim64(): Promise<void> {
  if (!existsSync(SHIM_SOURCE_PATH) || !existsSync(SHIM_DEF64_PATH)) {
    throw new Error(
      `Missing generated x64 shim source (${SHIM_SOURCE_PATH} / ${SHIM_DEF64_PATH}) -- run \`pnpm gen-vtables\` first (51-15 Task 1)`
    )
  }

  const zigBinPath = await downloadZig()
  mkdirSync(bundledBinDir(), { recursive: true })
  const { command, args } = buildShim64CompileArgv(zigBinPath)
  console.log(`Compile gate (x64): ${command} ${args.join(' ')}`)
  const result = await spawnArgv(command, args)

  if (result.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED (51-15 Task 2, x64): zig cc exited ${result.code} -- the generated x64 shim source does not assemble:\n${result.stderr}`
    )
  }
  if (!existsSync(shim64OutputPath())) {
    throw new Error(
      `COMPILE GATE FAILED (51-15 Task 2, x64): zig cc exited 0 but no .dll was emitted at ${shim64OutputPath()}`
    )
  }
  console.log(`Compile gate PASSED (x64) -> ${shim64OutputPath()}`)
  pruneShim64BuildByproducts()
}

// Self-invoked only (the JEST_WORKER_ID guard below); kept `export` because
// meta/__tests__/buildSteamBridgeShims.test.ts's B5 case slices compileShim's
// body by searching the source text for the literal string
// "export async function main" as its end-of-function delimiter -- dropping
// `export` would silently break that string match, not just this export.
// ts-prune-ignore-next
export async function main(): Promise<void> {
  await compileHelper()
  await stageSteamAppId()
  await compileShim()
  await compileShim64()
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
