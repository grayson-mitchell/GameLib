#!/usr/bin/env node
/**
 * Sidecar startup smoke gate.
 *
 * Exists because of a REAL regression on 2026-08-23 (`727be5dbb`): a one-line
 * import reorder in `src/sidecar/index.ts` made the sidecar die on boot with
 * `ERR_INVALID_ARG_TYPE: The "path" argument must be of type string`, which the
 * user saw as `broken pipe (os error 32)` from the Tauri shell.
 *
 * Nothing in the existing toolchain caught it:
 *
 *   - all 176 backend jest suites stayed GREEN;
 *   - `pnpm build:sidecar` exited 0 — the bundle builds fine, it just cannot run;
 *   - `tsc --noEmit` exited 0;
 *   - even a bundle byte-offset check "confirming" module emission order passed,
 *     because emission order says nothing about whether the process survives.
 *
 * The sidecar's whole failure mode is evaluation-order-dependent: module scopes
 * run in import order, and `bootstrap.ts` must install its `Module._load` hook
 * before any `backend/*` module is evaluated. That is invisible to unit tests by
 * construction, because jest supplies its own module registry.
 *
 * So the gate is the crude thing that actually works: BUILD IT AND RUN IT.
 * Costs about a second.
 *
 * Exit 0 = the sidecar reached its RPC loop and shut down cleanly on stdin EOF.
 */
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const REPO_ROOT = join(__dirname, '..')
const BUNDLE = join(REPO_ROOT, 'build', 'main', 'sidecar.js')
const STARTUP_TIMEOUT_MS = 30_000

function fail(message, extra) {
  console.error(`\n[sidecar-smoke] FAIL: ${message}`)
  if (extra) console.error(extra)
  process.exit(1)
}

const build = spawnSync('pnpm', ['build:sidecar'], {
  cwd: REPO_ROOT,
  encoding: 'utf-8'
})
if (build.status !== 0) {
  fail('pnpm build:sidecar did not exit 0', build.stderr || build.stdout)
}
if (!existsSync(BUNDLE))
  fail(`bundle missing at ${BUNDLE} despite a successful build`)

// No stdin: the RPC loop sees EOF immediately and shuts down. A healthy sidecar
// exits 0; one that dies during module evaluation exits non-zero with the
// throwing module named in its stack.
const run = spawnSync(process.execPath, [BUNDLE], {
  cwd: REPO_ROOT,
  encoding: 'utf-8',
  timeout: STARTUP_TIMEOUT_MS
})

if (run.error && run.error.code === 'ETIMEDOUT') {
  fail(
    `the sidecar did not exit within ${STARTUP_TIMEOUT_MS}ms of stdin EOF. It is ` +
      'hanging at startup rather than crashing, which is its own defect.'
  )
}
if (run.status !== 0) {
  fail(
    `the sidecar exited ${run.status} at startup. It builds but cannot run — ` +
      'almost always an import/evaluation-ORDER problem, not a type error. See ' +
      'the memory note `sidecar-guard-first-import-breaks-electron-hook`.',
    run.stderr
  )
}

console.log('[sidecar-smoke] PASS: built, started, exited 0 on stdin EOF.')
