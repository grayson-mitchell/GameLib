/**
 * Debug/dev-mode-decompress-worker-electron-hook: pure, side-effect-free
 * helpers shared between `meta/buildSidecarSea.ts` (the packaged SEA worker
 * bundle) and `meta/buildDecompressWorkerDev.ts` (the dev/Electron worker
 * bundle) -- both need the IDENTICAL `--alias:electron` esbuild fix
 * (quick-260817-pkx originally, this debug session extends it to dev mode),
 * so the flags/entry-path/spawn helper are single-sourced here instead of
 * duplicated, to prevent the two bundles from silently drifting apart.
 *
 * Deliberately factored OUT of `buildSidecarSea.ts` rather than imported
 * from it directly: that file has an unconditional `if
 * (!process.env.JEST_WORKER_ID) { main().catch(...) }` at module scope,
 * which runs the FULL SEA build pipeline (codesign, postject injection, Node
 * binary download/copy) as a side effect of merely IMPORTING it -- discovered
 * empirically when `buildDecompressWorkerDev.ts` first imported from
 * `buildSidecarSea.ts` directly and `pnpm build:decompress-worker-dev`
 * silently also produced a full `src-tauri/binaries/gamelib-sidecar-*`
 * binary on every invocation. This module has no such guard because it has
 * no `main()`/CLI entry point at all -- it is pure exports, safe to import
 * from anywhere.
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

/** `decompressWorker.ts`'s source entry -- both the SEA and dev worker
 *  bundles compile this exact file. */
export const DECOMPRESS_WORKER_ENTRY_PATH = join(
  'src',
  'backend',
  'storeManagers',
  'steam',
  'depot',
  'decompressWorker.ts'
)

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
 * The nine esbuild flags proven correct for a fully self-contained,
 * electron-stub-aliased worker bundle (originally `buildSidecarSea.ts`'s
 * `seaEsbuildFlags()`, written for the SEA path, fixed by quick task
 * 260817-pkx). `--alias:electron` statically replaces
 * `require('electron')`/`import ... from 'electron'` (first-party AND
 * inside bundled third-party code) with this project's own
 * `backend/sidecar/electronStub.ts` at BUILD TIME -- so there is no
 * unresolved runtime `require('electron')` left in the output for ANY
 * bundler's chunk-splitting/hoisting order to race against. The
 * `i18next-fs-backend` alias and `sidecarSeaFsShim` inject exist for
 * unrelated esbuild/cjs-bundling pitfalls this worker's import chain can
 * also reach (see the original SEA fix's commit history) -- kept identical
 * across both bundles rather than hand-trimmed per consumer, so neither can
 * regress independently.
 */
export function seaEsbuildFlags(outfile: string, entry: string): string[] {
  return [
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--alias:electron=./src/backend/sidecar/electronStub.ts',
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
