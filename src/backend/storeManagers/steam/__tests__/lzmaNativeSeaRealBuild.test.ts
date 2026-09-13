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
// `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`.
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

    // quick-260913-arr: was a hand-rolled `mkdtempSync` + a four-variable env
    // block, which was measurably LEAKIER than the jest containment one
    // directory away (it left APPDATA, XDG_CONFIG_HOME, XDG_DATA_HOME and
    // XDG_CACHE_HOME pointing at the operator's real profile). The helper owns
    // all eight, the 0700 root, and disposal. See CLAUDE.md's two-profile rule.
    profile = createFakeHomeProfile({
      prefix: 'gamelib-lzmaNativeSeaRealBuild-home-'
    })
  }, 180000)

  afterAll(() => {
    profile?.dispose()
  })

  // quick-260912-e6k: reap any child this suite's own spawnCapture() left live (a
  // hung/timed-out test, or a test that threw before its spawn settled). See the
  // liveChildren/reapLiveChildren doc comment above for what this does and does not cover.
  afterAll(reapLiveChildren)

  // Phase 23.1 plan 05, THIRD finding's own follow-up (coordinator/human-
  // operator directed, 2026-08-18, same session): native decode is now
  // gated OFF by default (NATIVE_LZMA_DECODE_ENABLED, lzmaLoader.ts) --
  // see `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md` for
  // why, and this file's own second test below (skipped when this comment
  // was written; un-skipped and green since 2026-09-12) for the
  // original finding this test used to assert against directly. With the
  // gate in place, a real compiled SEA binary's pool must still spawn
  // cleanly (the FIRST round's fix, unaffected by this gate) but must now
  // report `nativeWorkers:0` -- proving the kill switch is honored
  // end-to-end inside a genuinely compiled binary, not just in a jest mock.
  test("the REAL compiled SEA binary's worker pool spawns cleanly, with native decode correctly gated OFF (inlineFallback=false, nativeWorkers=0)", async () => {
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
    // Before this gate landed, a fixed pool + fixed identity guard
    // reported nativeWorkers=size (see this test's own prior assertion,
    // git history) -- genuinely true, but native then hung on a
    // real-sized decode (the still-open finding the gate exists for).
    expect(poolLine).toBeDefined()
    const stats = JSON.parse(poolLine!.slice('SELFTEST pool='.length)) as {
      size: number
      inlineFallback: boolean
      nativeWorkers: number
    }
    expect(stats.inlineFallback).toBe(false)
    expect(stats.nativeWorkers).toBe(0)
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
  // `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`'s own
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
  test('the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk via the gated (pure-JS) path', async () => {
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
  // Left as `test.skip`, NOT deleted and NOT weakened to pass: per this
  // debug arc's own standing lesson (a green suite is not evidence), this
  // assertion set is the correct, still-true target -- it is the exact
  // shape the coordinator asked this suite to prove. Skipping (rather than
  // continuing to iterate blind against a ~15-20s-per-attempt real SEA
  // rebuild cycle, or shipping an unverified guess-fix) is the honest
  // record of where this investigation currently stands. Un-skip once a
  // fix for THIS defect lands and is verified the same way (real compiled
  // SEA binary, real self-test, real green run) -- not before.
  //
  // Full investigation narrative (this comment's own content, preserved),
  // current status, and the criteria for safely re-enabling native decode
  // (which this test's own pass is part of):
  // `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`. That file
  // is also linked directly from lzmaLoader.ts's own
  // `NATIVE_LZMA_DECODE_ENABLED` kill-switch doc comment -- the two must be
  // updated together if either changes.
  //
  // Requires native decode to be forced back on to even attempt
  // reproducing the original finding (the gate above now makes the pool's
  // OWN nativeWorkers read 0 unconditionally) -- there is deliberately no
  // env-var override for the shipping kill switch (see lzmaLoader.ts's own
  // doc comment for why), so exercising this specific case again requires
  // a temporary, local, uncommitted flip of NATIVE_LZMA_DECODE_ENABLED to
  // `true` before rebuilding, same as any other investigation step
  // described in the debug file.
  // STAYS SKIPPED 2026-09-12, and NOT for the reason above. Its sibling
  // (the pure-JS case) was un-skipped on the same day after 20/20 green,
  // so "KNOWN FAILING" is no longer why this one is off. Two independent
  // reasons hold it:
  //
  //   1. Running it at all requires a local, uncommitted flip of
  //      `NATIVE_LZMA_DECODE_ENABLED` to `true`. That flip is under a
  //      STANDING OPERATOR DECISION (2026-08-18, coordinator-directed):
  //      the kill switch stays false and is not to be flipped without a
  //      fresh recurrence and fresh diagnostics. A test cannot un-make
  //      that decision, so this is not a measurement question.
  //   2. The native path carries its own SEPARATE, later-diagnosed defect:
  //      lzma-native@8.0.6 bundles liblzma 5.2.3, whose
  //      `lzma_alone_decoder` rejects the known-size+EOS alone stream that
  //      is the ONLY shape this codebase produces. Fixed in `b79765af2`
  //      inside `createNativeAdapter()` -- but that fix has never been
  //      exercised end-to-end inside a real compiled SEA binary, because
  //      the kill switch has masked this path throughout.
  //
  // So the honest status is "gated off by decision, and unverified behind
  // the gate", not "known failing". Re-enabling native decode needs both:
  // the operator's call on the kill switch, AND a real green run of this
  // test against a build that includes `b79765af2`.
  test.skip('the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk via the NATIVE path once the kill switch is (locally, temporarily) forced back on -- SKIPPED BY OPERATOR DECISION on NATIVE_LZMA_DECODE_ENABLED, not by known failure; see comment above', async () => {
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
})
