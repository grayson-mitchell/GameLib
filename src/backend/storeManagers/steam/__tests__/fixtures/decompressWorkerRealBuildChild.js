// Phase 23.1 plan 05 (coordinator-directed fix regression test).
//
// Forked as a genuinely SEPARATE Node process by
// decompressWorkerRealBuild.test.ts, with an explicit `env.HOME` (and
// platform-equivalent) override -- NOT run inline inside the jest worker,
// and NOT passed via `worker_threads.Worker`'s own `env` option. Both were
// tried and empirically disproven while authoring this test:
//
// 1. Jest replaces `global.process` per test file with a synthetic clone
//    whose `.env` is a JS-only proxy -- writes to `process.env.HOME` from
//    inside a jest test never reach the real OS environ (already documented
//    in this repo, `jest.setupContainment.ts`'s own docstring, empirically
//    re-confirmed for this test).
// 2. `os.homedir()` is a native libuv `uv_os_homedir()` call that reads the
//    actual PROCESS environ directly -- and a `worker_threads.Worker` is a
//    thread within the SAME OS process as its parent, so its own `env`
//    constructor option only changes what THAT worker's own JS-level
//    `process.env` object shows; it does NOT create a separate real environ
//    for `os.homedir()`'s native read to see. Verified empirically: a probe
//    worker given `env: { HOME: '/tmp/FAKE' }` still reported
//    `os.homedir()` as the real developer home.
// 3. A genuinely separate `child_process` DOES get its own real environ at
//    spawn/exec time (this is what `env` actually controls for
//    `child_process.fork`/`spawn`) -- confirmed empirically the same way.
//    This file is that separate process.
//
// This matters because `backend/logger/paths.ts`'s `getBaseLogPath()`
// macOS branch has NO env-var fallback at all (`join(homedir(), 'Library',
// 'Logs', 'GameLib')`) -- the exact branch `jest.setupContainment.ts` was
// created to contain for in-process jest code, a route that mechanism
// cannot reach once code is running inside a REAL `worker_threads.Worker`
// spawned from a real file on disk (jest's `jest.mock('os', ...)` only
// substitutes modules inside jest's OWN module registry, never a
// separately-loaded worker isolate). Without this file's process-level
// redirection, this regression test would write to -- and could rotate --
// the developer's REAL `~/Library/Logs/GameLib/gamelib.log`, reproducing
// exactly the class of defect `jest.setupContainment.ts` already exists to
// prevent, just via a route that mechanism cannot cover.

'use strict'

const { Worker } = require('node:worker_threads')

const workerPath = process.argv[2]
if (!workerPath) {
  process.send({ ok: false, reason: 'no workerPath argv[2] provided' })
  process.exit(1)
}

const worker = new Worker(workerPath)
let settled = false

const timeout = setTimeout(() => {
  if (settled) return
  settled = true
  process.send({ ok: false, reason: 'timed out waiting for ready/error' })
  worker
    .terminate()
    .catch(() => {})
    .finally(() => process.exit(1))
}, 20000)

worker.on('message', (msg) => {
  if (settled) return
  if (msg && msg.type === 'ready') {
    settled = true
    clearTimeout(timeout)
    process.send({ ok: true, ready: msg })
    worker
      .terminate()
      .catch(() => {})
      .finally(() => process.exit(0))
  }
})

worker.on('error', (err) => {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  // This is the EXACT signature the pre-fix defect produced: a synchronous
  // property-access throw ("Cannot read properties of undefined (reading
  // 'logWarning')") inside loadLzmaModule()'s one-time decoder log call,
  // surfacing here as a worker 'error' event instead of a 'ready' message.
  process.send({
    ok: false,
    reason: 'worker error event',
    message: err && err.message,
    stack: err && err.stack
  })
  process.exit(1)
})

worker.on('exit', (code) => {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  process.send({ ok: false, reason: 'worker exited before ready/error', code })
  process.exit(1)
})
