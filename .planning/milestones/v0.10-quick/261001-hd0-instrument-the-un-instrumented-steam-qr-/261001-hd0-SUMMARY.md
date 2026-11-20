---
phase: quick-261001-hd0
plan: 01
subsystem: steam-auth-observability
tags: [steam, qr-login, logging, observability, tdd]
status: complete

requires: []
provides:
  - "src/backend/storeManagers/steam/user.ts: startQRLogin() now logs entry, cancel-of-previous-session, challenge-issued (naming the new QR_LOGIN_TIMEOUT_MS constant and its value), and authenticated-event-received, via logInfo(..., LogPrefix.Steam)"
  - "src/backend/storeManagers/steam/user.ts: pollQRLogin() now logs a change-only status-transition line ('Steam QR poll: status X -> Y'), guarded by a new qrLastLoggedStatus tracker reset alongside qrSessionState at both its reset sites (startQRLogin, logout)"
  - "src/backend/storeManagers/steam/__tests__/user.test.ts: 12 new tests pinning the entry/cancel/challenge/authenticated lines, the leak-scan (no challenge URL/refresh token/persona name in any logged argument), the flood-guard (exactly one line across 3 same-status polls), the waiting->error and waiting->done transitions, and the cross-attempt tracker reset"
  - ".planning/todos/completed/2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md: todo closed with a resolution section"
affects: [steam-auth-flow, gamelib-log-diagnosability]

tech-stack:
  added: []
  patterns:
    - "Change-only transition logging guarded by a parallel 'last logged' tracker field, reset at every site that resets the state it shadows, to avoid flooding a log that is read by a timer-driven poller (precedent: qrSessionState/qrLastLoggedStatus pair in SteamUser)"
    - "Leak-scan test over the full flattened mock-call-argument list (jest.mocked(fn).mock.calls.flat(Infinity).map(String)) rather than a text grep, to pin that no logged line carries session material — precedent at user.test.ts:1441, extended here to the QR entry/poll lines"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
    - .planning/todos/completed/2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md

key-decisions:
  - "QR_LOGIN_TIMEOUT_MS extracted as a named constant (120000) and used both to set session.loginTimeout and to interpolate the challenge-issued log line, so the logged timeout value cannot drift from the value actually applied to the session — a single source of truth rather than two hand-typed 120000 literals."
  - "pollQRLogin's new line is change-only, not per-poll. The frontend (steamAuthFlowRegistration.ts) polls on a timer, so a per-poll line would flood gamelib.log and would itself have been a defect (D-02 in the plan's threat model). Pinned by a flood-guard test asserting exactly one line across three consecutive same-status polls."
  - "The five pre-existing error branches in startQRLogin (session CM-connect-failure warning, auth-finalization error, timeout warning, session-error error, outer catch error) were left byte-unchanged, per the plan's locked decision and the todo's own 'Correction to the original briefing' — those branches were never silent, and this task does not re-litigate that finding."
  - "src-tauri/src/main.rs and the credential-login path (startCredentialLogin/pollCredentialLogin) were never touched, per locked decision D-04. The keyring RPC arms' success-silent eprintln! logging (cross-referenced in the todo) remains open and out of scope."

actuals:
  tokens: 5223
  tasks: 3
  commits: 3
  plan_head_before: 5485e020095a070624f47bfef1f3bde45b0c9034
  plan_head_after: 24e06e788b926421c5064ccfa79c4cb51c2d50e1

requirements-completed: [TODO-261001-QR-OBSERVABILITY]

duration: ~15-45min (precise start time lost to a mid-session context compaction; commit timestamps for Tasks 1-3 span 12:53:23-13:02:56 NZDT, 2026-10-01)
completed: 2026-10-01
status: complete
---

# Quick Task 261001-hd0: Instrument the un-instrumented Steam QR login paths Summary

**A Steam QR login attempt that never completes — abandoned client-side, or still sitting in `waiting` when the operator gives up — now leaves a readable trail in `gamelib.log`: four entry/cancel/challenge/authenticated lines in `startQRLogin()` and one change-only status-transition line in `pollQRLogin()`, with the five pre-existing error branches left byte-unchanged and no line carrying the challenge URL, refresh token, or persona name.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 2 source/test files, 1 todo moved+edited
- **Commits:** 3 (one per task, as the plan specified — unlike the sibling 261001-fz5 quick task, this plan did not instruct commit-folding)

## Accomplishments

