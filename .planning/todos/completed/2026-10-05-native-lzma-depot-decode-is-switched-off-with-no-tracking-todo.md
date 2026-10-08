---
created: 2026-10-05T00:00:00.000Z
title: "Phase 23.1 native LZMA decode is disabled by a hardcoded kill switch — the speedup does not ship and only a debug doc records it"
area: steam
severity: medium
platform: any
ready: live-gate
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 23.1"
files:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts:97
  - .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md
---

## Problem

`NATIVE_LZMA_DECODE_ENABLED = false` (`lzmaLoader.ts:97`) turns native decode off because real-sized
chunks hang; the native-path test is `test.skip`. Phase 23.1's speedup therefore does not ship. This
was recorded only in `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`, with no pending todo,
so nothing tracks re-enabling it. The native adapter and `lzmaNativeBinding` are dormant code.

Latent, in the dormant path: the temp `.node` file is not removed if `process.dlopen` throws.

## Failure scenario

No live failure (the JS path is used). The cost is a phase whose headline result is silently not
in the product, and dormant code that will rot.

## Suggested fix

Decide: root-cause the real-chunk hang and re-enable (needs a live run against real depots), or
delete the native path. If kept, clean up the temp `.node` file on `dlopen` failure.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

---

## Resolution (2026-10-08)

