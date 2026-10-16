---
phase: 35-electron-cutover-remove-the-electron-build
plan: 27
subsystem: power-management
tags: [sleep-assertion, powerSaveBlocker, wake-lock, sidecar, GlobalState, TypeScript-exhaustiveness]

requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "35-21's CR-02 frontendReadyBootWorkDone once-guard, landed in appShellFlowRegistration.ts (this plan reads that file's current state but does not touch it)"
provides:
  - "classifySleepAssertionKind(status): exhaustive, throw-on-unknown Status -> sleep-kind classifier in GlobalState.tsx"
  - "reconcileSleepAssertionCalls(previous, next): pure function computing the exact lock/unlock call sequence for a sleep-assertion kind-state transition"
  - "3 backend integration tests + 12 frontend pure-function tests pinning the fix, both RED-proven against the pre-fix renderer call sequence"
affects: ["35-29 (live re-measure of criterion 16 against a packaged build)"]

tech-stack:
  added: []
  patterns:
    - "Extract a DOM-touching React class method's decision logic into a pure, exported function so it is testable under a jest project with no jsdom"
    - "Unlock-then-relock-the-surviving-kind: when a two-way release primitive has no per-kind selector, release everything and immediately re-acquire whichever kind is still wanted, in the same reconciliation pass"
    - "Extract-transpile-eval a real source file's function body at test time (via the `typescript` package's transpileModule) to get genuine behavioural test coverage without importing a module that has a DOM dependency at module scope"

