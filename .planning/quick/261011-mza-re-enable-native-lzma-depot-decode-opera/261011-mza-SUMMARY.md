---
phase: quick-261011-mza
plan: 01
subsystem: steam-depot-decode
tags: [lzma, native, sea, win32, measurement]
status: complete
requires: []
provides:
  - "NATIVE_LZMA_DECODE_ENABLED = true (native LZMA depot decode re-enabled by operator revision)"
  - "first win32-x64 real-SEA verification of the native path"
affects:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts
key-files:
  modified:
    - src/backend/storeManagers/steam/depot/lzmaLoader.ts
    - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
    - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
    - .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md
  created:
    - .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measure-selftest.ts
    - .planning/quick/261011-mza-re-enable-native-lzma-depot-decode-opera/measurement/
    - .planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md
    - .planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md
decisions:
  - "Operator revision 2026-10-11 of the 2026-08-18 decision: re-enable, not delete. Locked; the switch was not flipped back."
plan_head_before: 165103156ff26431dfac775ad83bdbc86740d0da
plan_head_after: 7fadb471fa0d73419190a9eef09fdd22e4aae595
commits: 3
actuals:
  tokens: 45000
  tasks: 3
  commits: 3
---

# Phase quick-261011-mza Plan 01: Re-enable native LZMA depot decode Summary

Native LZMA decode is ON in HEAD, but on win32-x64 it does not engage: the SEA binary falls back to pure-JS every time because the win32 prebuild imports a separate `liblzma.dll` that the SEA does not embed.

## win32-x64 result (first ever real-SEA verification, 23.1-01 Assumption A2)

Task 2 STEP 4 case (ii): a native LOAD fallback, not a hang and not a recurrence. The static `liblzma.dll` prediction HELD.

Binary: cold-built from committed HEAD `7255c2507` (all six `build:sidecar-sea` outputs removed first, all six present afterwards; `src/` clean, marker `src matches HEAD` in the driver txt). Windows 11, win32-x64, Node v24.19.0. Fresh `createFakeHomeProfile()` per run.

| arm | runs | result |
| --- | --- | --- |
| native expectation (`--expect-native-workers 2`) | stopped at run 1 (first failure, not retried) | `pass=0/20`: `nativeWorkers:0`, `inlineFallback:false`, `SELFTEST decode=ok bytes=65536 match=true`, exit 0, 2753 ms |
| fallback arm (`--expect-native-workers 0`), same binary | 20 | `pass=20/20`: `nativeWorkers:0`, `decode=ok match=true`, exit 0, 2277-2357 ms, no stall |

- Loader lines: `native lzma-native decoder engaged` in 0 of 21 run logs. The import-failure warning (`failed to load or smoke-test-decode`) in 21 of 21 (twice per run, one per worker).
- `Cause:` verbatim: `The specified module could not be found.` followed by the temp addon path `gamelib-lzma-native-<pid>-<hex>.node` in `os.tmpdir()`.
- Temp-addon count (`gamelib-lzma-native-*.node` in `os.tmpdir()`): 0 before, 0 after every run (the failure path's `finally` removes the copy). 0 deleted by this task.
- No hang, no `decompress_pool_timeout`, no stall in any win32 run.
- Net effect for Windows users: installs run on pure-JS inside a native-ON build, same as before the flip. Native speedup is not available on Windows until the `liblzma.dll` defect is fixed.
- The win32 defect is filed as `.planning/todos/pending/2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded.md` (`severity: major`, `platform: windows`, `ready: code`).

## Task 1: the flip

- RED (tests edited, constant still `false`): `Tests: 2 failed, 40 passed, 42 total` in `decompressPool.test.ts`. The two failures were exactly the default-is-native test and the reset-restores-default test.
- GREEN (after the flip): `steam/__tests__/(lzmaNativeBinding|decompressPool|decompressWorkerRealBuild|withTimeout)`: 4 suites, 60 tests, all pass.
- Windows regression net: `depot.test.ts` + `depotLinktarget.test.ts`: 15 failed, 199 passed (214), identical to the planning baseline (14 + 1). Zero failing titles mention lzma or decode.
- `pnpm codecheck`, `npx eslint` (3 files) and `npx prettier --check` (3 files, all `"ignored": false`) are green.
- `graphify update .` ran after the commit.
- `lzmaNativeSeaRealBuild.test.ts`: test 1 asserts `stats.size > 0` and `nativeWorkers === size`; test 2 renamed to the codec-agnostic recurrence detector; the native test is un-skipped and also parses `SELFTEST pool=` and asserts native on every worker. This suite cannot run on win32 (below); verified here by tsc, eslint and prettier only.

## jest SEA suite on win32

Cannot run, as predicted. `npx jest --runInBand --testPathPattern lzmaNativeSeaRealBuild` fails in 0.85 s with "Test suite failed to run / TypeError: Converting circular structure to JSON" (the `execFileSync('pnpm')` ENOENT, pnpm being a `.CMD` shim). No build ran. Output is in `measurement/jest-win32.txt`. The three tests in that file were therefore never executed anywhere by this task.

## linux-x64

Not measured locally. CI's next `pnpm test:ci` on ubuntu-latest is the first real-SEA native run there with native ON; this task cannot observe it. It is item 3 of the Mac follow-up todo.

## Commits

| task | hash | message |
| --- | --- | --- |
| 1 | `7255c2507` | feat(steam): re-enable native LZMA depot decode by operator revision (261011-mza) |
| 2 | `f95562c66` | test(quick-261011-mza): first win32-x64 real-SEA native lzma decode measurement |
| 3 | `7fadb471f` | docs(quick-261011-mza): close the native-lzma re-enable-or-delete todo and file the Mac live-install follow-up |

## Operator follow-ups owed

1. Live Steam depot install on the Mac with native ON (`gamelib.log` should show the engaged line once per process); native-vs-pure-JS throughput re-measure on the same depot, then correct the speedup clause in the engaged `logInfo`; read CI's first ubuntu-latest `lzmaNativeSeaRealBuild` result. Tracked in `.planning/todos/pending/2026-10-11-native-lzma-mac-live-steam-depot-install-and-throughput-remeasure.md` (`ready: human`).
2. Decide whether to schedule the win32 `liblzma.dll` fix (code-ready, major).

## Deviations from Plan

None in behaviour. Notes:

- **Commit trailer.** The plan text says `Claude Opus 5.5`, the orchestrator prompt says `Claude Fable 5.1`, and the session's commit-attribution reminder says `Claude Sonnet 5.5`. All three commits use the session reminder's `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Amend if the orchestrator wants a different trailer.
- `build/main/sidecar-sea-bundle.js` was present on disk (the plan said absent); it was deleted with the other five outputs and regenerated.
- The Task 3 STEP 3 conditional chose case (ii), so only the `liblzma.dll` todo was filed (no temp-addon todo; nothing leaked).
- The measured captures contain the operator's Windows username inside absolute paths (the binary path, the temp addon path). The credential leak scan (`refresh_token`, `userId`, etc.) was empty.

## Known Stubs

None.

## Threat Flags

None. The win32 fix surface (DLL planting via a shared temp dir) is recorded in the filed todo, not introduced.

## Self-Check: PASSED

Commits `7255c2507`, `f95562c66`, `7fadb471f` exist on `quick-261011-mza`'s branch `quick-261002-b63`; the driver, `measurement/` captures, the two new pending todos and the completed todo exist; `pnpm planning-gates` is 12/12; the three pre-existing unrelated paths (`.planning/state.json`, `.planning/debug/rust-test-ci-missing-sidecar.md`, `.planning/milestone.lock`) were never staged.
