---
phase: 26-steam-key-redemption
plan: 02
subsystem: ui
tags: [validation, typescript, jest, steam-key-redemption]

# Dependency graph
requires:
  - phase: 26-01
    provides: backend redeemKey() IPC path (SteamUser.redeemKey, redeemSteamKey handler/preload/types)
provides:
  - normalizeKey(raw) and isObviouslyMalformed(raw) pure functions in src/frontend/helpers/steamKeyValidation.ts
  - Table-driven Jest test covering reject/accept cases including explicit over-rejection guards
affects: [26-04 (RedeemSteamKeyDialog — imports this validator before calling the IPC redeem path)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, colocated-but-testMatch-compliant validator module (no IPC/DOM dependency), tested via table-driven it.each"

key-files:
  created:
    - src/frontend/helpers/steamKeyValidation.ts
    - src/frontend/helpers/__tests__/steamKeyValidation.test.ts
  modified: []

key-decisions:
  - "Test file placed in src/frontend/helpers/__tests__/ (not colocated as the plan literally specified) because both src/frontend/jest.config.js and src/backend/jest.config.js enforce testMatch: ['**/__tests__/**/*.test.ts'] project-wide — a colocated test file is never discovered by Jest regardless of the CLI pattern passed. This matches the codebase's actual existing convention (every other frontend test lives under __tests__/)."
  - "Avoided the literal '{5}' substring anywhere in steamKeyValidation.ts, including in prose comments explaining the forbidden anti-pattern, since the acceptance-criteria grep for '{5}' is a whole-file literal-string check (same lesson as Phase 21-02's '@node-steam/vdf' comment exclusion)."

patterns-established:
  - "Client-side format validators are pure functions with no IPC/DOM coupling, unit-tested independently of the component that consumes them (26-04 imports this module rather than reimplementing validation inline)."

requirements-completed: [REQ-26-03]

# Metrics
duration: 8min
completed: 2026-07-20
---

# Phase 26 Plan 02: Steam Key Format Validator Summary

**Pure `normalizeKey`/`isObviouslyMalformed` client-side validator (light-touch length/charset check, explicitly not a 5-5-5 regex) with a 9-case table-driven Jest test, gating the redeem dialog's IPC call per SPEC REQ3/D-09.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-20T02:44:00Z
- **Completed:** 2026-07-20T02:52:23Z
- **Tasks:** 1 completed
- **Files modified:** 2

## Accomplishments

- `normalizeKey(raw)` trims + uppercases input for consistent downstream comparison/send
- `isObviouslyMalformed(raw)` rejects empty/whitespace, out-of-range length (<10 or >40 chars), and bad-charset input via `/^[A-Z0-9-]+$/`, without anchoring to a 5-5-5 shape — deliberately accepts non-standard valid key shapes (D-09/SPEC REQ3 "must not over-reject")
- Table-driven test (`it.each`) covers both reject and accept cases, including the two required over-rejection guards: a long non-dashed key and a lowercase-then-normalized standard 5-5-5 key, both asserting `false`

## Task Commits

Each task was committed atomically:

1. **Task 1: normalizeKey + isObviouslyMalformed pure functions with table-driven test** - `a3fa3c0f` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `src/frontend/helpers/steamKeyValidation.ts` - Exports `normalizeKey` and `isObviouslyMalformed`; light-touch length/charset validator, no 5-5-5 anchoring
- `src/frontend/helpers/__tests__/steamKeyValidation.test.ts` - Table-driven Jest test (9 cases) covering empty/whitespace, length bounds, charset, and over-rejection guards

## Decisions Made

- Test placed under `src/frontend/helpers/__tests__/` rather than colocated next to the source file, to match this project's Jest `testMatch` convention (`**/__tests__/**/*.test.ts` in both `src/frontend/jest.config.js` and `src/backend/jest.config.js`). A colocated file at the plan-literal path would silently never run.
- Comment explaining the forbidden 5-5-5 anti-pattern was worded to avoid the literal `{5}` substring anywhere in the file, since the acceptance-criteria grep check scans the whole file text, not just code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved test file into `__tests__/` to match enforced Jest `testMatch` convention**
- **Found during:** Task 1 (writing the test file at the plan's literal colocated path)
- **Issue:** The plan specified `src/frontend/helpers/steamKeyValidation.test.ts` (colocated with the source file) and its `<verify>` command was `npx jest src/frontend/helpers/steamKeyValidation.test.ts`. Both `src/frontend/jest.config.js` and `src/backend/jest.config.js` set `testMatch: ['**/__tests__/**/*.test.ts']` project-wide — a colocated test file at that path is never discovered by Jest, so the specified verify command would always report "no tests found" regardless of what CLI pattern is passed.
- **Fix:** Created the test at `src/frontend/helpers/__tests__/steamKeyValidation.test.ts` instead (adjusting the relative import to `../steamKeyValidation`), matching the codebase's existing, consistently-applied convention (every other frontend/backend test file already lives under a `__tests__/` directory).
- **Files modified:** `src/frontend/helpers/__tests__/steamKeyValidation.test.ts` (created at this path instead of the literal plan path)
- **Verification:** `npx jest src/frontend/helpers/__tests__/steamKeyValidation.test.ts` — 9/9 tests pass
- **Committed in:** `a3fa3c0f` (Task 1 commit)

**2. [Rule 3 - Blocking] Reworded the anti-pattern comment to avoid a literal `{5}` substring**
- **Found during:** Task 1 (acceptance-criteria self-check: grep for `{5}` returning no match)
- **Issue:** An initial explanatory comment quoted the forbidden regex verbatim (`/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/`), which itself contains the literal `{5}` string the acceptance criteria's grep check scans the whole file for — a prose explanation would have failed the same grep the code is required to pass.
- **Fix:** Reworded the comment to describe the anti-pattern ("5-block-of-5-chars anchored regex") without spelling out the literal quantifier syntax.
- **Files modified:** `src/frontend/helpers/steamKeyValidation.ts`
- **Verification:** `grep -n '{5}' src/frontend/helpers/steamKeyValidation.ts` returns no match (exit 1)
- **Committed in:** `a3fa3c0f` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both required to make the plan's own stated verification steps actually pass)
**Impact on plan:** No scope creep — both fixes were required purely to satisfy the plan's own acceptance criteria against the project's real Jest configuration and grep check. No behavior change to the validator logic itself, which matches the plan's `<interfaces>` spec verbatim.

## Issues Encountered

None beyond the two deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `normalizeKey`/`isObviouslyMalformed` are ready for 26-04's `RedeemSteamKeyDialog` to import directly (per 26-PATTERNS.md's documented `onRedeem()` usage: malformed input short-circuits before any `window.api.redeemSteamKey` call)
- No blockers for 26-03/26-04

---
*Phase: 26-steam-key-redemption*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: src/frontend/helpers/steamKeyValidation.ts
- FOUND: src/frontend/helpers/__tests__/steamKeyValidation.test.ts
- FOUND: .planning/phases/26-steam-key-redemption/26-02-SUMMARY.md
- FOUND: commit a3fa3c0f
- FOUND: commit aae5db68
