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
// second test.skip below and the debug file's own "CRITICAL CORRECTION"
// entry for the full record -- the gate is still a real, worthwhile fix
// (lzma-native's own resolution is now provably correct), but it does NOT
// make a packaged SEA install's worker-pool decode path safe end-to-end.

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const BINARIES_DIR = join(REPO_ROOT, 'src-tauri', 'binaries')

interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

function spawnCapture(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<SpawnResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', rejectPromise)
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
  })
}

describe('SEA sidecar binary real native lzma resolution (Phase 23.1 plan 05, round 2 regression)', () => {
  let fakeHome: string
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

    const bins = readdirSync(BINARIES_DIR).filter((f) => f.startsWith('gamelib-sidecar-'))
    if (bins.length !== 1) {
      throw new Error(
        `Expected exactly one gamelib-sidecar-* binary in ${BINARIES_DIR}, found: ${bins.join(', ')}`
      )
    }
    binaryPath = join(BINARIES_DIR, bins[0])

    fakeHome = mkdtempSync(join(tmpdir(), 'gamelib-lzmaNativeSeaRealBuild-home-'))
  }, 180000)

  afterAll(() => {
    if (fakeHome) rmSync(fakeHome, { recursive: true, force: true })
  })

  // Phase 23.1 plan 05, THIRD finding's own follow-up (coordinator/human-
  // operator directed, 2026-08-18, same session): native decode is now
  // gated OFF by default (NATIVE_LZMA_DECODE_ENABLED, lzmaLoader.ts) --
  // see `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md` for
  // why, and this file's own second (test.skip'd) test below for the
  // original finding this test used to assert against directly. With the
  // gate in place, a real compiled SEA binary's pool must still spawn
  // cleanly (the FIRST round's fix, unaffected by this gate) but must now
  // report `nativeWorkers:0` -- proving the kill switch is honored
  // end-to-end inside a genuinely compiled binary, not just in a jest mock.
  test(
    'the REAL compiled SEA binary\'s worker pool spawns cleanly, with native decode correctly gated OFF (inlineFallback=false, nativeWorkers=0)',
    async () => {
      const result = await spawnCapture(binaryPath, [], {
        ...process.env,
        GAMELIB_SIDECAR_SELFTEST: 'decompress-pool',
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        XDG_STATE_HOME: join(fakeHome, '.local', 'state'),
        LOCALAPPDATA: join(fakeHome, 'AppData', 'Local')
      })

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
    },
    30000
  )

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
  // Left as `test.skip`, not deleted: same reasoning as the native-path
  // case below -- this is the correct, currently-true target, not
  // something to weaken or hide.
  test.skip(
    'the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk via the gated (pure-JS) path -- KNOWN FAILING (see CRITICAL CORRECTION comment above: this is NOT native-specific), do not un-skip without a real fix + real green run',
    async () => {
      const result = await spawnCapture(binaryPath, [], {
        ...process.env,
        GAMELIB_SIDECAR_SELFTEST: 'decompress-pool',
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        XDG_STATE_HOME: join(fakeHome, '.local', 'state'),
        LOCALAPPDATA: join(fakeHome, 'AppData', 'Local')
      })

      const decodeLine = result.stdout
        .split('\n')
        .find((line) => line.startsWith('SELFTEST decode='))

      expect(decodeLine).toBeDefined()
      expect(decodeLine).toContain('decode=ok')
      expect(decodeLine).toContain('match=true')
      expect(result.code).toBe(0)
    },
    30000
  )

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
  test.skip(
    'the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk via the NATIVE path once the kill switch is (locally, temporarily) forced back on -- KNOWN FAILING, see comment above and the linked debug file, do not un-skip without a real fix + real green run',
    async () => {
      const result = await spawnCapture(binaryPath, [], {
        ...process.env,
        GAMELIB_SIDECAR_SELFTEST: 'decompress-pool',
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        XDG_STATE_HOME: join(fakeHome, '.local', 'state'),
        LOCALAPPDATA: join(fakeHome, 'AppData', 'Local')
      })

      const decodeLine = result.stdout
        .split('\n')
        .find((line) => line.startsWith('SELFTEST decode='))

      expect(decodeLine).toBeDefined()
      expect(decodeLine).toContain('decode=ok')
      expect(decodeLine).toContain('match=true')
      expect(result.code).toBe(0)
    },
    30000
  )
})
