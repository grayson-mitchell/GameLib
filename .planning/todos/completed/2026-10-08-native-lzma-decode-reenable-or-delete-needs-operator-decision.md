---
created: 2026-10-08T00:00:00.000Z
title: "Native LZMA decode works in a real SEA binary but ships switched off — operator decides: re-enable (revise the 2026-08-18 decision) or delete the dormant path"
area: steam
severity: medium
platform: any
ready: human
found_by: "quick-261008-jvw, measuring the native path for the first time since the kill switch (successor of 2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo)"
files:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts:97
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
  - .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md
---

## Decision needed

`NATIVE_LZMA_DECODE_ENABLED` is `false` under a standing operator decision (2026-08-18: no flip
without a fresh recurrence and fresh diagnostics). That precondition cannot be manufactured, so the
only ways forward are an explicit operator REVISION of that decision (re-enable), or deleting the
dormant native path. Nothing else will change the state, and dormant code rots.

## Evidence (quick 261008-jvw, 2026-10-08)

On a cold-built SEA binary with the switch locally forced on: 20/20 direct self-test runs at
`nativeWorkers:2`, `decode=ok match=true`, plus the native jest test passing. The full table, the
limits (synthetic 64 KiB chunk, darwin-arm64 only, one machine, speedup not re-measured) and the
spike-023 vs `b79765af2` tension are in the `## Resolution (2026-10-08)` section of
`.planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md`.
Raw captures: `.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/`.

## Recommendation

Re-enable via a dedicated follow-up, contingent on the operator revising the 2026-08-18 decision:
criterion 1 (root cause) is met only by its letter, criterion 2 is met by today's run, and
criterion 3 is NOT met (flip the constant AND change test 1's `nativeWorkers` assertion from 0 to
the pool size in the same commit, then run a live Steam depot install on the Mac and re-measure
native vs pure-JS throughput). If the operator will not revise the decision this milestone, delete
the native path instead: `lzmaNativeBinding.ts`, the native adapter and kill switch in
`lzmaLoader.ts`, the node-gyp-build alias and SEA asset embedding in `meta/buildSidecarSea.ts` /
`meta/esbuildWorkerBundleShared.ts`, the `lzma-native` dependency, and their tests.

## Resolution (2026-10-11)

Quick task `261011-mza`. The operator decided: Grayson Mitchell, 2026-10-11, explicitly REVISING
the 2026-08-18 standing decision and choosing re-enable over delete:
"re-enable it, I'll do the Mac install after". No native-path code was deleted.

### What changed (commit `7255c2507`)

| file | change |
| --- | --- |
| `src/backend/storeManagers/steam/depot/lzmaLoader.ts` | `NATIVE_LZMA_DECODE_ENABLED = true`; doc comment rewritten (status, history, evidence, win32 caveat, owed items, turn-off steps); off-path `logWarning` now names the switch, says it is the operator's off switch and no longer claims native hangs; engaged `logInfo` qualifies the speedup as the 23.1-01 darwin-arm64 figure, not yet re-measured; constant, `let` override and `setNativeLzmaDecodeEnabledForTests` retained |
| `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` | switch describe pins native-by-default, tests the off path through the override; RED first (exactly 2 failures against the unflipped constant), GREEN after (4 suites, 60 tests) |
| `src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts` | test 1 asserts `nativeWorkers === size`; the native test is un-skipped and also asserts native engaged on every worker in the same run as `decode=ok match=true` |

### The three criteria, walked again

1. Root cause understood and fixed: waived by the operator. The debug doc is still
   `closed_unreproduced`; the 2026-08-18 hang's cause is UNKNOWN.
2. Fresh real-build native evidence: darwin-arm64 2026-10-08 (20/20, see the 2026-10-05 todo's
   Resolution), plus today's win32-x64 measurement below, which did NOT engage native.
3. Flip + test 1 + native test in one commit: done (`7255c2507`). The live Steam depot install on
   the Mac and the native-vs-pure-JS throughput re-measurement remain OPEN, tracked by
   `2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure`.

### win32-x64 measurement (first ever; 23.1-01 Assumption A2)

Cold-built SEA binary from committed HEAD `7255c2507` (the six `build:sidecar-sea` outputs deleted
first), Windows 11, win32-x64, Node v24.19.0, fresh `createFakeHomeProfile()` per run. Captures and
driver in `.planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/` (measurement
commit `f95562c66`). The static prediction (win32-x64 prebuild imports a separate `liblzma.dll`
the SEA does not embed) HELD: native did not engage.

| arm | runs | result |
| --- | --- | --- |
| Native expectation (`--expect-native-workers 2`) | stopped at run 1 (first failure, not retried) | `pass=0/20`: `nativeWorkers:0`, `inlineFallback:false`, `SELFTEST decode=ok bytes=65536 match=true`, exit 0, 2753 ms. Not a hang: a native LOAD fallback |
| Fallback (`--expect-native-workers 0`), same binary, no rebuild | 20 | `pass=20/20`: `nativeWorkers:0`, `decode=ok match=true`, exit 0, 2277-2357 ms, no stall |

| count | value |
| --- | --- |
| Runs whose log carries `native lzma-native decoder engaged` | 0 of 21 |
| Runs whose log carries the import-failure warning `failed to load or smoke-test-decode` | 21 of 21 (2 per run, one per worker) |
| `Cause:` text, verbatim | `The specified module could not be found.` (followed by the temp addon path `gamelib-lzma-native-<pid>-<hex>.node` in `os.tmpdir()`) |
| Temp addons left in `os.tmpdir()` (`gamelib-lzma-native-*.node`) | 0 before, 0 after every run (the failure path's `finally` removes the copy) |

Net effect on Windows: installs run on pure-JS inside a native-ON build, as before the flip, with
no hang. Filed as `2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded`.

### Non-recurrence tally

| date | runs | codec exercised | `b79765af2` in the build |
| --- | --- | --- | --- |
| 2026-08-18 | 40 (incl. ~4.6x CPU oversubscription) | both | no |
| 2026-09-12 | 20 direct + 5 jest | pure-JS only | not exercised |
| 2026-10-08 | 20 direct + 1 jest (native), 3 direct (control) | native (20 + 1); pure-JS (3) | yes, native exercised |
| 2026-10-11 win32-x64 | 1 native-expected (load fallback) + 20 fallback | pure-JS only (native never loaded) | yes, but native not exercised |

No hang or `decompress_pool_timeout` in any win32 run.

### linux-x64

Not measured locally. CI's next `pnpm test:ci` on ubuntu-latest is the first real-SEA run there with
native ON, and it is unobserved by this task. It is listed in the Mac follow-up todo.

### What is NOT claimed

- The 2026-08-18 root cause. It is still unknown.
- Real Steam depot bytes. The self-test decodes a synthetic 64 KiB chunk only.
- Speed. The spike-023 vs `b79765af2` tension is still open.
- The jest SEA suite on win32. It cannot run here: `npx jest --runInBand --testPathPattern
  lzmaNativeSeaRealBuild` fails in 0.85 s with "Test suite failed to run / TypeError: Converting
  circular structure to JSON" (jest-worker cannot serialize the `execFileSync('pnpm')` ENOENT, pnpm
  being a `.CMD` shim). No build ran. Output in `measurement/jest-win32.txt`.
- The real-SEA pure-JS path. The suite no longer exercises it (native is on, and there is no env
  override); only the fallback arm above did, by accident of the win32 load failure.
- The off arm (`NATIVE_LZMA_DECODE_ENABLED = false`) in a real SEA build; not re-exercised this
  task.
