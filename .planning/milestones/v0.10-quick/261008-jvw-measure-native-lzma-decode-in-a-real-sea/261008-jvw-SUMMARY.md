---
phase: quick-261008-jvw
plan: 01
subsystem: steam-depot-decode
tags: [lzma, sea, native-addon, measurement, kill-switch]
requires: []
provides:
  - dlopen-failure cleanup of the SEA temp .node
  - first end-to-end measurement of native decode (with b79765af2) in a real SEA binary
affects:
  - src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
tech-stack:
  added: []
  patterns: [try/finally cleanup around process.dlopen, bounded fake-HOME spawn driver]
key-files:
  created:
    - .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts
    - .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/
    - .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md
  modified:
    - src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
    - src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
    - src/backend/storeManagers/steam/depot/lzmaLoader.ts
    - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
    - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
    - .planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md
decisions:
  - "Kill switch stays false and the native test stays test.skip; the decision is handed to the operator via a successor pending todo"
metrics:
  completed: 2026-10-08
status: complete
actuals:
  tokens: 30000
  tasks: 3
  commits: 3
plan_head_before: 39ae250e60f94513ce899258096b6d61e7b1afe4
plan_head_after: da3f28944a57e2533ae78009d190eea276a0020c
---

# Phase quick-261008-jvw Plan 01: Measure native LZMA decode in a real SEA binary Summary

Native lzma decode, including `b79765af2`'s known-size header rewrite, decodes a real VZ/AES/SHA-1 chunk 20/20 times inside a real cold-built SEA binary on darwin-arm64; the dormant path also no longer leaks its temp `.node` when `dlopen` throws. The shipped kill switch is untouched.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 | `8cde665b6` | `finally` cleanup around `process.dlopen`, 3 tests, 8 stale debug-doc refs repointed |
| 2 | `33ca33ef4` | driver + 30 capture files, task dir only, no source change |
| 3 | `da3f28944` | Resolution section, successor todo, original moved to `completed/` |

## Task 1 RED output (before the fix, unmodified source)

```
    ✕ removes the temp .node and rethrows the ORIGINAL error when process.dlopen throws (5 ms)
    ✕ never lets a cleanup failure mask the dlopen error (1 ms)
    ✓ on success removes the temp .node exactly once, AFTER process.dlopen
  ● ... › removes the temp .node and rethrows the ORIGINAL error when process.dlopen throws
    expect(jest.fn()).toHaveBeenCalledTimes(expected)
    Expected number of calls: 1
    Received number of calls: 0
  ● ... › never lets a cleanup failure mask the dlopen error
    Expected number of calls: 1
    Received number of calls: 0
Tests:       2 failed, 10 passed, 12 total
```

After the fix: 4 suites, 128 tests, all pass. Zero `src/` references to the pre-move path, exactly 8 to the resolved path. `pnpm codecheck`, eslint and scoped `prettier --check` green on the five files.

## Measurement

Environment: HEAD `8cde665b6`, cold build (the six SEA outputs deleted, `build/` otherwise intact), fake HOME per run, `NATIVE_LZMA_DECODE_ENABLED` locally forced `true` for the native arm only. Pressure level 2, swap 23936.81 MB of 24576.00 MB used at the start.

Native direct runs, `--expect-native-workers 2`, 20 runs, `RESULT label=native pass=20/20`:

| run | wall ms | exit | nativeWorkers | inlineFallback | decode line |
| --- | ------- | ---- | ------------- | -------------- | ----------- |
| 1 | 3264 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 2 | 1368 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 3 | 1331 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 4 | 1332 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 5 | 1388 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 6 | 1395 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 7 | 1362 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 8 | 1340 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 9 | 1350 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 10 | 1358 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 11 | 1519 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 12 | 1383 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 13 | 1368 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 14 | 1345 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 15 | 1352 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 16 | 1356 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 17 | 1351 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 18 | 1314 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 19 | 1309 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |
| 20 | 1328 | 0 | 2 | false | SELFTEST decode=ok bytes=65536 match=true |

The loader's own once-per-process line (`lzmaLoader: native lzma-native decoder engaged ...`) is present in the run logs, so native engagement is proven by the loader and not only by `nativeWorkers`. No run stalled; the 8 s stall sampler never fired, so there are no `sample` outputs.

Jest (`npx jest --testPathPattern lzmaNativeSeaRealBuild`, native test un-skipped, one real SEA rebuild): `Tests: 1 failed, 2 passed, 3 total`. The native test PASSED (1318 ms). The pure-JS-named test passed. Test 1 failed on `expect(stats.nativeWorkers).toBe(0)` receiving 2, the expected positive control that the flip reached the jest-built binary.

