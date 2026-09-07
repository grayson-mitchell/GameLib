---
phase: quick-260907-sxp
plan: 01
subsystem: downloadmanager
tags: [abort-controller, stall-watchdog, tdd, steam-depot, todo-correction]

requires: []
provides:
  - "withStallTimeout's trip() signals the appName's registered AbortController synchronously, before rejecting"
  - "RED/GREEN test coverage asserting the abort SIGNAL, not just the rejection (T-A/T-B), plus two green regression pins (T-C/T-D)"
  - "corrected mechanism record on the 2026-08-27 stall-watchdog todo, with two unconfirmed narrowed hypotheses for the real orphan"
affects: [steam-depot, downloadmanager]

tech-stack:
  added: []
  patterns:
    - "abort-before-reject ordering inside a Promise.race-based timeout, gated on hasAbortController so runners with no registered controller (sideload) trip no spurious ERROR log"

key-files:
  created: []
  modified:
    - src/backend/downloadmanager/installStallWatchdog.ts
    - src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts
    - .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md

key-decisions:
  - "trip() now calls callAbortController(appName) itself, gated on hasAbortController, before rejectStall — redundancy hardening, not a fix, because downloadmanager/utils.ts's own finally already did this one microtask later (F1)."
  - "Did not touch downloadmanager/utils.ts, depot.ts, or games.ts — the two abort paths are deliberately redundant now, per F1."
  - "Todo stays OPEN in pending/; the SUMMARY and the todo both say plainly that the 51-minute orphan is unexplained by this change."

requirements-completed: [TODO-260827-STALL]

duration: ~20min
completed: 2026-09-07
---

# Quick Task 260907-sxp: Fix install-stall watchdog so a trip can Summary

**Hardened `withStallTimeout`'s trip() to abort the appName's registered controller itself (gated, before rejecting) — redundancy, not a fix, for the 2026-08-27 51-minute orphaned-download observation, whose real cause remains unconfirmed.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-07
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- `withStallTimeout`'s `trip()` now signals cancellation through the shared `backend/utils/aborthandler` registry (keyed by `appName`) synchronously, before it rejects — closing a real fragility where every abort on the stall path depended on exactly one caller's `finally` block.
- Four new test cases (T-A, T-B, T-C, T-D) assert the abort SIGNAL and its ordering relative to the rejection, not merely that the promise rejects. T-A/T-B were RED against the pre-fix tree and are GREEN after. T-C/T-D are green regression pins (no spurious ERROR log when nothing is registered; `Promise.race` still absorbs a late inner rejection per F6) — green in both states.
- The 2026-08-27 todo's `## Mechanism` section is annotated (not deleted) with a dividing sha, and a `## Verified at HEAD` section records that an abort ALREADY fired on that stall path five-plus days before the live observation — so this plan's change cannot be claimed to close the todo. The todo stays `OPEN` in `pending/`.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — tests that assert the SIGNAL, not the rejection** - `7ac9a5593` (test)
2. **Task 2: GREEN — trip() signals the abort, gated, before it rejects** - `e08997f35` (feat)
3. **Task 3: Record — correct the todo, keep it OPEN, name the residual** - `08834d65d` (docs)

_No plan-metadata commit created by this executor — STATE.md/ROADMAP.md are orchestrator-owned per this task's constraints._

## Files Created/Modified

- `src/backend/downloadmanager/installStallWatchdog.ts` - `trip()` now calls `hasAbortController(appName)` / `callAbortController(appName)` (gated, synchronous, before `rejectStall`), with `logInfo`/`logWarning` lines textually distinct from `installQueueElement`'s existing abort log. Header comment extended to document the new mechanism and the coverage gap (sideload, intermittent CLI-runner window). `Promise.race` and the `finally` block are byte-for-byte unchanged.
- `src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts` - Four new cases (T-A, T-B, T-C, T-D) appended to the existing `describe('withStallTimeout')` block, plus a module-level `jest.mock('backend/logger', ...)` using bare `jest.fn()`s (the `resetMocks: true`-safe shape per F8). The 10 pre-existing cases are untouched.
- `.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md` - `## Mechanism` annotated with a dividing-sha blockquote (not deleted). New `## Verified at HEAD (2026-09-07, quick 260907-sxp, tree 5623c6c28)` section (F1/F2/F3/F5 + "what 260907-sxp actually changed"). New `## Narrowed hypotheses (unconfirmed)` section (registry-replace-on-restart; `cdnAuth.ts` abort-blindness). New `## Residual` section (Tauri-shell live re-drive required). The "other `withStallTimeout` callers" bullet under `## Not yet established` is struck through and marked settled by F5; the CDN-cause bullet is left as-is. `status: OPEN` unchanged; file remains in `pending/`.

## Decisions Made

- **Abort-before-reject ordering, with the exact justification reproduced in code comments:** (a) `callAbortController` is synchronous, so this can only ever be earlier than the status quo's one-microtask-later abort; (b) the abort is the cancellation act, the rejection only its report; (c) rejecting first would hand control to the caller's `catch` before this module has done its own part.
- **`hasAbortController` gate kept mandatory, not decorative:** per F5 (verified in the todo), a sideload install registers no controller at all, and the four CLI runners are registered only while a runner command is spawned. An ungated `callAbortController` would emit the exact `[ERROR][Backend] Aborting not possible` false alarm that 37-05 previously removed from the sibling caller in `downloadmanager/utils.ts`.
- **`downloadmanager/utils.ts`'s existing `finally`-block abort was deliberately left untouched.** The two paths are now redundant by design; F1 explains why redundancy (not replacement) is the correct move here.
- **Did not rewrite the plan's naive `grep -c "storeManagers"` check to force it to 0.** See "Deviations" below — the file's own pre-existing header prose (present at baseline, unrelated to this plan) already contains the string `storeManagers/steam` as a documented constraint. Verified with a precise import-graph grep instead of deleting correct documentation.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues required an out-of-plan fix. The plan's `<planner_findings>` (F1-F8) were followed as given, not re-derived.

