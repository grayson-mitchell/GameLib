/**
 * Phase 35 plan 01, Task 1 (OQ-1). Throwaway empirical probe -- NOT production code, NOT wired
 * into any build path. Answers one question by measurement rather than assumption: does
 * `require('node:sea').isSea()` return the SAME value on the sidecar's main thread as it does
 * inside a `worker_threads.Worker` spawned from that main thread?
 *
 * This is security-relevant. `src/backend/sidecar/devSecretVault.ts`'s guardrail (c) refuses to
 * install in a packaged build by trusting `isPackagedSidecar()`
 * (`src/backend/sidecar/humbleFlowRegistration.ts:159`) -- and D-14 (35-CONTEXT.md) proposes
 * making `app.isPackaged` a THIRD caller of that same function. If a worker-thread context ever
 * observed a *different* `isSea()` value than the main thread, any code that trusted a
 * worker-derived answer for a main-thread-scoped decision (or vice versa) would be trusting a
 * value that can silently disagree with reality -- exactly the "two derivations that could
 * disagree" hazard D-14's own text warns about, just inside a single process rather than across
 * two functions.
 *
 * Mirrors `isPackagedSidecar()`'s exact guarded shape on purpose -- `require('node:sea')` (not
 * `import`), typed as `{ isSea: () => boolean }`, `catch` returning the fail-closed value `true`.
 * Do NOT "clean up" or simplify this shape; the entire point is to measure the behaviour of the
 * code that actually ships, not a hypothetically nicer version of it.
 *
 * Deliberately uses `new Worker(source, { eval: true })` with an INLINE source string --
 * mirroring `decompressPool.ts`'s `resolveWorkerSpec()` SEA-asset technique (the same file this
 * probe's `read_first` names) -- rather than `new Worker(__filename)`. A path-based Worker spec
 * cannot be resolved inside a packaged SEA binary (there is no on-disk file at `__filename`
 * inside the single-file executable); eval-mode sidesteps that entirely and requires no SEA
 * `assets` config, no wiring into `meta/buildSidecarSea.ts`, and no change to any file this plan
 * does not already declare in `files_modified` -- this script's own SEA build (see
 * `35-PREFLIGHT.md`'s OQ-1 section for the exact recipe used) is entirely self-contained and
 * touches no production build path.
 *
 * Handoff: deleted by plan 35-18, which owns the final `electron`-absence / dead-file sweep for
 * this phase (recorded so this probe does not become permanent debris -- see 35-01-PLAN.md's
 * constraints).
 *
 * Usage: `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/probeSeaInWorker.ts`
 * (dev/plain-node context), or run the built SEA binary produced from this same entry (packaged
 * context). Prints exactly one line to stdout:
 *
 *   main=<true|false|throw> worker=<true|false|throw>
 *
 * and always exits 0 -- a thrown/unavailable `node:sea` in either context is itself a valid,
 * recordable measurement, not a probe failure.
 */

import { Worker } from 'node:worker_threads'

/** Mirrors `isPackagedSidecar()`'s guarded shape verbatim (see file header). Evaluated on
 *  whichever thread calls it -- this same function body is also stringified below and re-run
 *  inside the spawned worker, so both contexts run byte-for-byte identical logic. */
function guardedIsSea(): boolean | 'throw' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeSea = require('node:sea') as { isSea: () => boolean }
    return nodeSea.isSea()
  } catch {
    return 'throw'
  }
}

/** Source for the spawned worker, built as a plain string (never a template over untrusted
 *  input -- this file is the only writer) so `new Worker(..., { eval: true })` needs no on-disk
 *  asset. Re-implements `guardedIsSea()`'s body inline (workers spawned via `eval: true` do not
 *  share this module's scope) and posts the result back rather than writing to stdout directly,
 *  so ordering with the main thread's own `console.log` stays deterministic. */
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads')
let result
try {
  const nodeSea = require('node:sea')
  result = nodeSea.isSea()
} catch {
  result = 'throw'
}
parentPort.postMessage(result)
`

function formatResult(value: boolean | 'throw'): string {
  return value === 'throw' ? 'throw' : String(value)
}

function main(): void {
  const mainResult = guardedIsSea()

  let settled = false
  const finish = (workerResult: boolean | 'throw' | 'unresolved'): void => {
    if (settled) return
    settled = true
    console.log(
      `main=${formatResult(mainResult)} worker=${
        workerResult === 'unresolved' ? 'throw' : formatResult(workerResult)
      }`
    )
    // Always exit 0 (acceptance criterion) -- a measured 'throw' in either
    // context is a valid, recorded outcome, not a probe failure.
    process.exit(0)
  }

  let worker: Worker
  try {
    worker = new Worker(WORKER_SOURCE, { eval: true })
  } catch {
    // Could not even spawn the worker -- record as worker=throw rather than
    // crashing the probe itself.
    finish('unresolved')
    return
  }

  worker.once('message', (msg: unknown) => {
    finish(
      typeof msg === 'boolean' ? msg : msg === 'throw' ? 'throw' : 'unresolved'
    )
  })
  worker.once('error', () => {
    finish('unresolved')
  })
  worker.once('exit', () => {
    // If the worker exited without ever posting a message (e.g. it threw
    // synchronously before reaching parentPort.postMessage), still finish
    // rather than hang.
    finish('unresolved')
  })
}

main()
