---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
plan: 05
subsystem: backend
tags: [humble, login-window-seam, dead-code-collapse, jest, tauri]

# Dependency graph
requires:
  - phase: 39-04
    provides: "disconnect()/logout() seam-only collapse precedent; scoped fake-seam beforeEach/afterEach test pattern"
provides:
  - "HumbleUser.getLiveCsrfToken() on a single seam-only path (session.fromPartition fallback removed)"
  - "checkHealthAndFlagExpiry()'s csrf_cookie backfill on a single seam-only path (Electron arm removed)"
affects: [39-06, 39-07, 39-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getLoginWindowSeamOrThrow() called as a bare statement (no unused binding) when a call site only needs the seam-installed precondition, not the seam value itself"

key-files:
  created: []
  modified:
    - src/backend/humble/user.ts
    - src/backend/humble/__tests__/user.test.ts

key-decisions:
  - "getLiveCsrfToken() keeps a bare `getLoginWindowSeamOrThrow()` call (result unused) rather than binding to `seam` -- the function never reads through the seam, it only requires one to be installed as a precondition; binding an unused `seam` would trip @typescript-eslint/no-unused-vars"
  - "Deleted 5 tests across the two functions, each replaced with a comment naming its exact covering twin, per the phase's named-deletion discipline (threat T-39-22)"

requirements-completed: []
# REQ-39-03 spans plans 39-02..39-07; this plan advances it but does not close it.

# Metrics
duration: 35min
completed: 2026-09-02
---

# Phase 39 Plan 05: Humble getLiveCsrfToken / checkHealthAndFlagExpiry Seam Collapse Summary

**Collapsed `getLiveCsrfToken()`'s inverted seam guard and `checkHealthAndFlagExpiry()`'s csrf backfill branch to a single `getLoginWindowSeamOrThrow()` path, deleting the now-unreachable `session.fromPartition` Electron arms and re-pointing 5 tests with named covering twins.**

## Performance

- **Duration:** 35 min
- **Tasks:** 2/2 completed
- **Files modified:** 2

## Accomplishments

- `getLiveCsrfToken()` no longer branches on `seam !== null` — it always requires the seam via `getLoginWindowSeamOrThrow()` and always returns the stored snapshot, with the doc comment rewritten to explain why (no live login window exists at reveal time under the single Tauri-seam build).
- `checkHealthAndFlagExpiry()`'s csrf_cookie backfill no longer branches on `seam === null` — it always takes the seam-driven hidden-window open/read/close path that used to be the `else` arm only.
- Both `session.fromPartition(HUMBLE_LOGIN_PARTITION)` occurrences this plan targeted are deleted; verified by exact line-content review (not just line count) that the 2 remaining occurrences belong to `watchForLogin()` / `finishLogin()`, both explicitly out of scope for this plan (plan 39-06 territory).
- 5 tests deleted, each with an inline comment naming its exact covering twin test; 2 tests re-pointed to install a scoped fake seam locally to their own `describe` block, matching 39-04's established pattern.
- Backend humble test file: 85 → 80 tests, all passing in isolation.

## Task Commits

1. **Task 1: Collapse getLiveCsrfToken/checkHealthAndFlagExpiry to seam-only path** - `3ddfef7d5` (feat)
2. **Task 2: Re-point tests broken by the collapse** - `3b33a2177` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/backend/humble/user.ts` - `getLiveCsrfToken()` and `checkHealthAndFlagExpiry()`'s csrf backfill both collapsed to unconditional `getLoginWindowSeamOrThrow()` paths; `session.fromPartition` fallback/Electron arms deleted (163 lines touched: 56 insertions, 107 deletions)
- `src/backend/humble/__tests__/user.test.ts` - 5 tests deleted (each naming its covering twin), 2 tests re-pointed with a scoped fake-seam `beforeEach`/`afterEach` local to the `getLiveCsrfToken()` describe block (173 lines touched: 61 insertions, 112 deletions)

## Decisions Made

- Kept `getLoginWindowSeamOrThrow()` as a bare statement in `getLiveCsrfToken()` rather than binding its return value, since the function's own logic never reads through the seam (there is no live login window at reveal time) — it only needs the seam-installed precondition enforced. Binding an unused `const seam = ...` would have introduced a new `@typescript-eslint/no-unused-vars` lint error under this repo's `varsIgnorePattern: '^_'` config.
- Followed 39-04's precedent exactly for the test re-pointing pattern: scoped `beforeEach(() => { installFakeSeamDefaults(); setLoginWindowSeam(fakeSeam) })` / `afterEach(() => { setLoginWindowSeam(null) })` local to the `describe('getLiveCsrfToken() (WR-03)', ...)` block, rather than promoting the fake-seam install to module scope (which would affect unrelated describes in the same file).

## Test Deletions — Named, With Reason

**`checkHealthAndFlagExpiry()` csrf backfill (2 deletions):**

1. `'backfills a missing csrfToken from the partition when the session is healthy (ok)'` — deleted. Drove the now-deleted `seam === null` / `session.fromPartition` Electron arm. Covering twin: `describe('checkHealthAndFlagExpiry() — csrf_cookie backfill seam path (S-09, Plan 18)')` → `'opens a temporary hidden window, reads csrf_cookie through the seam, stores it, and closes the window'`.
2. `'backfill is non-fatal when the partition has no csrf_cookie or the read throws'` — deleted. Same dead branch. Covering twins: `'a rejecting cookie read is non-fatal, and the window is still closed exactly once'` and `'a rejecting seam.open() is non-fatal and never attempts a close (no window to leak)'`.

Unchanged: `'does NOT re-fetch/overwrite csrfToken when one is already cached'` — short-circuits at the `!(await HumbleUser.getCsrfToken())` guard before the seam is ever reached, unaffected by the collapse.

**`getLiveCsrfToken()` (3 deletions, 2 re-pointed):**

3. `'returns the live partition csrf_cookie value when present...'` — deleted. Drove the deleted live-read branch. Covering twin: `describe('login window seam path (Phase 34.4.1 Plan 03)')` → `'getLiveCsrfToken() returns the stored snapshot directly when a seam is installed, without touching session.fromPartition'`.
4. `'falls back to the stored snapshot when the partition has no csrf_cookie'` — deleted, same twin as above.
5. `'falls back to the stored snapshot when the partition read throws (non-fatal)'` — deleted, same twin as above (the collapsed function has no partition read left to throw).
6. `'returns undefined when no stored snapshot exists'` — re-pointed: now installs a scoped fake seam via local `beforeEach`, still asserts the underlying invariant (no snapshot → `undefined`) which is orthogonal to the collapse.
7. `'never logs the stored csrf value it returns'` — re-pointed the same way; asserts the secrecy invariant is preserved regardless of which path reads the seam.

## Deviations from Plan

### Corrected plan predictions (verified against ground truth, no code changes required)

The plan's acceptance criteria made three numeric predictions about the file's shape that did not match the actual pre-change file. Each was investigated by direct grep + full read of the surrounding function before treating it as a discrepancy, consistent with 39-04's own scope-correction precedent.

**1. `session.fromPartition(HUMBLE_LOGIN_PARTITION)` count — plan predicted 3 remaining, ground truth is 2.**
The plan attributed 3 separate occurrences to plan 39-06: one inside `watchForLogin()`, one inside a `checkCookie()` helper, one inside `finishLogin()`. Reading `watchForLogin()` in full showed `checkCookie()` is nested inside it and reuses the closure variable `ses` (`ses!.cookies.get(...)`) rather than making its own independent `session.fromPartition()` call. The real pre-change total was 4 occurrences (lines 195, 279, 754, 878 in the original file); this plan's Task 1 deleted 2 of them (195, 878), leaving exactly 2 post-edit (now at lines 259 in `watchForLogin`, 734 in `finishLogin`) — not 3. Verified via `grep -n "session.fromPartition(HUMBLE_LOGIN_PARTITION)" src/backend/humble/user.ts` after the Task 1 commit.

**2. Bare `getLoginWindowSeam()` (nullable accessor) count — plan predicted 1 remaining, ground truth is 2.**
The plan expected only `watchForLogin()`'s own `const seam = getLoginWindowSeam()` declaration to remain. `finishLogin()` makes an independent call to the same nullable accessor at its own line (post-edit line 721) — a second, separate call site untouched by this plan (plan 39-06 territory). Verified by reading both functions in full; 2 real call sites remain (plus 1 comment mention, for 3 total substring matches).

**3. `expect(mockFromPartition)` assertion count — plan predicted "strictly lower than pre-change," ground truth is unchanged at 5.**
Both `git show HEAD~2:src/backend/humble/__tests__/user.test.ts | grep -c 'expect(mockFromPartition)'` (pre-change) and the post-Task-2 count returned 5. Investigated all 5 occurrences (at approximate lines 451, 915, 1544, 1590, 1669 post-edit) individually: none belong to any of the 5 tests deleted/re-pointed in Task 2. All 5 belong either to plan-39-06 territory (`startLogin`/`reconnect`/`watchForLogin`'s own Electron-regression coverage) or to pre-existing, untouched seam-path tests (`getLiveCsrfToken()`'s "seam installed → never touches session.fromPartition" test, and `checkHealthAndFlagExpiry()`'s equivalent) that already asserted `mockFromPartition` non-invocation before this plan ran. None of the 5 deleted/re-pointed tests ever contained a `mockFromPartition` assertion — they asserted on `mockCookiesGet` (the session-instance mock), not the outer factory mock, so there was no assertion count for this plan's own changes to lower.

**Impact on plan:** None of these are code defects — they are corrections to the plan's own acceptance-criteria text, made transparent here per the phase's established scope-correction discipline. No additional code changes were required; the actual collapse (both functions, seam-only) is complete and matches every other must-have truth in the plan.

**Total deviations:** 0 auto-fixed (Rules 1-4 did not trigger); 3 plan-prediction corrections documented above.

## Issues Encountered

**Full-suite-under-load flakiness (not a regression):** Three consecutive `npx jest --selectProjects Backend` runs produced three different failure sets (`bootstrapWirings.test.ts` + `lzmaNativeSeaRealBuild.test.ts` + `depot.test.ts` SIGTERM; then `downloadmanager/utils.test.ts` + `decompressPool.test.ts`; then those two plus `lzmaNativeSeaRealBuild.test.ts` timeout again). None of these files were touched by this plan. Resolved by running a targeted, deterministic isolated pass covering exactly this plan's touched surface plus its direct neighbors:

```
npx jest --selectProjects Backend --testPathPattern \
  "humble/__tests__/user.test.ts|sidecar/__tests__/seamBranchParity.test.ts|sidecar/__tests__/humbleFlows.test.ts|legendary/__tests__/user.test.ts"
```

Result: 4 suites, 4 passed, 155 tests, 155 passed, 0 failed. This is the authoritative evidence for this plan's correctness, per the project's standing rule to isolate-verify suspect files rather than trust a single full-suite run under load.

`decompressPool.test.ts` was additionally isolate-verified alone; its failure (`Expected: "native", Received: "pure-js"`) matches the documented pre-existing defect exactly and is unrelated to this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Both `getLiveCsrfToken()` and `checkHealthAndFlagExpiry()`'s csrf backfill are now on a single, seam-only path (`getLoginWindowSeamOrThrow()`), matching the pattern plan 39-04 established for `disconnect()`/`logout()`. The 2 `session.fromPartition` occurrences and 2 bare `getLoginWindowSeam()` call sites remaining in `watchForLogin()`/`finishLogin()`/`checkCookie()` are fully protected and verified untouched by exact grep-plus-full-read evidence — plan 39-06 has an accurate, corrected picture of its own remaining scope (2 `session.fromPartition` sites, not 3; 2 bare `getLoginWindowSeam()` call sites, not 1).

- `pnpm codecheck`: clean.
- `pnpm lint`: 0 errors, 4157 warnings (down from the 4165-warning baseline recorded before this plan).
- Backend humble test file: 80/80 passing (85 → 80 after 5 named deletions).
- No new lint warnings introduced.

---
*Phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec*
*Completed: 2026-09-02*

## Self-Check: PASSED

- FOUND: commit `3ddfef7d5` (feat -- collapse getLiveCsrfToken/checkHealthAndFlagExpiry)
- FOUND: commit `3b33a2177` (test -- re-point tests broken by the collapse)
- FOUND: `src/backend/humble/user.ts`
- FOUND: `src/backend/humble/__tests__/user.test.ts`
- Verified: no diff to `.planning/STATE.md`, `.planning/ROADMAP.md`, or `.planning/REQUIREMENTS.md` since before this plan started
- Verified: `git status --short` shows no unintended changes (only the pre-existing, unrelated `.planning/phases/40-.../` untracked directory)
