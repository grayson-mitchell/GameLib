---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 06
subsystem: steam
tags: [platform-precedence, clock-skew, data-integrity, jest, tdd]

# Dependency graph
requires:
  - phase: 260816-qcn (quick task)
    provides: "resolvePlatformWrite freshest-write-wins precedence decision, shared by games.ts and platformCapture.ts"
provides:
  - "isPlausibleCapturedAt — a single symmetric plausibility predicate (finite, correctly-typed, and no more than 24h ahead of now) applied to BOTH sides of the platform-write timestamp comparison"
  - "A self-healing repair path: a poisoned platformsCapturedAt degrades to writable and is overwritten by the next write, with no Migration involved"
affects: [steam-store-manager, platform-capture, metadata-capture]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Symmetric plausibility bound: one predicate, one clock read (Date.now() captured once), applied to both the stored and incoming values of a comparison, rather than validating only the trusted-looking side"
    - "Degrade-to-writable rather than reject-the-write: an implausible value is treated as 'indefinitely old' (existing side) or clamped to now (incoming side), never thrown, matching the module's existing NaN/wrong-type handling"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/platformPrecedence.ts
    - src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts

key-decisions:
  - "MAX_CLOCK_SKEW_MS = 24 hours, chosen for asymmetric failure cost: a bound too tight loses one legitimate write during ordinary clock skew, while the bug being fixed loses every future write for that appId permanently (37-RESEARCH.md assumption A3 — exact value is implementer discretion, D-17 only requires a bound exist)"
  - "Clamp the incoming capturedAt to now rather than reject the write when implausible (IN-01) — mirrors the existing side's degrade-gracefully philosophy (T-qcn-01) instead of introducing a new failure mode"
  - "D-17 preserved exactly: no comparison against source anywhere in the diff; freshest-write-wins is unchanged, only which timestamps are BELIEVED changed"

requirements-completed: [REQ-37-05]

# Metrics
duration: 55min
completed: 2026-08-22
---

# Phase 37 Plan 06: Bound platformsCapturedAt from above on both sides Summary

**One symmetric plausibility predicate (24h clock-skew bound) applied to both the stored and incoming platform-write timestamps, closing WR-02/IN-01 without changing which source wins a believable comparison**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-22T01:44:00Z (approx, per plan read time)
- **Completed:** 2026-08-22T02:39:37Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- `isPlausibleCapturedAt` is now the ONE definition of "a timestamp I believe" in `platformPrecedence.ts`, subsuming the old finite/type-only check with an upper bound
- The previously-unvalidated incoming `capturedAt` parameter is now validated with the same predicate and clamped to `now` when implausible — closing the IN-01 trap for a future third writer
- A `Number.MAX_SAFE_INTEGER` or ten-years-future existing timestamp no longer wins forever; the next write overwrites it, self-healing at the read boundary with no `Migration` (dead code under Tauri)
- Proved the bound is non-vacuous via a boundless-reimplementation saboteur, and pinned D-17 (freshest-write-wins, no source ranking) with a named, bidirectional test

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — the two bounds tests, RED against today's module** - `9623333d6` (test)
2. **Task 2: One plausibility predicate, applied symmetrically** - `97561af64` (fix)
3. **Task 3: Prove the bound is non-vacuous and that it did not become a ranking** - `ab31282f1` (test)

_No separate plan-metadata commit — per this executor's project-specific hard rules, `.planning/STATE.md` / `ROADMAP.md` are orchestrator-owned this session and must not be touched by this executor._

## Files Created/Modified
- `src/backend/storeManagers/steam/platformPrecedence.ts` - Added `MAX_CLOCK_SKEW_MS` (24h) and `isPlausibleCapturedAt`; both `existingCapturedAt` and `capturedAt` now validated through the same predicate against one `Date.now()` read; extended `resolvePlatformWrite`'s JSDoc with WR-02/IN-01/D-17 rationale
- `src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts` - Added 5 RED-then-GREEN cases (WR-02 a/b/c, IN-01 d/e), a boundless-reimplementation saboteur pinning the bound's non-vacuity, and a named D-17 bidirectional pin

## Decisions Made
- 24h clock-skew bound (see key-decisions above) — deliberately generous over tight, per the plan's explicit asymmetric-cost rationale
- Clamp-to-now rather than reject-the-write for the incoming side, keeping one degrade-gracefully philosophy across both sides of the comparison
- Test cases for the new bound use the real system clock (`Date.now()` inside the module under test) rather than the file's existing fixed-epoch `NOW`/`OLDER`/`NEWER` constants, because the bound is defined relative to the reader's actual clock at call time — the fixed fixtures cannot express "N hours from real now"

## Deviations from Plan