Control (reverted, cold rebuild, `--expect-native-workers 0`, 3 runs): `RESULT label=control pass=3/3`, walls 3298 / 1173 / 1016 ms, all `nativeWorkers:0`, `decode=ok`.

## Verdict

**`b79765af2` works end-to-end in a real compiled SEA binary: YES**, for the self-test's 64 KiB VZ chunk, on darwin-arm64, on one machine.

## Operator recommendation (verbatim from the todo)

RE-ENABLE through a dedicated follow-up, contingent on the operator explicitly REVISING the 2026-08-18 standing decision. Its literal precondition (a fresh recurrence) has not happened and cannot be manufactured. Weighed: the ~5.8-6.6x real-chunk speedup (23.1-01-SUMMARY, subject to the tension above), decode being the binding install constraint (23.1-04-PLAN: network flat at ~150-280 ms/chunk, pure-JS decode ~5-7 MB/s per thread), the tally above, and today's 20/20 plus passing native jest test. Walking the `lzmaLoader.ts` "HOW TO SAFELY RE-ENABLE" checklist:

1. Criterion 1 (hang understood and fixed): the debug doc is `status: resolved` but `resolution_type: closed_unreproduced` with root cause UNKNOWN. Met by its letter, not by its "understood root cause" clause. The operator's call.
2. Criterion 2 (fresh real-build native evidence): met by today's run, 20/20 direct at `nativeWorkers:2` plus the native jest test passing.
3. Criterion 3: NOT met. The native test passed locally today but stays skipped. Flipping the constant must also change test 1's `nativeWorkers` assertion from 0 to the pool size in the same commit (measured today: it fails otherwise). A live Steam depot install end-to-end on the operator's Mac is still required; use it to re-measure native vs pure-JS decode throughput, which settles the speedup tension.

If the operator will not revise the decision this milestone, deleting the native path beats keeping dormant code (this todo's original concern). Deletion touches at minimum: `lzmaNativeBinding.ts`, the native adapter and kill switch in `lzmaLoader.ts`, the node-gyp-build alias and SEA asset embedding in `meta/buildSidecarSea.ts` / `meta/esbuildWorkerBundleShared.ts`, the `lzma-native` dependency, and their tests.

## Not claimed

- Synthetic 64 KiB filler through the real VZ/AES/SHA-1 pool path, not real Steam depot bytes.
- darwin-arm64 only; linux-x64 and win32-x64 native loading was never verified.
- One machine. A non-recurrence is not a root cause for the 2026-08-18 hang.
- The ~5.8-6.6x speedup was not re-measured. Open, unresolved tension: spike 023 decoded a known-size alone header byte-identically on lzma-native 8.0.6, while `b79765af2` says liblzma 5.2.3 rejects that shape.

## Process check at STEP 0

`ps -axo pid,command | grep -E '[g]amelib-sidecar|[t]auri dev'` found nothing running before the cold build. Nothing was killed.

## Deviations from Plan

**1. [Rule 3 - Blocking] First cold-build attempt chained `ls -a` after the delete.** `ls -a` was passed as an argument list that errored (`ls: -a: No such file or directory`), which short-circuited the `&&` chain before `pnpm build:sidecar-sea` ran, leaving the SEA outputs deleted and the capture file never created. Nothing had been measured. Re-ran the build alone against the same state (flip still in place, outputs already deleted), so the build is still cold. No source or measurement effect.

**2. Prose re-wrap beyond the plan's wording.** The `lzmaLoader.ts` runtime `logWarning` array was re-broken by hand (path kept as ONE contiguous element, so `decompressPool.test.ts`'s basename regex still matches); the plan allowed this.

Otherwise the plan was executed as written. The only deletion in the final commit is the intentional `git mv` of the original todo out of `pending/`.

## Known Stubs

None.

## Threat Flags

None. No new network, auth, file-access or schema surface; the `finally` change only reduces temp-file exposure.

## Verification

- `git diff --exit-code -- src` exits 0 at the end; HEAD ships `const NATIVE_LZMA_DECODE_ENABLED = false` and the native test as `test.skip(` (checked with `git show HEAD:`).
- The binary now in `src-tauri/binaries/` is the shipped-state control build (`nativeWorkers:0`, 3/3).
- Leak-scan grep over `measurement/` found nothing; `pnpm planning-gates` 12/12 green.
- Prettier is vacuous for every `.planning/` path written (probed with `--file-info`, all `"ignored": true`); `--check` was run over the five `src/` files and is green.

## Self-Check: PASSED

Commits `8cde665b6`, `33ca33ef4`, `da3f28944` exist; `measure-selftest.ts`, `measurement/native-driver.txt`, `measurement/control-driver.txt`, `measurement/jest-native.txt`, the successor todo and the moved completed todo are on disk.
