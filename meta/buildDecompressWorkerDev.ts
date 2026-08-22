/**
 * Debug/dev-mode-decompress-worker-electron-hook: standalone esbuild bundle
 * for `decompressWorker.ts`, used by `pnpm tauri:dev` (dev/Electron builds).
 * Produces `build/main/decompressWorker.js` -- the exact path
 * `DecompressPool`'s `resolveWorkerSpec()` resolves via `path.join(__dirname,
 * 'decompressWorker.js')` whenever this is not a packaged SEA sidecar.
 *
 * WHY THIS FILE EXISTS (root cause): `decompressWorker.ts` was previously
 * built by `electron-vite`'s shared `main` rollupOptions.input block,
 * alongside `main.js` (the legacy, unused-under-Tauri Electron entry).
 * Rollup's CJS output for a multi-entry build extracts code reachable from
 * BOTH entries (here: `decodeChunk`'s own `./decompress -> backend/logger ->
 * ... -> constants/paths.ts` chain, which `main.js` also transitively
 * reaches via `backend/storeManagers/index.ts`'s eager store-manager
 * construction) into a SHARED CHUNK, then `require()`s that chunk as part of
 * a single hoisted `const` statement at the very TOP of the generated file --
 * before ANY of `decompressWorker.js`'s own body code runs. `constants/
 * paths.ts` calls `app.getPath('appData')` at MODULE SCOPE
 * (`import { app } from 'electron'` also at module scope), so by the time
 * that shared chunk's `require()` resolves, plain Node's real 'electron'
 * npm package resolves (bare string outside an actual Electron process,
 * not an `{ app, ... }` object) -- `app` destructures to `undefined`, and
 * `app.getPath` throws `Cannot read properties of undefined (reading
 * 'getPath')`. A first-import runtime `Module._load` hook (mirroring
 * `bootstrap.ts`'s "hook-before-graph" convention) does NOT fix this: that
 * hook-install code, even placed as literally the first source-level
 * `import`, still compiles into the module's OWN BODY (not the hoisted
 * chunk-require preamble), so it still runs too late. Confirmed empirically
 * against a real built-and-spawned `worker_threads.Worker` before writing
 * this file.
 *
 * THE FIX: statically alias `electron` -> `electronStub.ts` at BUILD TIME
 * (esbuild's `--alias`), exactly like the packaged SEA worker bundle already
 * does (`buildWorkerEsbuildArgv()`/`seaEsbuildFlags()` in
 * `buildSidecarSea.ts`, fixed by quick task 260817-pkx). With the alias in
 * place there is no unresolved runtime `require('electron')` left in the
 * bundle at all -- nothing for ANY bundler's chunk-splitting/hoisting
 * behavior to race against. Single-sourced from the exact same
 * `seaEsbuildFlags()` function the SEA bundle uses (only the outfile
 * differs), so the two bundles cannot silently drift apart on these flags.
 *
 * `decompressWorker` was removed from `electron.vite.config.ts`'s
 * `rollupOptions.input` (see that file) so electron-vite/Rollup no longer
 * builds this file at all -- this script is now the ONLY producer of
 * `build/main/decompressWorker.js` in dev mode, eliminating the shared-chunk
 * hazard at its root rather than merely out-ordering it.
 *
 * Wired into `pnpm tauri:dev` (package.json) as `pnpm
 * build:decompress-worker-dev`, after `electron-vite build` and
 * `pnpm build:sidecar`.
 *
 * Imports from `esbuildWorkerBundleShared.ts`, NOT `buildSidecarSea.ts`
 * directly -- `buildSidecarSea.ts` runs the FULL SEA build pipeline
 * (codesign, postject injection, Node binary download/copy) as a
 * module-scope side effect of merely being imported (its own bottom guard
 * only skips this under jest's `JEST_WORKER_ID`, not for other CLI
 * scripts). Confirmed empirically: an earlier version of this file imported
 * from `buildSidecarSea.ts` directly and every `pnpm
 * build:decompress-worker-dev` run silently also produced a full
 * `src-tauri/binaries/gamelib-sidecar-*` binary.
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DECOMPRESS_WORKER_ENTRY_PATH,
  resolveEsbuildCli,
  seaEsbuildFlags,
  spawnArgv,
  assertNodeGypBuildSingleConsumer,
  writeLzmaNativeResolvedPaths
} from './esbuildWorkerBundleShared'

/** Dev/Electron-mode output path -- `DecompressPool.resolveWorkerSpec()`'s
 *  `__dirname`-relative fallback (`src/backend/storeManagers/steam/depot/
 *  decompressPool.ts`). Deliberately separate from the packaged SEA bundle's
 *  `build/main/decompressWorker-sea-bundle.js` -- "extend, do NOT replace",
 *  matching this codebase's existing SEA-vs-dev convention. */