### Plan-check imprecision (documented, not silently worked around)

**1. [Verification-command imprecision] `grep -c "storeManagers"` on `installStallWatchdog.ts` returns 1, not the plan's expected 0**
- **Found during:** Task 2 verification.
- **Issue:** The plan's Task 2 `<verify>` and the overall `<verification>` step 3 both assert `grep -c "storeManagers" src/backend/downloadmanager/installStallWatchdog.ts` returns 0. It returns 1 — but this is **not a regression introduced by this plan**. `git show 5623c6c28:src/backend/downloadmanager/installStallWatchdog.ts | grep -c storeManagers` (the baseline, i.e. `HEAD~1`/`HEAD~2` relative to this task's own commits) also returns 1, from the file's own pre-existing header prose (added under an earlier commit, 260817-dib): `"it must never import anything from \`storeManagers/steam\`."` — a documented constraint statement in a comment, not an import.
- **Verification of the actual constraint:** `grep -n "from ['\"].*storeManagers" src/backend/downloadmanager/installStallWatchdog.ts` returns no matches — the file imports nothing from `storeManagers/*`. This is the substantive property the check exists to guard, and it holds.
- **Resolution:** Left the pre-existing header prose untouched — deleting a correct, load-bearing documentation sentence purely to force a naive string-count grep to read 0 would have been dishonest test-gaming, not a fix. Documenting the discrepancy here instead.
- **Files affected:** None modified beyond what Task 2 already changed.

## Self-Check

- `src/backend/downloadmanager/installStallWatchdog.ts` exists and contains `hasAbortController`: verified.
- `src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts` exists and contains `signal.aborted`: verified (T-A: `controller.signal.aborted`).
- `.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md` contains `Verified at HEAD`: verified (count 1).
- Commit `7ac9a5593` (test): present in `git log`.
- Commit `e08997f35` (feat): present in `git log`.
- Commit `08834d65d` (docs): present in `git log`.

## Non-vacuity Proof (held commit constant, varied the tree)

1. `git show e08997f35^:src/backend/downloadmanager/installStallWatchdog.ts` written back into the working tree (never `git checkout --`, per this repo's post-checkout helper-binary-download hook).
2. Re-ran `pnpm jest --selectProjects Backend --testPathPattern installStallWatchdog`: **T-A and T-B went RED again** (`Expected: true / Received: false`; `Received: undefined`), T-C/T-D and all 10 pre-existing cases stayed green — 12/14.
3. Restored the tree with `git show e08997f35:src/backend/downloadmanager/installStallWatchdog.ts > <path>` (not `checkout --`). `git diff --stat` on the file reported no changes — byte-identical to the committed blob.
4. Re-ran the suite: **14/14 pass.**

Both directions (RED against pre-fix blob, GREEN against post-fix blob) confirmed against a fixed commit with only the working tree varied, exactly as the plan's non-vacuity requirement specifies.

## RED, recorded verbatim (Task 1, against tree `5623c6c28`)

```
✕ T-A: a trip aborts the appName's registered controller, not just the race (1 ms)
✕ T-B: the abort fires strictly before the rejection is observed by the caller

  ● withStallTimeout › T-A: a trip aborts the appName's registered controller, not just the race
    expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
      at installStallWatchdog.test.ts:299:41  (expect(controller.signal.aborted).toBe(true))

  ● withStallTimeout › T-B: the abort fires strictly before the rejection is observed by the caller
    expect(received).toBeDefined()
    Received: undefined
      at installStallWatchdog.test.ts:332:25  (expect(abortTick).toBeDefined())

Test Suites: 1 failed, 1 total
Tests:       2 failed, 12 passed, 14 total
```

T-C and T-D were confirmed green at this same RED checkpoint (harness sanity, per the plan's instruction to STOP AND REPORT if either were red here — neither was).

## GREEN, recorded verbatim (Task 2, against `e08997f35`)

```
✓ T-A: a trip aborts the appName's registered controller, not just the race
✓ T-B: the abort fires strictly before the rejection is observed by the caller
✓ T-C: no controller registered signals nothing, logs no ERROR, and still rejects with a StallError
✓ T-D: a late inner rejection after the trip does not surface as an unhandledRejection (F6 pin) (1001 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
```

`pnpm codecheck` (`tsc --noEmit`) exits 0.

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired data sources introduced.

## Threat Flags

None — no new network endpoint, auth path, file-access pattern, or schema change at a trust boundary. All three threat-register entries (T-sxp-01/02/03) from the plan's own `<threat_model>` are addressed by the implementation as specified (appName-scoped abort; textually distinct log line; no new sensitive data logged).

## What This Plan Does NOT Claim

**The orphaned-download defect described in the 2026-08-27 todo is NOT fixed by this plan.** Per F1 (verified against HEAD and recorded in both the todo and this summary), an abort was already signalled on the stall path on 2026-08-27, one microtask later than this change now fires it — via `downloadmanager/utils.ts`'s pre-existing `finally` block. The depot loop still ran for 51 minutes after that abort fired. This plan is redundancy hardening (a second caller of `withStallTimeout` would previously have leaked outright; now it cannot). It does not identify, and does not claim to identify, why the 2026-08-27 loop survived an abort that was genuinely signalled. Two unconfirmed hypotheses are recorded in the todo's `## Narrowed hypotheses` section; closing the todo requires a live re-drive under genuine CDN-stall conditions on the Tauri shell, which is out of scope for this quick task.

## Blockers

None.
