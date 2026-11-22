---
phase: 86-pure-leaf-services
plan: 13
subsystem: info-anticheat
tags: [anticheat, shim, rustinvoke, releasesinfoready, online-wait, delete-gate, d-05, d-06, d-07, d-13, d-28, sc4]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-12 Rust ops info_anticheat_info / _status / _download, the RUST_INFO_ANTICHEAT_* constants and their strict schemas; 86-09 launcher requestRustInvoke seam; 86-11 sidecarHarness rustAnswers"
provides:
  - "src/backend/info/anticheat.ts: anticheatStatus, anticheatDownload, gameAnticheatInfo one-call shims (each resolves unknown; callers cast)"
  - "The releasesInfoReady listener now asks info_anticheat_status with the platform hash, and only when needed waits on onlineMonitor.runOnceWhenOnline and sends info_anticheat_download, logging the crate's warning; the rejection guard is kept"
  - "launcher.ts calls the gameAnticheatInfo shim"
  - "TS anticheat slice and its oracle deleted; describe('anticheatPortComplete') and three infoShimSchedule rows (deletedBy 88)"
affects: [86-14, 88]

actuals:
  tokens: 21800
  tasks: 2
  commits: 2

key-files:
  created:
    - src/backend/info/anticheat.ts
    - src/backend/info/__tests__/anticheat.test.ts
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/launcher.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/enrichmentFlowRegistration.ts
    - src/backend/__tests__/infoPortComplete.test.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - meta/backendDiCeilings/sidecar-tests-flows-1.json
  deleted:
    - src/backend/anticheat/utils.ts
    - src/backend/info/__tests__/oracle/anticheat.oracle.test.ts

key-decisions:
  - "The listener keeps TS's check-then-wait order: status first, then the online wait only when needed is true. Rust has no online logic (D-07, D-28)."
  - "The download callback carries its own .catch, because runOnceWhenOnline drops the callback's return value: a rejected download frame must not reach unhandledRejection. Two guarded paths, with log lines `[bootstrap] anticheatStatus failed:` and `[bootstrap] anticheatDownload failed:`."
  - "The listener logs the crate's `warning` itself when download answers written:false (the crate has no logger; carry-forward from 86-12)."
  - "The listener's order and no-download-when-not-needed assertions live in bootstrapWirings.test.ts (real boot, real listener, Rust frames), not in anticheat.test.ts: the boot mocks they need are already there. anticheat.test.ts pins each shim's channel, argument and schema."
  - "The shims resolve `unknown` (the 86-11 convention: the shim checker requires the returned value to be the call itself, so a cast cannot sit in the shim); the listener and launcher.ts cast at the use site."

patterns-established:
  - "sidecarHarness rustAnswers: an answer that throws becomes a rejected frame (ok:false), so a booted case can prove a listener survives a rejecting Rust op without module mocks."

requirements-completed: []

plan_head_before: 87569c3e4d811b9bcdf5658a74048754f94d2cc3
plan_head_after: d574b1d5b9486c2ffd06304288197cea3af6a34d
commits: 2
status: complete
---

# Phase 86 Plan 13: Anticheat shims and TS delete Summary

**The anticheat data refresh and the launch-time lookup now run in Rust: three one-call shims in `info/anticheat.ts`, a `releasesInfoReady` listener that asks Rust whether the file is stale before TS's online wait, and the TS anticheat slice plus its oracle deleted behind a delete gate.**

## Accomplishments

- Task 1 (tracer, `b2186e8eb`): `anticheatStatus`, `anticheatDownload`, `gameAnticheatInfo` shims; the single `releasesInfoReady` listener now computes the platform hash (shaMac on mac, shaLinux otherwise), awaits `info_anticheat_status`, and only on `needed` calls `onlineMonitor.runOnceWhenOnline` to send `info_anticheat_download`. `launcher.ts` imports the shim. Two new real-boot cases in `bootstrapWirings.test.ts`: status carries the Linux hash and nothing downloads when `needed:false`; with an offline monitor the download frame waits until `setOnline(true)` and follows the status frame. `sidecarRejectionGuard.test.ts` now drives a rejected status frame (via the harness) instead of a module mock of `anticheat/utils`.
- Task 2 (`d574b1d5b`): `src/backend/anticheat/utils.ts` and `anticheat.oracle.test.ts` deleted (the `src/backend/anticheat` directory is gone); `describe('anticheatPortComplete')` covers the two deleted files, the kept `golden/anticheat` and `recorded/anticheat`, forbidden `downloadAntiCheatData` / `createMD5`, no `getAnticheatInfo` sidecar registration, no non-test TS file naming `areweanticheatyet.json`, no `GAMELIB_ANTICHEAT`; three schedule rows (`deletedBy` 88, callers per file: `launcher.ts` and `sidecar/bootstrap.ts`).
- Tracer gate (auto, end to end): the verify chain (shim, wiring and rejection-guard suites, codecheck, prettier) passed before expanding; the full Backend jest project then passed (633 suites passed, 3 skipped; 14157 tests passed).