Quick task `261008-jvw`. The question the todo left open ("does the native path work at all
inside a real SEA binary") is now answered by measurement. The decision (re-enable or delete) is
NOT made here: it stays under the 2026-08-18 standing operator decision and moves to the
successor todo `2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision`.

### Measurement

All runs: macOS darwin-arm64, one machine, HEAD `8cde665b6` (includes `b79765af2`), SEA binary
cold-built (the six `build:sidecar-sea` outputs deleted first, `build/` otherwise untouched),
`NATIVE_LZMA_DECODE_ENABLED` flipped to `true` LOCALLY and UNCOMMITTED for the native arm only.
Every direct run used a fresh `createFakeHomeProfile()`. Captures live in
`.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/`.

| measurement | result |
| --- | --- |
| Native direct runs, `GAMELIB_SIDECAR_SELFTEST=decompress-pool`, fake HOME, **20 runs** | **20/20** `SELFTEST decode=ok bytes=65536 match=true`, `inlineFallback:false`, `nativeWorkers:2`, exit 0, wall 1309-3264 ms (run 1 cold at 3264 ms, the rest 1309-1519 ms) |
| Loader's own once-per-process line in each run's `gamelib.log` | `lzmaLoader: native lzma-native decoder engaged for Steam VZ depot chunk decode` (positive proof the loader engaged native, not merely that `nativeWorkers` was 2) |
| `npx jest --testPathPattern lzmaNativeSeaRealBuild`, native test un-skipped, one real SEA rebuild | `Tests: 1 failed, 2 passed, 3 total`. The native test **passed** (1318 ms); the pure-JS-named test passed (it asserts no codec); test 1 failed on `expect(stats.nativeWorkers).toBe(0)` receiving 2, which is the positive control that the flip reached the jest-built binary |
| Control: reverted to shipped state, cold rebuild, direct runs | **3/3** at `nativeWorkers:0`, `decode=ok`, wall 1016-3298 ms |
| System state at the start of the native arm | `kern.memorystatus_vm_pressure_level: 2`, swap 23936.81 MB used of 24576.00 MB (639.19 MB free) |

No run stalled (the 8 s stall sampler never fired), so no `sample` output or at-stall snapshots
exist. The Mac was under heavy swap pressure throughout, which is the axis the 2026-08-18 closure
named and never replicated; the runs did not hang under it.

**`b79765af2` works end-to-end in a real compiled SEA binary: YES** for the self-test's 64 KiB
VZ chunk on darwin-arm64. It rests on 20/20 direct runs plus one jest run, each with native
engaged on both workers (`nativeWorkers:2` and the loader's engaged line) and a byte-exact
decode (`match=true`) through the real VZ/AES/SHA-1 pool path.

### What is NOT claimed

- The self-test decodes a synthetic 64 KiB filler (`i % 251`) through the real VZ/AES/SHA-1 pool
  path, not real Steam depot bytes.
- darwin-arm64 only. linux-x64 and win32-x64 native loading was never verified (23.1-01
  Assumption A2).
- One machine, one build per arm (plus the jest rebuild).
- A non-recurrence is not a root cause. The 2026-08-18 hang was real and specifically
  instrumented; its trigger is still unidentified. This run does not say what fixed it, or that
  it is fixed.
- The ~5.8-6.6x speedup was not re-measured (see the open tension below).

### Non-recurrence tally, by configuration

| date | runs | codec exercised | `b79765af2` in the build |
| --- | --- | --- | --- |
| 2026-08-18 | 40 (incl. ~4.6x CPU oversubscription) | both | no (predates it) |
| 2026-09-12 | 20 direct + 5 jest | pure-JS only (`nativeWorkers:0`) | not exercised (native gated off) |
| 2026-10-08 | 20 direct + 1 jest (native), 3 direct (control) | native (20 + 1); pure-JS (3) | **yes, native exercised: only these** |

Only today's native arm exercised native decode with `b79765af2` in the build.

### Open tension (unresolved)

Spike 023 (`.planning/spikes/023-sea-native-addon-dlopen/sea-worker-entry.cjs`) decoded a
known-size alone header byte-identically on lzma-native 8.0.6 (`byteIdentical:true`, 5.76-6.64x
in its `run.log`), while `b79765af2`'s message says liblzma 5.2.3 rejects known-size +
end-of-stream-marker streams outright. Both cannot be fully true unless the spike fixture's
payload lacked an end marker (unverified). Consequence: the 5.8-6.6x figure has not been
measured through the post-`b79765af2` adapter, and today's run proves correctness, not speed.

### What this task fixed

- The latent temp-file leak: the SEA branch of `lzmaNativeBinding.ts` now removes the temp
  `.node` in a `finally` around `process.dlopen`, so a failed dlopen no longer strands an
  executable in `os.tmpdir()` (commit `8cde665b6`, 3 tests, 2 RED first).
- 8 stale references to the debug doc's pre-move path under `src/` (the todo named 2; there were
  8, including a runtime `logWarning` string) now point at
  `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md` (same commit).

### Operator recommendation

RE-ENABLE through a dedicated follow-up, contingent on the operator explicitly REVISING the
2026-08-18 standing decision. Its literal precondition (a fresh recurrence) has not happened and
cannot be manufactured. Weighed: the ~5.8-6.6x real-chunk speedup (23.1-01-SUMMARY, subject to the
tension above), decode being the binding install constraint (23.1-04-PLAN: network flat at
~150-280 ms/chunk, pure-JS decode ~5-7 MB/s per thread), the tally above, and today's 20/20 plus
passing native jest test. Walking the `lzmaLoader.ts` "HOW TO SAFELY RE-ENABLE" checklist:

1. Criterion 1 (hang understood and fixed): the debug doc is `status: resolved` but
   `resolution_type: closed_unreproduced` with root cause UNKNOWN. Met by its letter, not by its
   "understood root cause" clause. The operator's call.
2. Criterion 2 (fresh real-build native evidence): met by today's run, 20/20 direct at
   `nativeWorkers:2` plus the native jest test passing.
3. Criterion 3: NOT met. The native test passed locally today but stays skipped. Flipping the
   constant must also change test 1's `nativeWorkers` assertion from 0 to the pool size in the same
   commit (measured today: it fails otherwise). A live Steam depot install end-to-end on the
   operator's Mac is still required; use it to re-measure native vs pure-JS decode throughput,
   which settles the speedup tension.

If the operator will not revise the decision this milestone, deleting the native path beats
keeping dormant code (this todo's original concern). Deletion touches at minimum:
`lzmaNativeBinding.ts`, the native adapter and kill switch in `lzmaLoader.ts`, the node-gyp-build
alias and SEA asset embedding in `meta/buildSidecarSea.ts` / `meta/esbuildWorkerBundleShared.ts`,
the `lzma-native` dependency, and their tests.
