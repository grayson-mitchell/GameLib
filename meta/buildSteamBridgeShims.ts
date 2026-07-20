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
 *      system `clang` -> `public/bin/${process.arch}/darwin/steam-bridge-helper`,
 *      `chmod 755` -- the exact non-win32 `downloadAsset` convention from
 *      meta/downloadHelperBinaries.ts.
 *
 *   2. Cross-compiles native/steam-bridge/generated/steam_api_shim.c + .def
 *      (Plan 24-01's committed generator output) with the pinned zig
 *      toolchain (meta/downloadZig.ts) via `zig cc -target x86-windows-gnu`
 *      -> `public/bin/${process.arch}/darwin/steam_api.dll` -- the SINGLE
 *      SHARED BUNDLED LOCATION (BLOCKER 2), matching
 *      src/backend/constants/paths.ts's `builtBridgeShimPath` byte-for-byte.
 *      This script intentionally does NOT import paths.ts -- that module
 *      imports Electron's `app` at load time and would crash under plain
 *      `node`; the path is independently reconstructed here using the exact
 *      same `join('public', 'bin', process.arch, 'darwin', ...)` segments
 *      publicDir itself resolves to at dev-run time.
 *
 * The shim cross-compile is a REAL COMPILE GATE (review finding #5a): a
 * non-zero `zig cc` exit OR a missing `.dll` output FAILS the build. This is
 * the earliest, cheapest proof that gen_vtables.ts's hand-authored
 * `__thiscall`/`ret N`/sret ABI actually assembles under a real PE32
 * toolchain -- far before Plan 24-10's human hardware gate.
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
import { existsSync, mkdirSync } from 'node:fs'
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
 * Build-time equivalent of `publicDir` (src/backend/constants/paths.ts) --
 * this script runs from the repo root via `esbuild --bundle ... | node`
 * (the meta/ convention), so `join('public', 'bin', ...)` resolves to the
 * exact same location `publicDir` resolves to at dev-run time.
 */
function bundledBinDir(arch: string = process.arch): string {
  return join('public', 'bin', arch, 'darwin')
}

/** Matches steamBridgeHelperPath (src/backend/constants/paths.ts, Plan 24-06). */
export function helperOutputPath(arch: string = process.arch): string {
  return join(bundledBinDir(arch), 'steam-bridge-helper')
}

/**
 * BLOCKER 2 -- the SINGLE shared bundled location. Must match
 * src/backend/constants/paths.ts's `builtBridgeShimPath` exactly; Plan
 * 24-05's `shimGenerate.ts` reads FROM this exact path at runtime.
 */
export function shimOutputPath(arch: string = process.arch): string {
  return join(bundledBinDir(arch), 'steam_api.dll')
}

/** Staged next to the built helper (finding #4 -- helper cwd resolution). */
export function steamAppIdOutputPath(arch: string = process.arch): string {
  return join(bundledBinDir(arch), 'steam_appid.txt')
}

/**
 * Argv-form (never a shell string, T-24-06) command for compiling the
 * native arm64 helper. Exported so tests can assert the exact command
 * construction without invoking real clang.
 */
export function buildHelperCompileArgv(arch: string = process.arch): {
  command: string
  args: string[]
} {
  return {
    command: 'clang',
    args: ['-O2', '-o', helperOutputPath(arch), HELPER_SOURCE_PATH]
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
  arch: string = process.arch
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
  console.log(`Compiling native arm64 helper: ${command} ${args.join(' ')}`)
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
}

export async function main(): Promise<void> {
  await compileHelper()
  await stageSteamAppId()
  await compileShim()
}

// See meta/gen_vtables.ts for why this can't use the usual
// `require.main === module` idiom (esbuild-bundled, run via `... | node`
// stdin -- Node never sets `require.main` for a script read from stdin).
// `JEST_WORKER_ID` reliably distinguishes "imported under test" from "run as
// a script" (same guard as meta/gen_vtables.ts / meta/buildCrossoverIndex.ts).
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
