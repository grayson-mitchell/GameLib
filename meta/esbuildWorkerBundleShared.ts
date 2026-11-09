/**
 * Pure, side-effect-free esbuild/spawn helpers for `meta/buildSidecarSea.ts`.
 * They were originally shared with the dev/Electron decompress-worker bundle
 * (`meta/buildDecompressWorkerDev.ts`), deleted with the worker in 73-20.
 * The lzma-native build-time helpers that also lived here
 * (`writeLzmaNativeResolvedPaths()`, `assertNodeGypBuildSingleConsumer()`)
 * were removed with the `lzma-native` dependency in 73-21.
 *
 * Kept as a separate module rather than folded into `buildSidecarSea.ts`:
 * that file has an unconditional `if (!process.env.JEST_WORKER_ID) {
 * main().catch(...) }` at module scope, which runs the FULL SEA build
 * pipeline (codesign, postject injection, Node binary download/copy) as a
 * side effect of merely IMPORTING it. This module has no `main()`/CLI entry
 * point at all -- it is pure exports, safe to import from anywhere.
 */

import { spawn } from 'node:child_process'

/**
 * CR-02/GAP-2 fix (originally `buildSidecarSea.ts`): resolves esbuild's own
 * installed binary path directly rather than relying on `.bin` shims, which
 * pnpm materializes differently per OS (a POSIX shell shim plus `.CMD`/
 * `.ps1` siblings on Windows -- no extensionless native executable to spawn
 * directly there).
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

/**
 * The nine esbuild flags proven correct for a fully self-contained worker
 * bundle (originally `buildSidecarSea.ts`'s `seaEsbuildFlags()`, written for
 * the SEA path, fixed by quick task 260817-pkx; extended to ten by Phase 23.1
 * Plan 03). Until Phase 35 Plan 18, this list also carried
 * `--alias:electron=./src/backend/platform/index.ts`, statically replacing
 * `require('electron')`/`import ... from 'electron'` (first-party AND inside
 * bundled third-party code) with this project's own `backend/platform/
 * index.ts` at BUILD TIME. That alias is gone now: the `electron`
 * devDependency was removed outright (Plan 18), and first-party code already
 * imports `backend/platform` directly everywhere -- there is no remaining
 * `'electron'` specifier anywhere in `src/` for esbuild to need to rewrite
 * (proven by `meta/__tests__/electronAbsence.test.ts`). The
 * `i18next-fs-backend` alias and `sidecarSeaFsShim` inject exist for
 * unrelated esbuild/cjs-bundling pitfalls this worker's import chain can
 * also reach (see the original SEA fix's commit history) -- kept identical
 * across both bundles rather than hand-trimmed per consumer, so neither can
 * regress independently.
 *
 * Phase 23.1 Plan 03 added `--alias:node-gyp-build`, rewriting lzma-native's
 * `require('node-gyp-build')(__dirname)` to the SEA-aware shim
 * `depot/lzmaNativeBinding.ts`. The shim and the alias were removed in 73-20
 * with the decompress worker, the only code that loaded lzma-native.
 */
export function seaEsbuildFlags(outfile: string, entry: string): string[] {
  return [
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--alias:i18next-fs-backend=i18next-fs-backend/cjs',
    '--inject:./meta/sidecarSeaFsShim.ts',
    `--outfile=${outfile}`,
    entry
  ]
}

/** Argv-form (never a shell string, T-24-06 convention) child_process spawn,
 *  capturing stdout/stderr for compile-gate error reporting. */
export function spawnArgv(
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
