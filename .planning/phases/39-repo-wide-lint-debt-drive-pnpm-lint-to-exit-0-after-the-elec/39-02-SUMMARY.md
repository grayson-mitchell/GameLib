---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
plan: 02
subsystem: backend
tags: [typescript, jest, oauth, login-seam, sidecar, dead-code-collapse]

requires: []
provides:
  - "getLoginWindowSeamOrThrow() accessor in src/backend/humble/loginWindowSeam.ts -- the accessor plans 39-03..39-06 collapse their own getLoginWindowSeam() === null predicates onto"
  - "First dead-seam collapse landed: captureOAuthLogin() no longer carries a null-seam branch or the activeSeam narrowing rebind"
  - "loginWindowSeam.ts and oauthLoginFlowRegistration.ts headers corrected to describe the single-shell (Tauri sidecar) reality instead of a dual Electron/Tauri build"
affects: [39-03, 39-04, 39-05, 39-06, 39-07, 39-08]

tech-stack:
  added: []
  patterns:
    - "Throwing accessor idiom for a module-scoped holder that is always non-null by the time handler-reachable code runs (mirrors platform/index.ts's safeStorage throw-on-use shape) -- getLoginWindowSeam()/setLoginWindowSeam() stay untouched for null-driven tests and the deliberately-kept smoke-test guard"

key-files:
  created: []
  modified:
    - src/backend/humble/loginWindowSeam.ts
    - src/backend/sidecar/oauthLoginCapture.ts
    - src/backend/sidecar/oauthLoginFlowRegistration.ts
    - src/backend/sidecar/__tests__/oauthLoginCapture.test.ts

key-decisions:
  - "getLoginWindowSeamOrThrow() throws rather than non-null-asserting (!) at each call site, so a premise failure is loud and named at the accessor, not a generic 'Cannot read properties of null' at whichever member happens to be touched first"
  - "captureOAuthLogin() now throws SYNCHRONOUSLY when no seam is installed (a wiring bug), rather than resolving a typed outcome -- this is a deliberate divergence from the function's own 'never rejects' doc claim, which describes operational failures, not an unsupported wiring state that cannot occur in production"
  - "Retired TWO tests asserting the removed { status: 'unsupported' } outcome, not the one the plan named -- ground truth (a red test run) showed a second call site (captureOAuthLogin — seam-driven describe, line 248) also asserted the deleted branch directly, not just the registerOAuthLoginFlows forwarding test"

requirements-completed: [REQ-39-03]

duration: 14min
completed: 2026-09-02
---

# Phase 39 Plan 02: Login-seam collapse foundation -- getLoginWindowSeamOrThrow Summary

**Added the throwing `getLoginWindowSeamOrThrow()` accessor five downstream plans will import verbatim, and used it to collapse `captureOAuthLogin()`'s first dead null-seam branch.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-02T10:03:00+12:00 (approx, first commit 10:03:23)
- **Completed:** 2026-09-02T10:16:07+12:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `getLoginWindowSeamOrThrow()` exists in `src/backend/humble/loginWindowSeam.ts`, throws a descriptive error naming the cause (`registerHumbleLoginFlows()` not yet run) and the fix, matching `platform/index.ts`'s `safeStorage` throw-on-use style. `getLoginWindowSeam()`/`setLoginWindowSeam()` keep their exact original signatures.
- `loginWindowSeam.ts`'s header no longer claims a dual Electron/Tauri build; it describes the single shipped build and the seam's role in it.
- `captureOAuthLogin()`'s `seam === null` early return and the `activeSeam` narrowing rebind it required are both gone -- the function now calls `getLoginWindowSeamOrThrow()` once and uses the returned `seam` directly throughout.
- `oauthLoginFlowRegistration.ts`'s doc comment no longer references a hypothetical Electron path or the removed null check.
- Backend test suite green for the target file (55/55) and, excluding two pre-existing unrelated failures, the whole Backend project (4402 passed / 4408 total, the 4 failures and 2 skips confirmed pre-existing and unrelated -- see Deviations).
- `pnpm lint` stays at exactly 4190 warnings, 0 errors -- no net warning increase from this plan's new test code.

## Task Commits

1. **Task 1: Add getLoginWindowSeamOrThrow() and rewrite the module's stale dual-build header** - `7750c4a62` (feat)
2. **Task 2: Collapse captureOAuthLogin's unreachable early return and its two doc comments** - `aee85661c` (feat)
3. **Task 3: Retire the one oauthLoginCapture test that asserted the removed branch** (ground truth: two tests) - `efa7ab6be` (test)

**Plan metadata:** (pending -- see final commit below)

## Files Created/Modified

- `src/backend/humble/loginWindowSeam.ts` - Added `getLoginWindowSeamOrThrow()`; rewrote header to drop the dual-build claim; original accessors unchanged
- `src/backend/sidecar/oauthLoginCapture.ts` - Switched to `getLoginWindowSeamOrThrow()`; removed the null-seam branch and `activeSeam` rebind; renamed all downstream references to `seam`
- `src/backend/sidecar/oauthLoginFlowRegistration.ts` - Corrected doc comment describing the (nonexistent) Electron path and the removed null check
- `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts` - Rewrote two tests that asserted the removed `{ status: 'unsupported' }` outcome (see Deviations); strongly typed the new test's mock to avoid a fresh lint warning

## Decisions Made

