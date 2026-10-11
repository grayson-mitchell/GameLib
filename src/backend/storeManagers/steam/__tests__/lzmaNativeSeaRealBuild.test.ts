// Phase 23.1 plan 05 (coordinator-directed fix, live-hardware finding
// 2026-08-18, SECOND round): after the worker-thread logger-init fix, a
// real packaged SEA install (Planetfall, real `gamelib.log`, sidecar binary
// confirmed byte-identical to Task 1's proven build) STILL failed to engage
// native decode:
//
//   lzmaLoader: lzma-native failed to load or smoke-test-decode...
//   Cause: [lzmaNativeBinding] refusing to resolve a native binding for
//   directory "."
//
// Root cause: `lzmaNativeBinding.ts`'s (now-retired) `dirBelongsToLzmaNative
// (dir)` identity guard rejected the LEGITIMATE call, because once esbuild
// bundles `lzma-native`'s `index.js` into the SEA output, `__dirname`
// collapses to `"."` inside an eval'd worker (no backing file at all) --
// exactly what this file's own header comment, carried forward from spike
// 023, had already predicted. The guard threw BEFORE resolution ever
// reached the SEA-asset-loading branch (`sea.getRawAsset()` +
// `process.dlopen()`) that Task 1's byte-offset proof had already confirmed
// the addon shipped correctly for -- the bytes being present was true and
// irrelevant, because the code path that would have read them never ran.
//
// This suite builds a REAL, cold `pnpm build:sidecar-sea` SEA binary and
// spawns it directly with `GAMELIB_SIDECAR_SELFTEST=decompress-pool` --
// the self-test harness quick-260817-pkx built specifically so a compiled
// SEA binary's real `worker_threads` pool (and, since plan 23.1-04, its
// real native-vs-pure-JS decoder resolution, surfaced via
// `DecompressPool.stats().nativeWorkers`) can be proven WITHOUT a real
// Steam depot install. This is the SEA-binary sibling of
// `decompressWorkerRealBuild.test.ts` (which covers the DEV bundle) --
// neither a mocked nor a unit-level test would have caught either round of
// this defect, both of which only manifest once genuinely bundled and
// compiled into the real artifact.
//
// Safety note (same finding as decompressWorkerRealBuild.test.ts's own
// header, applied here): `os.homedir()` is a native, process-wide libuv
// call. Unlike a `worker_threads.Worker`'s own `env` option (proven
// insufficient in the sibling test), a genuinely separate
// `child_process.spawn()`'s `env` DOES set a real environ for that whole
// process AND everything it spawns (including this binary's own internal
// worker_threads workers, since they share ONE process's real environ) --
// verified empirically while authoring that sibling test. HOME is
// redirected at the point THIS binary itself is spawned; no extra wrapper
// process is needed here, since the binary IS the top-level process.
//
// THIRD finding (coordinator/human-operator directed, 2026-08-18, same
// session): fixing the identity-guard defect above uncovered a DEEPER,
// SEPARATE defect -- decoding a real-sized chunk via the native path times
// out inside a genuinely compiled SEA binary specifically. Native decode
// is now gated OFF by default in shipping code
// (`NATIVE_LZMA_DECODE_ENABLED`, `lzmaLoader.ts`) until that is understood
// and fixed. Full investigation, current status, and re-enable criteria:
// `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md`.
//
// CRITICAL CORRECTION, found while writing this file's own tests for the
// gate above: the hang is NOT native-specific. With native confirmed
// gated off (nativeWorkers:0), the exact same real-sized decode STILL
// times out via the pure-JS path, reproduced twice independently. See the
// second test below (NO LONGER SKIPPED as of 2026-09-12 -- it is green now;
// this paragraph is the historical record of when it was not) and the debug
// file's own "CRITICAL CORRECTION"
// entry for the full record -- the gate is still a real, worthwhile fix
// (lzma-native's own resolution is now provably correct), but it does NOT
// make a packaged SEA install's worker-pool decode path safe end-to-end.
//
// 2026-10-11: the switch went back ON by operator revision of the
// 2026-08-18 standing decision ("re-enable it, I'll do the Mac install
// after"). The root cause of the 2026-08-18 hang is still unknown; the
// details, the evidence and the turn-off steps are in `lzmaLoader.ts`'s
// `NATIVE_LZMA_DECODE_ENABLED` doc comment.