**1. [Rule 1 - Bug] Removed literal `Number.isFinite`/`Date.now()` mentions from new JSDoc prose to satisfy the acceptance-criteria grep gates**
- **Found during:** Task 2, running the acceptance-criteria greps
- **Issue:** The plan's own acceptance criteria require `grep -c "Number.isFinite"` and `grep -c "Date.now()"` to each return exactly 1 in the file (proving no second inline predicate / no second clock read was left beside the new one). My first draft of the extended JSDoc referenced both literal strings in prose while explaining the history, pushing both counts to 2–3 even though there was still only one real predicate and one real clock read in the code.
- **Fix:** Reworded the prose to describe the old behaviour without repeating the exact literal strings (e.g. "a correctly-typed, finite but absurdly-large value... passed that check" instead of quoting `Number.isFinite`; "the current wall-clock time" instead of quoting `Date.now()`), while the code itself is unchanged from Task 2's design.
- **Files modified:** `src/backend/storeManagers/steam/platformPrecedence.ts` (comment-only edits, no logic change)
- **Verification:** `grep -c "Number.isFinite"` → 1; `grep -n "Date.now()"` → single hit inside `resolvePlatformWrite`; full test suite still green; `tsc --noEmit` and `eslint` still clean
- **Committed in:** `97561af64` (part of Task 2 commit — caught before commit, not a follow-up fix)

---

**Total deviations:** 1 auto-fixed (Rule 1, comment-wording only — no behavior change)
**Impact on plan:** Zero functional impact; purely a wording adjustment to satisfy the plan's own literal-grep acceptance gates without leaving a misleading second occurrence for a future reader to trip on.

## Issues Encountered
None beyond the deviation above.

## Verification Results

- `npx jest src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts src/backend/storeManagers/steam/__tests__/platformCapture.test.ts src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts --silent` — 79/79 passed (23 in platformPrecedence.test.ts after Task 3)
- `npx tsc --noEmit -p tsconfig.json` — clean, no errors (confirmed after Task 2)
- `npx eslint src/backend/storeManagers/steam/platformPrecedence.ts -f json` — `errorCount: 0`, `warningCount: 0`
- `grep -c "Number.isFinite" platformPrecedence.ts` → `1`
- `grep -n "Date.now()" platformPrecedence.ts` → single hit at line 162, inside `resolvePlatformWrite`
- `grep -cE "'pics'|'appdetails'" platformPrecedence.ts` → `2`, unchanged from the pre-task value (both are prose mentions in the pre-existing top-of-function JSDoc, not new comparisons); `git diff` confirms no new `source ===` comparison anywhere in the diff — the D-17 gate
- `grep -ci "migration"` → 3 hits, all inside comments explaining `Migration`/`MigrationSystem` is dead code under Tauri and NOT used here — no class, import, or registration
- **Task 1 RED confirmation:** cases (a) WR-02 MAX_SAFE_INTEGER, (b) WR-02 ten-years-future, (d) IN-01 MAX_SAFE_INTEGER incoming, (e) IN-01 NaN/undefined incoming all failed against the unmodified module (`Expected: true, Received: false` for a/b; `expect(received).not.toBe(expected) ... 9007199254740991` for d; similar for e). Case (c), the one-minute-ahead boundary guard, was already green — confirmed among the 16 passing pre-fix tests.
- **Task 3 mutation check 1** (bound raised to `Number.MAX_SAFE_INTEGER`): cases (a), (b), (d) plus the new boundless-saboteur comparison test all failed (4 failures) — confirms raising the bound makes the real function collapse onto the boundless (pre-fix) behaviour, i.e. the bound is doing real work.
- **Task 3 mutation check 2** (bound lowered to `1000`ms): exactly case (c), the one-minute boundary guard, failed (1 failure, 22 passed) — confirms the boundary case is genuinely discriminating and not trivially satisfied.
- Tree restored after both mutation checks: `git diff src/backend/storeManagers/steam/platformPrecedence.ts` shows no pending change (MAX_CLOCK_SKEW_MS is back at `24 * 60 * 60 * 1000`, matching the already-committed Task 2 state).
- `pnpm test:ci` — 311/312 suites passed, 6439/6443 tests passed, 3 skipped. Sole failure: `meta/__tests__/genI18nGateScope.test.ts` "A-17 ANTI-ROT" — a pre-existing, documented known-red baseline unrelated to this plan (the committed `meta/i18nForkTouchedFiles.json` lists files since deleted by other work on this branch). Not caused by this plan and not fixed, per this executor's hard rules.
- `git stash list` — empty throughout and at completion.
- No `gsd-sdk state.*` or `roadmap.update-plan-progress` verb invoked; no `git reset`/`git stash` run.

## TDD Gate Compliance

Task 1's tests are not a plan-level `type: tdd` gate (this plan's frontmatter is `type: execute`), but Task 1 explicitly required and confirmed a RED phase before Task 2's GREEN implementation:
- RED: `9623333d6` (`test(37-06): add RED tests pinning an upper bound...`), 4/5 new cases failing, 1/5 already passing (the boundary guard)
- GREEN: `97561af64` (`fix(37-06): bound platformsCapturedAt from above...`), all cases passing
- Additional non-vacuity/D-17 pins: `ab31282f1` (`test(37-06): prove the 24h bound is non-vacuous...`)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`REQ-37-05` is complete. The precedence module (`platformPrecedence.ts`) now has no known asymmetry between its two comparison sides and self-heals a poisoned stored timestamp at the read boundary. No blockers for downstream 37-series plans; this plan touched only `platformPrecedence.ts` and its dedicated test file, with no overlap with 37-03a/37-04's already-landed changes.

---
*Phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam*
*Completed: 2026-08-22*