export const DEV_WORKER_BUNDLE_PATH = join(
  'build',
  'main',
  'decompressWorker.js'
)

/**
 * Argv-form (never a shell string, T-24-06 convention) esbuild invocation,
 * exported so a test can assert the exact command without invoking the real
 * esbuild toolchain. Mirrors `buildWorkerEsbuildArgv()` in
 * `buildSidecarSea.ts` exactly except for the outfile.
 */
export function buildDevWorkerEsbuildArgv(
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  const esbuildCli = resolveEsbuildCli()
  const flags = seaEsbuildFlags(
    DEV_WORKER_BUNDLE_PATH,
    DECOMPRESS_WORKER_ENTRY_PATH
  )
  if (platform === 'win32') {
    return { command: process.execPath, args: [esbuildCli, ...flags] }
  }
  return { command: esbuildCli, args: flags }
}

/**
 * Compile-gate discipline mirrors `bundleWorkerForSea()`'s exactly (entry-
 * point guard, non-zero exit throws, "exit 0 but no file emitted" throws) --
 * a silent failure here means `DecompressPool.init()` falls back to inline,
 * single-thread decode for the entire dev-mode download run, the exact
 * symptom this file exists to fix.
 */
async function bundleWorkerForDev(): Promise<void> {
  if (!existsSync(DECOMPRESS_WORKER_ENTRY_PATH)) {
    throw new Error(
      `Missing decompress worker entry point at ${DECOMPRESS_WORKER_ENTRY_PATH}`
    )
  }
  await mkdir(join('build', 'main'), { recursive: true })
  // Phase 23.1 plan 05: same two build-time steps buildSidecarSea.ts's
  // bundleWorkerForSea() now runs, before its esbuild invocation too -- see
  // that call site and esbuildWorkerBundleShared.ts's own header comment
  // for the full rationale (both worker bundles share this exact defect).
  assertNodeGypBuildSingleConsumer()
  writeLzmaNativeResolvedPaths()
  const esbuildArgv = buildDevWorkerEsbuildArgv()
  const result = await spawnArgv(esbuildArgv.command, esbuildArgv.args)
  if (result.code !== 0) {
    throw new Error(
      `COMPILE GATE FAILED: esbuild dev decompress-worker bundle exited ${result.code}:\n${result.stderr}`
    )
  }
  if (!existsSync(DEV_WORKER_BUNDLE_PATH)) {
    throw new Error(
      `COMPILE GATE FAILED: esbuild exited 0 but no worker bundle was emitted at ${DEV_WORKER_BUNDLE_PATH}`
    )
  }
}

export async function main(): Promise<void> {
  await bundleWorkerForDev()
  console.log(
    `[build:decompress-worker-dev] esbuild-aliased worker bundle -> ${DEV_WORKER_BUNDLE_PATH}`
  )
}

// Run via `node meta/runTs.cjs` (package.json's build:decompress-worker-dev,
// mirroring build:sidecar-sea's own invocation), but also imported directly
// by its jest suite -- same JEST_WORKER_ID guard as buildSidecarSea.ts.
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