key-files:
  created:
    - src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - .planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Option-a (orchestrator recommendation, adopted by the operator at Task 1's decision checkpoint): classify sleep-assertion kind by source Status via two independent predicates, rather than option-b (per-kind reference counting in the sidecar, which would change the lock/unlock wire contract) or option-c (both). This keeps the fix entirely in GlobalState.tsx, avoids stacking a wire-contract change on top of 35-21's CR-02 fix in the same sidecar file, and required zero production changes to appShellFlowRegistration.ts."
  - "No production change to appShellFlowRegistration.ts: its existing independent powerId/displaySleepId tracking already supports the new frontend calling pattern (unlock-then-relock) without modification. Only appShellFlows.test.ts (tests) changed in that area."
  - "Frontend classification function is proven behaviourally, not just structurally, despite GlobalState.tsx being unimportable under the DOM-less frontend jest project: the real function source is extracted, transpiled with the `typescript` package, and evaluated at test time, rather than duplicated by hand or covered only by a source-text regex gate."

requirements-completed: [REQ-35-20]

duration: unknown (continuation agent — Task 1's decision checkpoint was made in a prior session; this session executed Task 2 only)
completed: 2026-08-31
---

# Phase 35 Plan 27: Sleep-assertion kind split (D-35-08-02 / criterion 16) Summary

**Split "is an operation pending?" from "which sleep kind should it block?" via an exhaustive `classifySleepAssertionKind` classifier plus a pure `reconcileSleepAssertionCalls` reconciler in `GlobalState.tsx`, fixing a download's system-sleep assertion outliving its download by ~108s whenever a game kept playing — with zero changes to the sidecar's `lock`/`unlock` handlers or wire contract.**

## Performance

- **Completed:** 2026-08-31
- **Tasks:** 2/2 (Task 1: decision checkpoint, resolved in a prior session; Task 2: implementation + tests, this session)
- **Files modified:** 4 (1 created, 3 modified) in the Task 2 commit; 1 further file (`REQUIREMENTS.md`) in the final docs commit

## Accomplishments

- Closed the code-level cause of live-gate criterion 16 / `D-35-08-02`: a running game no longer keeps a finished download's `prevent-app-suspension` system assertion alive.
- Discovered and fixed, as part of the same classification, a second, previously-unflagged face of the same defect: a solo `'launching'` game with no download active was spuriously taking a download-labelled system assertion (traced directly to `allowedPendingOps` counting `'launching'` into `pendingOps` while the separate `playing` boolean only checked `status === 'playing'`).
- Preserved the `window.api.lock`/`window.api.unlock` wire contract exactly as-is (`src/common/types/ipc.ts`, `src/preload/api/misc.ts` untouched), and made zero production changes to `src/backend/sidecar/appShellFlowRegistration.ts` — its existing per-id (`powerId`/`displaySleepId`) tracking already supported the new call pattern.
- Both exposing faces of the defect (spurious acquire, delayed release) independently RED-proven against the real, unchanged backend handlers, with genuine failing jest output captured verbatim (see below), not just a passing test authored after the fact.
- Solved the "how do I unit test a pure function that lives in a DOM-touching module under a jest project with no jsdom" problem for `classifySleepAssertionKind`/`reconcileSleepAssertionCalls` by extracting the real function source and transpiling+evaluating it at test time — genuine behavioural coverage, not a source-text regex gate.

## Task Commits

1. **Task 1: Decide how to split the two questions `allowedPendingOps` currently answers** — no commit (pure decision checkpoint, no file modified; resolved in a prior session to option-a before this session began)
2. **Task 2: Implement the chosen split and pin it with tests that reproduce the packaged timeline** — `0f5dfb352` (fix)

**Plan metadata:** (final docs commit hash recorded after this file is written — see completion message)

## Files Created/Modified

- `src/frontend/state/GlobalState.tsx` — added `SleepAssertionKind`, `classifySleepAssertionKind(status)`, `SleepAssertionState`, `SleepAssertionCall`, `reconcileSleepAssertionCalls(previous, next)` (all pure, exported, DOM-free); `componentDidUpdate` now computes `{ display, system }` kind-state from `libraryStatus` via the classifier each render, diffs it against `this.sleepAssertionState` via the reconciler, and dispatches the returned `lock`/`unlock` calls. Removed the old `allowedPendingOps`/`pendingOps`/single-`playing`-boolean logic entirely (confirmed unused elsewhere in the codebase before removal).
- `src/backend/sidecar/__tests__/appShellFlows.test.ts` — added a new `describe('REQ-35-20/D-35-08-02 sleep-assertion kind split')` block with 3 tests: case (a) game-only launch takes zero system assertions, case (b) the packaged 12:06/12:08/12:09 timeline (download ends while game keeps playing — the system assertion releases immediately, not deferred to quit), case (d) the inverse over-correction (game quitting does not permanently drop a concurrently-live download's assertion). No production code in `appShellFlowRegistration.ts` needed to change; only this test file did.
- `src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts` (new) — 12 tests. Extracts `classifySleepAssertionKind`/`reconcileSleepAssertionCalls`'s real source text from `GlobalState.tsx` at test time (balanced-brace scan from a start marker), strips the TypeScript-only syntax via `ts.transpileModule`, and evaluates the result with `new Function(...)` to get genuinely callable functions — without ever importing `GlobalState.tsx` itself (which throws `window is not defined` at module scope under this project's DOM-less frontend jest project, the same wall `GlobalStateSteamLogout.test.ts` hit and solved with a source-text structural gate; this file goes one step further into real execution). Covers: all 20 `Status` members classify without throwing and with no gaps; case (c) unrecognised status throws; cases (a)/(b)/(d) at the pure-function level; and an anti-vacuity self-test proving the harness would detect a synthetic regression (a version that silently defaults instead of throwing).
- `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md` — appended "Item 5" confirming the pre-existing, unrelated `decompressPool.test.ts` native-LZMA-decode failures (first logged as Item 3 by plan 35-20) still reproduce and are still out of scope for this plan.
- `.planning/REQUIREMENTS.md` — appended a sentence to `REQ-35-20`'s status prose recording this plan's contribution; requirement stays `Partial`, not `Complete` (see "What this plan does NOT prove" below).

## Decisions Made

**Option-a, decided at Task 1's blocking checkpoint (a prior session; carried into this session as an already-made decision, not re-litigated here):** classify sleep-assertion kind by source `Status` via two independent predicates (`classifySleepAssertionKind`), rather than:
- option-b (per-kind reference counting inside the sidecar) — rejected because it would change the `lock`/`unlock` wire contract, a larger and riskier change under a gate that must be re-measured, and would stack a wire-contract change on top of `35-21`'s CR-02 fix landing in the same file; or
- option-c (both layers) — rejected as the largest diff of the three, making attribution harder if the live re-measure still fails.

This is recorded here as an orchestrator recommendation the operator proceeded with at the checkpoint, not as an operator-authored argument invented in this plan.

Both of the decision's preserved constraints hold: `REQ-35-06`'s "an unrecognised kind is rejected rather than defaulted" rule is mirrored exactly (`classifySleepAssertionKind` throws on any `Status` value not covered by its exhaustive switch, backed by a compile-time `never`-typed `default` binding); and `D-35-19-10`/`D-35-19-12` were not touched — `git diff src/backend/launcher.ts` is empty.

## Both RED outputs, recorded verbatim

Captured by temporarily inverting the case (a)/(b) tests' first assertion to the POST-fix (correct) expectation while keeping the PRE-fix renderer call sequence, running `pnpm exec jest --selectProjects Backend -t "TEMP RED CAPTURE"`, then reverting the test file to its final (both-pass) form before committing — so no permanently-red test shipped, but a genuine failing run was observed and is quoted here exactly.

**Case (a) — a solo game launch must not take a system assertion:**

```
● sidecar app-shell flows (Phase 34.1 Plan 04 — REQ-34.1-05/REQ-34.1-09) › REQ-35-20/D-35-08-02 sleep-assertion kind split › TEMP RED CAPTURE case (a)

  expect(jest.fn()).not.toHaveBeenCalledWith(...expected)

  Expected: not "wake_lock_start", ["prevent-app-suspension"]

  Number of calls: 1
```

**Case (b) — the download's assertion must release at the download's end, not at quit:**

```
● sidecar app-shell flows (Phase 34.1 Plan 04 — REQ-34.1-05/REQ-34.1-09) › REQ-35-20/D-35-08-02 sleep-assertion kind split › TEMP RED CAPTURE case (b)

  expect(jest.fn()).toHaveBeenCalledWith(...expected)

  Expected: "wake_lock_stop", Anything

  Number of calls: 0
```

Both failures were produced by sending the EXACT pre-fix `componentDidUpdate` IPC sequence (verified against the pre-27 source: `allowedPendingOps` membership for `pendingOps`, `status === 'playing'` alone for the `playing` boolean) through the real, unmodified `lock`/`unlock` handlers in `appShellFlowRegistration.ts`. Neither failure is about a change to the backend — both are entirely about which sequence the renderer sends.

## Which exposing configuration each test reproduces

- **Case (a)** reproduces exposing configuration (a) from the interface notes: a game running with **no download active**. This is the configuration that exposes the spurious-acquire face of the defect.
- **Case (b)** reproduces exposing configuration (b): **letting the download finish while the game keeps running** — the exact packaged timeline (12:06:45 download start / 12:08:04 game launch / 12:09:33 download end). This is the configuration that exposes the delayed-release face of the defect, and is the case that matters most (`D-35-08-02`'s primary finding).
- **Case (d)** (not required to be RED-proven per the plan's acceptance criteria) checks the inverse direction: a game quitting while a download stays active must not drop the download's protection.

**Explicitly not used as a proof, per the plan's own warning:** the simultaneous game+download snapshot (both active at once) is NOT asserted as sufficient proof of correctness anywhere in this plan's tests. The `35-LIVE-GATE.md` record for criterion 16 shows this configuration reads as the "best case" (counts 1 and 1) even when the pre-fix defect is fully present, because the pre-fix `lock` handler's own `!playing && !isSleepBlocked` guard happens to suppress the spurious acquire while the download already holds `isSleepBlocked`. A future reader must not add a test that only checks this snapshot and call it done — that would be `T-35-129`'s exact failure mode (a green test that is also green against the defect).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, discovered incidentally] A solo `'launching'` game with no download active was ALSO taking a spurious system assertion**
- **Found during:** Task 2, while tracing the pre-fix renderer sequence to design case (a)'s RED proof.
- **Issue:** `allowedPendingOps` (pre-fix) counted `'launching'` into `pendingOps` (so the `if (pendingOps)` branch fired), but the separate `playing` boolean was computed only from `status === 'playing'`, leaving it `false` — so `window.api.lock(false)`, the download branch, went out for a solo game launch with zero downloads running. This is a second, real face of `D-35-08-02`'s root mechanism, not previously named as its own finding.
- **Fix:** Covered by the same `classifySleepAssertionKind`/`reconcileSleepAssertionCalls` fix that addresses the primary defect — `'launching'` classifies as `'display'`, never `'system'`.
- **Files modified:** `src/frontend/state/GlobalState.tsx` (same edit as the primary fix); pinned by case (a) in both `appShellFlows.test.ts` and `GlobalStateSleepAssertionClassification.test.ts`.
- **Commit:** `0f5dfb352`

### Process incident (self-corrected, no data lost)

While drafting this plan's `deferred-items.md` entry, an initial `Write` call overwrote the phase's existing 2031-line `deferred-items.md` (accumulated across plans `35-01` through `35-24`) with a brand-new 20-line file, instead of appending. This was caught immediately via `git diff --stat` before any commit, restored losslessly with `git show HEAD:<path> > <path>` (the sanctioned restore technique for this repo — `git checkout --` fires a `post-checkout` hook that throws), and the intended note was then correctly appended as "Item 5" rather than replacing the file. No content was lost; nothing from this incident was ever committed.

## What this plan does NOT prove

**Live confirmation is explicitly not claimed here.** This plan closes only the CODE-LEVEL cause of live-gate criterion 16. The actual re-measure of criterion 16 (`pmset -g assertions` against a packaged macOS `.app`, following `35-LIVE-GATE.md`'s established format) belongs to plan **`35-29`**, not this plan. `REQ-35-20` remains `Partial` in `REQUIREMENTS.md`, not `Complete` — the requirement's own text is explicit that "Any FAIL means phase not close" is only satisfied by a live gate re-run with 0 FAILs, which no code-fixing plan (`35-20`/`35-21`/`35-22`/`35-24`/`35-27`) performs on its own.

## Known Stubs

None.

## Threat Flags

None — all new surface (the classification and reconciliation logic) was explicitly named in this plan's own `<threat_model>` (T-35-126, T-35-127, T-35-128, T-35-129), and no new network endpoint, auth path, file access pattern, or schema change was introduced.

## Verification performed

- `pnpm test --selectProjects Backend Frontend`: 6466 passed / 3 failed (2 skipped) — the 3 failures are pre-existing, in `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` (native-LZMA-decode, unrelated subsystem, untouched by this plan, first logged by plan `35-20` as its own "Item 3", now confirmed to still reproduce as "Item 5" in `deferred-items.md`). All 15 new tests added by this plan (3 backend + 12 frontend) pass.
- `pnpm codecheck` (`tsc --noEmit`): clean, no errors.
- `pnpm build:sidecar`: succeeds (`build/main/sidecar.js`, 1.3mb).
- `pnpm smoke:sidecar`: `[sidecar-smoke] PASS: built, started, exited 0 on stdin EOF.`
- `git diff --stat src/backend/launcher.ts`: empty (no output).
- `git diff --stat src/backend/sidecar/appShellFlowRegistration.ts`: empty (no output) — confirmed no production change was needed in that file.
- `grep -n 'prevent-display-sleep' src/backend/sidecar/appShellFlowRegistration.ts` and `grep -n 'prevent-app-suspension' src/backend/sidecar/appShellFlowRegistration.ts`: both return matches — the two assertion kinds remain distinct.
- `D-35-19-10`/`D-35-19-12`: untouched (not referenced by any change in this plan).

## Success Criteria Check (independent of task-level checkboxes)

Per this plan's own `<success_criteria>` block, checked explicitly and separately from the per-task `<done>` criteria above (per this project's own house lesson: a plan's task criteria can all pass while its `success_criteria` fails):

- "Criterion 16's 'no cross-contamination' half has a code fix, decided on the record rather than special-cased." — **MET.** The fix is the general `classifySleepAssertionKind`/`reconcileSleepAssertionCalls` split, not a status-specific special case, and the decision is recorded at Task 1's checkpoint (option-a) and restated in this SUMMARY.
- "The two assertion kinds remain distinct, per REQ-35-06." — **MET.** Confirmed by the grep checks above; `classifySleepAssertionKind` never collapses `'display'` and `'system'` into one value, and throws rather than defaulting on an unrecognised status.
- "D-35-08-02's deferred decision is answered." — **MET.** Option-a selected and implemented; both preserved constraints (REQ-35-06's reject-unknown rule, D-35-19-10/-12 untouched) hold.

All three success criteria are satisfied by code-level changes only. The live-gate re-run that would upgrade `REQ-35-20` toward `Complete` is out of this plan's scope by design (routed to `35-29`).

## Self-Check: PASSED

All created/modified files confirmed present on disk; task commit `0f5dfb352` confirmed present in `git log --oneline --all`.