import type { ChildProcess } from 'node:child_process'
import { execFileSync, spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../../testUtils/fakeHomeProfile'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const BINARIES_DIR = join(REPO_ROOT, 'src-tauri', 'binaries')

interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * quick-260912-e6k — Layer 2 of the sidecar-EPIPE-spin fix (2026-09-06 orphan todo).
 *
 * Tracks every child this suite's own `spawnCapture()` starts, so an interrupted jest run
 * (Ctrl-C, a CI job killed, the whole process SIGTERM'd) can reap them instead of leaving a
 * spinning SEA binary behind at ppid 1.
 *
 * HONEST LIMIT, stated because a reader will otherwise assume this alone closes the todo: a
 * SIGKILL on THIS jest process cannot be intercepted by anything -- Node gives no hook for it,
 * by design. This reaper covers SIGINT/SIGTERM/normal exit/afterAll only. What actually
 * closes the todo is `processGuards.ts`'s `installStdioErrorGuards()` (this same quick task,
 * Task 1): a reaped-parent child now terminates on its own once its stdio pipe dies, instead
 * of spinning forever, which is why that fix had to live in shipping code and not here.
 */
const liveChildren = new Set<ChildProcess>()

function reapLiveChildren(): void {
  for (const child of liveChildren) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Already exited -- nothing useful to do with the error.
    }
  }
  liveChildren.clear()
}

function spawnCapture(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<SpawnResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    liveChildren.add(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => {
      // A spawn that never started still needs its handle removed -- otherwise a dead
      // handle sits in the set forever, since 'close' never fires for it.
      liveChildren.delete(child)
      rejectPromise(err)
    })
    child.on('close', (code) => {
      liveChildren.delete(child)
      resolvePromise({ code, stdout, stderr })
    })
  })
}

// Module-scope registrations. Deliberately does NOT call process.exit() from any of these --
// jest already installs its own SIGINT handler, replacing Node's default termination, so
// these only ADD cleanup ahead of jest's own teardown rather than pre-empting it.
//
// Known interaction: `process.once('exit', ...)` adds one listener to the same `process`
// whose exit-listener count `sidecarRejectionGuard.test.ts`'s IN-06 gate bounds at
// EXIT_LISTENER_CEILING = 32 when the two files share a jest worker. Last measured there: 23.
// One more is comfortably inside the headroom, but if IN-06 ever goes red, this is not a
// mysterious cause.
process.once('exit', reapLiveChildren)
process.once('SIGINT', reapLiveChildren)
process.once('SIGTERM', reapLiveChildren)