- Kept `getLoginWindowSeam()`/`setLoginWindowSeam()` byte-compatible per the plan's binding constraint -- the smoke-test guard at `humbleLoginFlowRegistration.ts:457` (verified untouched, still reads `getLoginWindowSeam()`) and every null-seam test depend on this.
- `captureOAuthLogin()`'s no-seam failure mode changed from "resolve `{ status: 'unsupported' }`" to "throw synchronously." This is a real behavior change, not just an internal refactor: any caller relying on the old resolved-outcome contract would now see a thrown error. The only production caller, `registerOAuthLoginFlows()`'s handler, already wraps the call in `try/catch` and converts any thrown error into `{ status: 'error', message }` -- verified by test, no caller is left unprotected.
- Did not touch the `OAuthCaptureOutcome` union's `'unsupported'` variant (in `src/common/types/oauthLogin.ts`) even though it now has no producer -- widening/narrowing that shared type is outside this plan's scope fence per its own instructions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A second, plan-unlisted test also asserted the removed branch**
- **Found during:** Task 3 verification (running the test file after Task 2's source change)
- **Issue:** The plan named exactly one test to rewrite (the last `it` in `registerOAuthLoginFlows() — registration kind`). Running the suite after Task 2 showed a SECOND, earlier test -- `captureOAuthLogin — seam-driven, deadline-bounded, close-guaranteed › resolves { status: "unsupported" } WITHOUT opening anything when no seam is installed` (line 248) -- also called `captureOAuthLogin` directly with no seam installed and asserted the same removed outcome. Both failed identically: an uncaught throw from `getLoginWindowSeamOrThrow()`.
- **Fix:** Rewrote this test too, renamed to `throws synchronously when no seam is installed (wiring bug, not a supported state)`, asserting the throw via `expect(() => captureOAuthLogin(...)).toThrow(/no login-window seam is installed/)` and that `mockSeamOpen` was never called.
- **Files modified:** `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts`
- **Verification:** `pnpm test --selectProjects Backend -- src/backend/sidecar/__tests__/oauthLoginCapture.test.ts` -> 55/55 passing.
- **Committed in:** `efa7ab6be` (Task 3 commit)

**2. [Rule 2 - Missing Critical] New test's fake-seam mock would have added a lint warning**
- **Found during:** Task 3, after rewriting the `registerOAuthLoginFlows` forwarding test with a local `fakeSeam` fixture mirroring the existing pattern
- **Issue:** `pnpm lint` rose from the 4190-warning baseline to 4191 -- the new fixture's untyped `jest.fn()` for `open` produced a fresh `@typescript-eslint/no-unsafe-return` warning at the new code's line, identical in shape to (but additional to) the three pre-existing instances of the same warning on the file's older, untouched fixture.
- **Fix:** Strongly typed the new mock as `jest.fn<ReturnType<LoginWindowSeam['open']>, Parameters<LoginWindowSeam['open']>>()` instead of a bare `jest.fn()`, eliminating the unsafe-return inference without touching the older, out-of-scope fixture.
- **Files modified:** `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts`
- **Verification:** `pnpm lint` back to exactly 4190 warnings, 0 errors (verified with `.eslintcache` cleared to rule out stale-cache undercounting).
- **Committed in:** `efa7ab6be` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug in scope-of-test-fallout estimate, 1 missing-critical to hold the phase's lint-debt line flat)
**Impact on plan:** Both auto-fixes are directly downstream of Task 2's source change and hold this plan's own acceptance bar (`grep -c "status: 'unsupported'"` returns 0; lint stays green with no new warnings). No scope creep -- neither touches a file outside the plan's declared `files_modified` list.

## Issues Encountered

`pnpm test --selectProjects Backend` (full project) reports 4 failing tests across 2 suites that are pre-existing and unrelated to this plan:

- `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` -- 3 assertions expecting `lzmaDecoderKind()` to report `'native'`, observing `'pure-js'` instead (native lzma addon likely unavailable in this dev sandbox).
- `src/backend/downloadmanager/__tests__/utils.test.ts` -- 1 assertion expecting a bare i18n key (`'box.error.install.stalled'`), observing a namespace-prefixed key (`'gamelib:box.error.install.stalled'`).

Both confirmed pre-existing via `git status`/`git diff` (zero pending changes to either file before this plan started) and by reproducing standalone in isolation (not a full-suite-load artifact). Logged to `.planning/phases/39-.../deferred-items.md` per the Scope Boundary rule -- out of scope for this plan, not fixed.

The target file (`oauthLoginCapture.test.ts`) and every other Backend suite are green: excluding the two pre-existing files, the full run is 4402/4402 passing (4408 total minus the 4 pre-existing failures minus 2 pre-existing skips = 4402), suite count 188/190 passing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `getLoginWindowSeamOrThrow()` is live and ready for plans 39-03 through 39-06 to import verbatim for their own `getLoginWindowSeam() === null` collapses.
- The deliberately-kept smoke-test guard at `humbleLoginFlowRegistration.ts:457` was verified untouched and still compiles against the unchanged `getLoginWindowSeam()` signature.
- `meta/planningGates/34.4.1/seam-parity-sweep-gate.py`'s `EXPECTED_AXIS_A_SITES` floor list still names `oauthLoginCapture.ts:195` as a live `getLoginWindowSeam()` call site -- it is not anymore (collapsed to `getLoginWindowSeamOrThrow()` in this plan). That gate is already hard-red for an unrelated reason (per the plan's own `gate_status_note`) and its disposition is explicitly deferred to plan 39-08; not addressed here, as instructed.
- Two unrelated, pre-existing test failures are logged in `deferred-items.md` for later triage.

---
*Phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec*
*Completed: 2026-09-02*