- `startQRLogin()` gained four `logInfo(..., LogPrefix.Steam)` calls: on entry ("attempt starting"), when a previous session is cancelled before starting a new one, when the QR challenge is issued (naming the new `QR_LOGIN_TIMEOUT_MS` constant's value, 120000ms), and when the `authenticated` event is received and finalization begins.
- A new `QR_LOGIN_TIMEOUT_MS` constant replaces the previous hand-typed `120000` literal at the `session.loginTimeout` assignment, so the logged timeout value and the applied value share one source.
- `pollQRLogin()` gained exactly one change-only status-transition line (`Steam QR poll: status X -> Y`), guarded by a new `qrLastLoggedStatus` private static field reset alongside `qrSessionState` at both of its reset sites (`startQRLogin`, `logout`), so a second attempt's first observation is never silently skipped.
- 12 new tests added across `startQRLogin()` and `pollQRLogin()` describe blocks: entry line, cancel-of-previous-session line, challenge-issued line (asserting the exact timeout value), authenticated-received line, a whole-flow leak-scan (modeled on the existing precedent at `user.test.ts:1441`), a timeout-regression guard, first-observation "none -> waiting", a flood-guard (exactly 1 line across 3 same-status polls), waiting->error, waiting->done, a persona-name leak guard, and a tracker-reset-across-attempts test.
- The five pre-existing error branches in `startQRLogin` (`:545-548` CM-connect warning, `:551` auth-finalization error, `:557` timeout warning, `:562` session-error error, `:568` outer-catch error, in the file's pre-change line numbering) are confirmed byte-unchanged by direct diff review — none of this task's edits touch those lines.
- The originating todo is closed into `.planning/todos/completed/` with `status: RESOLVED`, `resolved: 2026-10-01`, and a resolution section naming what changed, pinning the leak/flood guarantees, and recording honest limits.

## Task Commits

1. **Task 1: Instrument `startQRLogin()` entry/teardown/challenge/authenticated lines** — `18493ebf5` (feat)
2. **Task 2: Add change-only status-transition logging in `pollQRLogin()`** — `db1b36def` (feat)
3. **Task 3: Close the originating todo** — `24e06e788` (docs)

## TDD Compliance

Both Task 1 and Task 2 followed RED-GREEN:

**Task 1 RED** — added the 6 new `startQRLogin()` tests before any implementation change; ran them in isolation and confirmed failure for the expected reason (no `logInfo` calls existed yet for entry/cancel/challenge/authenticated — the mock's call list was empty where the new assertions expected lines).

**Task 1 GREEN** — added the four `logInfo` calls and the `QR_LOGIN_TIMEOUT_MS` constant; re-ran in isolation, all 6 new tests passed. Also fixed a pre-existing `mockSessionInstance` typing gap (`loginTimeout` was read/written by tests but absent from the mock object literal, causing a `TS2339` codecheck failure) — Rule 3, blocking, in-scope since the test file was already being edited.

**Task 2 RED** — added the 6 new `pollQRLogin()` tests before any implementation change; ran them in isolation and confirmed failure for the expected reason (no transition line existed, `qrLastLoggedStatus` did not exist).

**Task 2 GREEN** — added the `qrLastLoggedStatus` field, its two reset sites, and the guarded log call in `pollQRLogin()`; re-ran in isolation, all 6 new tests passed. One of my own new tests (the persona-name leak guard) initially failed for an unrelated reason — a microtask-flushing timing gap in the test's own setup (3 bare `Promise.resolve()` awaits were insufficient to let the mocked `logOn`'s `process.nextTick`-scheduled `loggedOn` event resolve before the assertion ran), not a defect in `pollQRLogin()` itself. Fixed by adding an explicit `process.nextTick` flush before the existing `Promise.resolve()` chain; this is a test-only correction, not a deviation in behavior.

Full verification after both tasks: `npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam/__tests__/user.test.ts'` — 86/86 tests passed in the scoped suite.

## Files Created/Modified

- `src/backend/storeManagers/steam/user.ts` — `QR_LOGIN_TIMEOUT_MS` constant added; 4 `logInfo` calls added to `startQRLogin()`; `qrLastLoggedStatus` field, its 2 reset sites, and 1 guarded `logInfo` call added to `pollQRLogin()`/related reset paths.
- `src/backend/storeManagers/steam/__tests__/user.test.ts` — `loginTimeout: 0` added to `mockSessionInstance` (typing fix); 6 new tests in the `startQRLogin()` describe block; a `pollLines()` helper and 6 new tests in the `pollQRLogin()` describe block.
- `.planning/todos/completed/2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md` — moved from `pending/`, gained `status: RESOLVED`/`resolved: 2026-10-01` frontmatter and a `## Resolution` section.

## Decisions Made

See `key-decisions` in the frontmatter. All four decisions were either pre-made in the plan's locked-decisions list (D-01 through D-04: never touch `main.rs`/credential-login path, log only state/slot names and the numeric timeout, leave the five error branches unchanged) or were direct, low-risk implementation choices made while executing within those locks (the `QR_LOGIN_TIMEOUT_MS` single-source-of-truth extraction; the change-only rather than per-poll logging shape, which the plan's own must-haves table (D-02) already specified).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `loginTimeout` field to `mockSessionInstance` mock object literal**
- **Found during:** Task 1
- **Issue:** `tsc --noEmit` failed with `TS2339: Property 'loginTimeout' does not exist` because the mock object literal had no `loginTimeout` field, yet both pre-existing code (`session.loginTimeout = ...`) and the new Task 1 tests read/wrote `mockSessionInstance.loginTimeout`.
- **Fix:** Added `loginTimeout: 0,` with an explanatory comment to the `mockSessionInstance` object literal.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/user.test.ts`
- **Verification:** `tsc --noEmit` passed; scoped jest suite passed.
- **Committed in:** `18493ebf5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the test file to typecheck at all once the new tests referenced `loginTimeout`. No scope creep — no behavior change to source, no new test surface beyond what Task 1 already required.

## Issues Encountered

- A test-only microtask-flushing timing gap in my own newly-added persona-name leak-guard test (Task 2) initially caused `result.username` to be `undefined` instead of the expected value — traced to an insufficient `Promise.resolve()` flush count relative to the mocked `logOn`'s `process.nextTick`-scheduled event. Fixed by adding an explicit `process.nextTick` flush before the existing chain. This was a defect in the new test's own setup, not in `pollQRLogin()`'s unchanged return logic, and is not a deviation from the plan's specified behavior.

## Verification

All of the plan's verification commands were run and passed:

1. `npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam/__tests__/user.test.ts'` — 86/86 tests passed (confirmed again after Task 3's commit to prove the todo-only change did not affect test state).
2. `npx tsc --noEmit` — clean, after the `loginTimeout` mock fix.
3. `npx prettier --check` over `src/backend/storeManagers/steam/user.ts` and `src/backend/storeManagers/steam/__tests__/user.test.ts` — clean (one `--write` pass was needed on the test file after adding the new tests, then re-verified clean).
4. `pnpm planning-gates` — 12/12 passed, run with Task 3's todo move/edit staged.
5. `git diff` review confirming the five pre-existing error branches in `startQRLogin()` are byte-unchanged, and that `src-tauri/src/main.rs` and the credential-login functions were never touched.

Deliberately NOT run: `npx prettier --check` over the todo file path (`.planning/todos/completed/...`) — measured `ignored: true` at planning time, which would have been a vacuous green per this project's CLAUDE.md formatter-discipline convention.

Per the orchestrator's explicit instruction, the full Backend jest project (221 suites, including the pre-existing unrelated `appShellFlows.test.ts` failure) was never run as a gate for this task — only the scoped `--testPathPattern` filter.

## User Setup Required

None — no external service configuration, no live gate required. The change is desk-verifiable: pinned by unit tests, typecheck, and direct diff review; no runtime app launch or Steam account was needed to prove the logging lines fire or that they omit session material.

## Next Phase Readiness

The todo this quick task resolves is closed. Honest limits recorded in both the todo's resolution section and here: nothing in CI reads `gamelib.log`, so this is a human-reading-path improvement only; the root cause of the specific 2026-10-01 failed QR login attempt that originally motivated the todo remains UNKNOWN and was never in scope to diagnose; the three keyring RPC arms in `src-tauri/src/main.rs` (cross-referenced by the todo as thematically related) remain success-silent and `eprintln!`-based, out of scope by locked decision D-04, and still open.

---
*Quick task: 261001-hd0*
*Completed: 2026-10-01*

## Self-Check: PASSED

- `src/backend/storeManagers/steam/user.ts` — FOUND, contains `QR_LOGIN_TIMEOUT_MS` and `qrLastLoggedStatus`.
- `src/backend/storeManagers/steam/__tests__/user.test.ts` — FOUND, contains the new entry/cancel/challenge/authenticated and poll-transition tests.
- `.planning/todos/completed/2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md` — FOUND, contains `status: RESOLVED` and the `## Resolution (quick 261001-hd0, 2026-10-01)` heading.
- `.planning/todos/pending/2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md` — CONFIRMED ABSENT from the git index.
- Commit `18493ebf5` — FOUND in `git log`.
- Commit `db1b36def` — FOUND in `git log`.
- Commit `24e06e788` — FOUND in `git log`.