describe('SEA sidecar binary real native lzma resolution (Phase 23.1 plan 05, round 2 regression)', () => {
  let profile: FakeHomeProfile
  let binaryPath: string

  beforeAll(() => {
    // Real, cold pnpm build:sidecar-sea -- the EXACT command Task 1's own
    // gates ran, and the exact command the coordinator asked this fix be
    // re-verified against. JEST_WORKER_ID must NOT be inherited (see
    // decompressWorkerRealBuild.test.ts's own beforeAll comment for why --
    // buildSidecarSea.ts has the identical auto-run guard
    // buildDecompressWorkerDev.ts does).
    const { JEST_WORKER_ID: _unused, ...envWithoutJestWorkerId } = process.env
    execFileSync('pnpm', ['build:sidecar-sea'], {
      cwd: REPO_ROOT,
      env: envWithoutJestWorkerId,
      stdio: 'pipe'
    })

    const bins = readdirSync(BINARIES_DIR).filter((f) =>
      f.startsWith('gamelib-sidecar-')
    )
    if (bins.length !== 1) {
      throw new Error(
        `Expected exactly one gamelib-sidecar-* binary in ${BINARIES_DIR}, found: ${bins.join(', ')}`
      )
    }
    binaryPath = join(BINARIES_DIR, bins[0])
  }, 180000)

  // quick-260913-arr: was a hand-rolled `mkdtempSync` + a four-variable env
  // block, which was measurably LEAKIER than the jest containment one
  // directory away (it left APPDATA, XDG_CONFIG_HOME, XDG_DATA_HOME and
  // XDG_CACHE_HOME pointing at the operator's real profile). The helper owns
  // all eight, the 0700 root, and disposal. See CLAUDE.md's two-profile rule.
  //
  // 2026-10-05: one profile PER TEST, not one from beforeAll. Each test is a
  // separate binary invocation, and CLAUDE.md's rule is "fresh profile per
  // invocation, always" -- a profile shared across tests lets the first
  // run's on-disk state (logs, config) shape the second's. Any child still
  // live (a timed-out test) is reaped before its profile is shredded.
  beforeEach(() => {
    profile = createFakeHomeProfile({
      prefix: 'gamelib-lzmaNativeSeaRealBuild-home-'
    })
  })

  afterEach(() => {
    reapLiveChildren()
    profile?.dispose()
  })

  // quick-260912-e6k: reap any child this suite's own spawnCapture() left live (a
  // hung/timed-out test, or a test that threw before its spawn settled). See the
  // liveChildren/reapLiveChildren doc comment above for what this does and does not cover.
  afterAll(reapLiveChildren)

  // Native decode is ON by default again (2026-10-11 operator revision of
  // the 2026-08-18 standing decision; NATIVE_LZMA_DECODE_ENABLED,
  // lzmaLoader.ts -- see
  // `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md`
  // for the history). A real compiled SEA binary's pool must spawn cleanly
  // (the FIRST round's fix) AND report native engaged on every worker:
  // `nativeWorkers` equal to the pool size. This asserts the shipped
  // default end-to-end inside a genuinely compiled binary, not just in a
  // jest mock. A SEA load fallback (pure-JS, e.g. the addon failing to
  // dlopen) leaves `nativeWorkers` below `size` and turns this red. If the
  // switch is ever turned back off, this expectation goes back to
  // `toBe(0)` in the same commit (see lzmaLoader.ts's turn-off steps).
  test("the REAL compiled SEA binary's worker pool spawns cleanly with native decode engaged on every worker (inlineFallback=false, nativeWorkers=size)", async () => {
    const result = await spawnCapture(
      binaryPath,
      [],
      profile.childEnv({
        ...process.env,
        GAMELIB_SIDECAR_SELFTEST: 'decompress-pool'
      })
    )

    const poolLine = result.stdout
      .split('\n')
      .find((line) => line.startsWith('SELFTEST pool='))

    // Before round 1's fix, this self-test reported inlineFallback=true
    // (the worker-thread logger crash -- the pool never spawned at all).
    // With the switch ON, a healthy build reports nativeWorkers=size.
    expect(poolLine).toBeDefined()
    const stats = JSON.parse(poolLine!.slice('SELFTEST pool='.length)) as {
      size: number
      inlineFallback: boolean
      nativeWorkers: number
    }
    expect(stats.inlineFallback).toBe(false)
    expect(stats.size).toBeGreaterThan(0)
    expect(stats.nativeWorkers).toBe(stats.size)
  }, 30000)

  // CRITICAL CORRECTION, found while writing THIS test (2026-08-18, same
  // session, after the gate above was implemented and verified): the
  // ORIGINAL framing of this whole finding -- "the real-chunk hang is a
  // native-decode-specific problem, gating native off routes around it" --
  // is WRONG. Run directly against a freshly-cold-built binary (not just
  // under jest, to rule out any jest-specific artifact):
  //
  //   SELFTEST pool={"size":2,...,"inlineFallback":false,"nativeWorkers":0}
  //   SELFTEST decode=fail code=decompress_pool_timeout message=decompress
  //   task 0 timed out
  //
  // With native decode CONFIRMED gated off (nativeWorkers:0, matching the
  // test above), the exact same real-sized decode task STILL hangs and
  // times out. Reproduced twice independently (once via jest, once via a
  // bare shell invocation of the same binary) to rule out a one-off/flaky
  // result. This means the hang is NOT specific to lzma-native at all --
  // it reproduces via the pure-JS path too, inside a genuinely compiled,
  // postject-injected SEA binary specifically. The gate above is still a
  // real, worthwhile fix (it removes native-binding resolution as a
  // contributing/confounding variable, and lzma-native's own resolution
  // mechanism is now provably correct per the first test in this file),
  // but it does NOT make a real packaged SEA install's worker-pool decode
  // path safe -- that remains an open, and now BROADER, risk than
  // originally scoped. See
  // `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md`'s own
  // "CRITICAL CORRECTION" entry for the full record.
  //
  // UN-SKIPPED 2026-09-12 (todo `2026-09-12-lzma-sea-real-sized-decode-
  // test-skip-may-now-pass`). Everything above is the historical record of
  // when this test was RED; it no longer describes current behaviour, and
  // is kept because the arc matters. What changed in the measurement:
  //
  //   - 20/20 direct runs of the real compiled binary
  //     (`GAMELIB_SIDECAR_SELFTEST=decompress-pool`, fake HOME) reported
  //     `SELFTEST decode=ok bytes=65536 match=true` at exactly this test's
  //     asserted conditions (`inlineFallback:false, nativeWorkers:0`).
  //   - A prior /gsd-debug session (2026-08-18) had already failed to
  //     reproduce the hang 40/40, including ~4.6x CPU oversubscription.
  //
  // WHAT IS **NOT** CLAIMED: that anyone knows what fixed it. The original
  // hang was real and specifically instrumented -- this is "trigger
  // condition still unidentified", NOT "the bug never existed". Candidate
  // commits landing after the 2026-08-18 closure are `f3f63fd72`
  // (2026-08-22, Stored PK chunk truncation) and the SEA bundling changes
  // `af0602e9b` / `7ed470b19` (2026-08-29) -- the latter plausible for a
  // worker that never entered `handleDecodeMessage()`. **Attribution was
  // not established**; proving it needs a bisect with a real SEA rebuild
  // per step. Do not credit any of them in a future comment without doing
  // that work.
  //
  // IF THIS GOES RED AGAIN, IT IS NOT A FLAKE TO RETRY. It is the fresh
  // recurrence the 2026-08-18 closure explicitly asked for and could not
  // manufacture. Capture diagnostics at that moment -- that run is the
  // only thing that can identify the trigger. Note the prior session
  // already exhausted the CPU-load axis; try memory/IO contention or
  // whatever environmental signal is present instead. A skipped test could
  // never deliver that signal, which is the main reason this one is back
  // on.
  //
  // 2026-10-11: this test asserts NO codec -- it is the codec-agnostic
  // recurrence detector for the 2026-08-18 hang, whichever decoder engages.
  // With native ON this binary no longer exercises pure-JS. There is
  // deliberately no env override, so the real-SEA pure-JS path is now
  // covered only at unit level (`decompressPool.test.ts`'s off-path tests
  // and the import-failure fallback tests).
  test('the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk (codec-agnostic recurrence detector for the 2026-08-18 hang)', async () => {
    const result = await spawnCapture(
      binaryPath,
      [],
      profile.childEnv({
        ...process.env,
        GAMELIB_SIDECAR_SELFTEST: 'decompress-pool'
      })
    )

    const decodeLine = result.stdout
      .split('\n')
      .find((line) => line.startsWith('SELFTEST decode='))

    expect(decodeLine).toBeDefined()
    expect(decodeLine).toContain('decode=ok')
    expect(decodeLine).toContain('match=true')
    expect(result.code).toBe(0)
  }, 30000)

  // Phase 23.1 plan 05, THIRD finding (2026-08-18, same session): fixing the
  // identity-guard defect above (test passes -- native resolution and the
  // pool's own eager smoke-test decode both genuinely work) uncovered a
  // DEEPER, SEPARATE, previously-masked defect: decoding a REAL-SIZED
  // payload (this self-test's own synthetic 64KB VZ chunk, not the tiny
  // hardcoded smoke-test fixture) via the native path TIMES OUT
  // (DecompressPool's own 15s per-task watchdog fires;
  // `decompress_pool_timeout`) when running inside a GENUINELY COMPILED,
  // postject-injected SEA binary specifically.
  //
  // Extensively isolated, NOT reproduced, in every combination short of the
  // real compiled SEA binary itself (all via scratch reproductions during
  // this same session, not committed):
  //   - lzma-native's createStream API round-tripping 64KB inside a plain
  //     worker_threads.Worker (require('lzma-native') normally): FINE.
  //   - The exact SEA-branch mechanism (copy the real .node bytes to a
  //     fresh temp path, process.dlopen() the COPY, delete the temp file)
  //     inside a worker_threads.Worker, sequential smoke+real decode: FINE.
  //   - The same, with TWO CONCURRENT workers each independently
  //     copying+dlopen-ing their own temp copy: FINE.
  //   - The same, spawned via `new Worker(source, { eval: true })` (the
  //     exact mechanism a SEA binary's own worker uses, no backing file):
  //     FINE.
  //   - The REAL `DecompressPool` class (real message dispatch, real
  //     15s task-timeout tracking, real ArrayBuffer transfer) against the
  //     REAL compiled DEV worker bundle (file-based, native decode via
  //     direct dlopen from node_modules): FINE, 321ms.
  //   - The REAL `DecompressPool` class via its own real eval-worker
  //     SEA-style spawn path (`resolveWorkerSpec()`, `node:sea` mocked
  //     `isSea()=>true` on the MAIN thread only -- the spawned worker
  //     itself still resolves the REAL, unmocked `node:sea`, so this did
  //     NOT actually exercise the SEA branch's getRawAsset()+temp-file
  //     dlopen inside the worker, only the eval-spawn mechanism): FINE.
  //   - Disabling the SEA branch's post-dlopen `rmSync(addonPath)` cleanup
  //     entirely (ruling out "unlinking the backing file races an async
  //     libuv-threadpool decode operation"): STILL HANGS.
  //   - Diagnostic instrumentation directly inside the real hung SEA
  //     process showed `handleDecodeMessage()` (the worker's own message
  //     handler) is NEVER ENTERED for the real 64KB decode request at all
  //     -- only repeated re-invocations of the SAME small smoke-test decode
  //     appear in the log, one per worker DecompressPool silently
  //     replace()s after each stalled attempt's own timeout. This places
  //     the hang BEFORE decodeChunk()/the native adapter ever runs for the
  //     real payload -- somewhere in the real request's dispatch/delivery
  //     to the worker, not in LZMA decode logic itself -- but the exact
  //     mechanism remains unidentified: every attempt to isolate it outside
  //     a genuinely compiled, postject-injected SEA binary process
  //     succeeded instead of reproducing it.
  //
  // (The three paragraphs above and the isolation list are the HISTORICAL
  // record of the investigation, kept because the arc matters. Everything
  // below describes the current state.)
  //
  // Full investigation narrative, current status, and the turn-off steps:
  // `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md`
  // and lzmaLoader.ts's `NATIVE_LZMA_DECODE_ENABLED` doc comment. That file
  // is linked from both -- the two must be updated together if either
  // changes.
  //
  // UN-SKIPPED 2026-10-11. This test used to be `test.skip` for two reasons
  // (a standing operator decision keeping the switch false, and the
  // liblzma 5.2.3 known-size+EOS alone-stream defect fixed in `b79765af2`
  // but never exercised inside a real compiled SEA binary). Both are gone:
  // the operator revised the decision on 2026-10-11 ("re-enable it, I'll do
  // the Mac install after"), so native is the shipped default and no local
  // flip is needed to run this; and `b79765af2`'s fix is now in the
  // shipping path. The 2026-10-08 darwin-arm64 run (quick 261008-jvw)
  // passed this exact case 20/20 at `nativeWorkers:2`.
  //
  // Distinct from the codec-agnostic test above: it also parses the
  // `SELFTEST pool=` line and requires native engaged on EVERY worker in the
  // SAME run as the real-sized decode, so a silent pure-JS fallback cannot
  // pass it.
  //
  // IF THIS GOES RED, IT IS NOT A FLAKE TO RETRY. A `decode=fail` /
  // `decompress_pool_timeout` is the fresh recurrence of the 2026-08-18
  // hang; capture diagnostics at that moment (full system state), then
  // follow the turn-off steps. `nativeWorkers` below `size` with a passing
  // decode is a native LOAD fallback, a different defect.
  test('the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk via the NATIVE path, with native engaged on every worker', async () => {
    const result = await spawnCapture(
      binaryPath,
      [],
      profile.childEnv({
        ...process.env,
        GAMELIB_SIDECAR_SELFTEST: 'decompress-pool'
      })
    )

    const poolLine = result.stdout
      .split('\n')
      .find((line) => line.startsWith('SELFTEST pool='))
    const decodeLine = result.stdout
      .split('\n')
      .find((line) => line.startsWith('SELFTEST decode='))

    expect(poolLine).toBeDefined()
    const stats = JSON.parse(poolLine!.slice('SELFTEST pool='.length)) as {
      size: number
      inlineFallback: boolean
      nativeWorkers: number
    }
    expect(stats.size).toBeGreaterThan(0)
    expect(stats.nativeWorkers).toBe(stats.size)
    expect(decodeLine).toBeDefined()
    expect(decodeLine).toContain('decode=ok')
    expect(decodeLine).toContain('match=true')
    expect(result.code).toBe(0)
  }, 30000)
})