## Task Commits

1. Task 1 (tracer): `b2186e8eb` feat(86-13): anticheat refresh and launch lookup run in Rust behind TS's online wait
2. Task 2: `d574b1d5b` feat(86-13): delete the TS anticheat slice, add anticheatPortComplete and three schedule rows

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The download callback needed its own `.catch`**
- **Found during:** Task 1
- **Issue:** The plan's `runOnceWhenOnline(() => anticheatDownload(deps).then(() => undefined))` drops a rejection: the monitor ignores the callback's return, so a rejected download frame would reach `unhandledRejection` (T-86-26's rejection guard covered only the status chain).
- **Fix:** The callback does `.then(log warning) .catch(logWarning)`.
- **Files modified:** src/backend/sidecar/bootstrap.ts
- **Commit:** b2186e8eb

**2. [Rule 3 - Blocking] sidecarHarness could not answer a frame with a rejection**
- **Found during:** Task 1
- **Issue:** The rejection-guard suite mocked `anticheat/utils` to reject; with the module gone the only faithful way to prove the survival is a rejected Rust frame, and a throwing `rustAnswers` entry would have thrown inside the stream handler.
- **Fix:** a throwing answer becomes `{ ok:false, error }`; DEFAULT_RUST_ANSWERS gained the three anticheat channels (carry-forward from 86-11/86-12).
- **Files modified:** src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
- **Commit:** b2186e8eb

**3. [Rule 3 - Blocking] A jestMock ceiling had to shrink**
- **Found during:** Task 2
- **Issue:** `pnpm backend-di-ceilings` demands the ceiling drop once a `jest.mock` is removed: sidecarRejectionGuard.test.ts 5 -> 4. This is the gate tracking a list this plan shrinks (dated by this commit), not a widening.
- **Files modified:** meta/backendDiCeilings/sidecar-tests-flows-1.json
- **Commit:** d574b1d5b

**4. [Plan wording] Listener order tests live in bootstrapWirings.test.ts**
- The plan put "status before the online wait, never download when not needed" in anticheat.test.ts. Those assertions need the real boot, so they are in bootstrapWirings.test.ts; anticheat.test.ts pins each shim's channel, argument, answer and rejection passthrough, plus the strict schemas.

**5. [Stale comment] bootstrap.ts referred to `anticheat/ipc_handler.ts`**
- That file no longer exists; the Block A comment now states the single-listener rule (T-86-26) instead. Also dropped the stale `anticheat/utils` mentions in enrichmentFlowRegistration.ts and enrichmentFlows.test.ts comments.

## Verification

- `pnpm exec jest` over anticheat.test.ts, bootstrapWirings, sidecarRejectionGuard, infoPortComplete, infoShimSchedule, enrichmentFlows: all pass; full Backend project: pass.
- `pnpm codecheck` exit 0; `pnpm find-deadcode` PASS (312 baselined findings, unchanged); prettier clean on every touched file; eslint 0 errors.
- `pnpm backend-di-ceilings`: only the two known foreign failures (optInDlc.test.ts, libraryStoreFollowers.test.ts).
- `grep -c downloadAntiCheatData src/backend/sidecar/bootstrap.ts` = 0; `test -d src/backend/anticheat` exits 1.

## Known Stubs

None.

## Threat Flags

None. T-86-26 mitigated: one listener (bootstrapWirings still counts the registrations), both rejection paths guarded, the download behind the online wait and (in Rust) a registrant.

## Self-Check: PASSED

- FOUND: src/backend/info/anticheat.ts, src/backend/info/__tests__/anticheat.test.ts
- MISSING (deleted as intended): src/backend/anticheat/utils.ts, anticheat.oracle.test.ts
- FOUND commits: b2186e8eb, d574b1d5b
