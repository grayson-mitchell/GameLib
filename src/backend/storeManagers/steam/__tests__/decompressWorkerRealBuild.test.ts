// Phase 23.1 plan 05 (coordinator-directed fix — live-hardware finding,
// 2026-08-18): closes the exact "jest-unclosable" gap this whole debug arc
// names. `decompressPool.test.ts`'s existing real-worker tests spawn
// `fixtures/poolTestWorker.js` — a hand-written CJS fixture that mirrors
// `decompressWorker.ts`'s wire protocol but deliberately never imports
// `backend/logger` at all (its own header comment says so), so it could
// never have caught a defect living specifically in `backend/logger`'s
// worker-isolate initialization. This suite instead builds and spawns the
// REAL, esbuild-compiled `build/main/decompressWorker.js` — the exact
// artifact `pnpm tauri:dev` produces and `DecompressPool` actually loads —
// so it exercises the true bundler output, not a hand-maintained mirror.
//
// Root cause this regression-tests: `backend/logger`'s `logInfo`/
// `logWarning`/`logError` dereference a module-scope `heroicLogWriter`
// singleton, assigned only by that module's `init()`/`initHeadless()`. A
// `worker_threads.Worker` gets a fresh, independent module registry that
// never runs the sidecar main thread's call — so before this plan's fix,
// the FIRST real `logInfo`/`logWarning` call inside a live worker (fired by
// `lzmaLoader.ts`'s one-time decoder log line, this worker's own import
// graph's first runtime caller of either) threw
// `Cannot read properties of undefined (reading 'logWarning')`, and
// `DecompressPool.init()`'s catch-all treated the whole worker as failed to
// spawn — collapsing the ENTIRE pool to single-threaded inline decode for
// the whole download run. Confirmed live: a real HUMANKIND install against
// this plan's own byte-offset-proven compiled sidecar binary reproduced
// exactly this warning in `gamelib.log` (see
// `.planning/debug/humankind-depot-full-stall.md`).
//
// See `fixtures/decompressWorkerRealBuildChild.js`'s own header comment for
// why the real worker under test is spawned from inside a genuinely
// separate `child_process` (with an explicit `env.HOME` override), rather
// than directly from this jest process or via `worker_threads.Worker`'s own
// `env` option — both were tried and empirically proven insufficient to
// keep this test off the developer's real `~/Library/Logs/GameLib`.

import { execFileSync, fork, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const DEV_WORKER_BUNDLE_PATH = join(
  REPO_ROOT,
  'build',
  'main',
  'decompressWorker.js'
)
const CHILD_FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'decompressWorkerRealBuildChild.js'
)

interface ChildResult {
  ok: boolean
  reason?: string
  message?: string
  stack?: string
  code?: number | null
  ready?: { type: 'ready'; lzmaKind?: string }
}

describe('decompressWorker.ts real compiled worker spawn (Phase 23.1 plan 05 regression)', () => {
  let fakeHome: string

  beforeAll(() => {
    // Real build, via the EXACT command `pnpm tauri:dev`'s own pipeline
    // runs (package.json's `build:decompress-worker-dev` script), not a
    // hand-reconstructed invocation — so this test cannot silently drift
    // from what production actually runs.
    //
    // `JEST_WORKER_ID` must NOT be inherited by this child: `execFileSync`
    // inherits `process.env` by default, and both
    // `meta/buildDecompressWorkerDev.ts` and `meta/buildSidecarSea.ts` gate
    // their own auto-run (`if (!process.env.JEST_WORKER_ID) { main()... }`)
    // on that exact variable being ABSENT — precisely so importing either
    // module from a jest test (this suite does not, but a sibling one
    // might) never triggers a real build as a side effect. Passing it
    // through unfiltered here would silently skip `main()` entirely: the
    // child would exit 0 having done nothing, and `build/main/
    // decompressWorker.js` would silently stay stale or absent — discovered
    // empirically while authoring this test (the exact failure mode this
    // comment now documents).
    const { JEST_WORKER_ID: _unused, ...envWithoutJestWorkerId } = process.env
    execFileSync(
      process.execPath,
      [
        join(REPO_ROOT, 'meta', 'runTs.cjs'),
        '--bundle',
        '--platform=node',
        '--target=node22',
        join(REPO_ROOT, 'meta', 'buildDecompressWorkerDev.ts')
      ],
      { cwd: REPO_ROOT, stdio: 'pipe', env: envWithoutJestWorkerId }
    )
    expect(existsSync(DEV_WORKER_BUNDLE_PATH)).toBe(true)

    fakeHome = mkdtempSync(
      join(tmpdir(), 'gamelib-decompressWorkerRealBuild-home-')
    )
  }, 60000)

  afterAll(() => {
    if (fakeHome) rmSync(fakeHome, { recursive: true, force: true })
  })

  function runChildFixture(): Promise<ChildResult> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child: ChildProcess = fork(
        CHILD_FIXTURE_PATH,
        [DEV_WORKER_BUNDLE_PATH],
        {
          env: {
            ...process.env,
            HOME: fakeHome,
            USERPROFILE: fakeHome,
            XDG_STATE_HOME: join(fakeHome, '.local', 'state'),
            LOCALAPPDATA: join(fakeHome, 'AppData', 'Local')
          },
          stdio: ['ignore', 'pipe', 'pipe', 'ipc']
        }
      )

      let settled = false
      let stderr = ''
      child.stderr?.on('data', (d) => {
        stderr += d.toString()
      })

      child.on('message', (msg: ChildResult) => {
        if (settled) return
        settled = true
        resolvePromise(msg)
      })

      child.on('error', (err) => {
        if (settled) return
        settled = true
        rejectPromise(err)
      })

      child.on('exit', (code) => {
        if (settled) return
        settled = true
        rejectPromise(
          new Error(
            `child fixture process exited (code=${code}) before sending a result. stderr:\n${stderr}`
          )
        )
      })
    })
  }

  test('the REAL esbuild-compiled decompressWorker.js sends a ready handshake -- does NOT crash -- when loadLzmaModule() first calls backend/logger', async () => {
    const result = await runChildFixture()

    // Before this plan's fix, this would be `{ ok: false, reason: 'worker
    // error event', message: "Cannot read properties of undefined
    // (reading 'logWarning')" }` -- the exact live-hardware failure
    // signature.
    expect(result.ok).toBe(true)
    expect(result.ready?.type).toBe('ready')
    // lzmaKind is optional in the wire type, but this build always
    // resolves loadLzmaModule() (native-first, pure-JS fallback, never
    // rejects) before sending 'ready' -- so it must be present and one of
    // the two known decoder kinds.
    expect(['native', 'pure-js']).toContain(result.ready?.lzmaKind)
  }, 30000)
})
