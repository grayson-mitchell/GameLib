---
phase: quick-260805-rwy
plan: 01
subsystem: ui
tags: [react, i18next, login-screen, source-gate-testing]

# Dependency graph
requires: []
provides:
  - Manage Accounts (Login) page renders without the "Login with your platform..." paragraph
  - Source-text gate in Login/__tests__/index.test.tsx preventing the string's silent return
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/frontend/screens/Login/index.tsx
    - src/frontend/screens/Login/__tests__/index.test.tsx

key-decisions:
  - "D-01: public/locales/**  left untouched — login.message stays in ~38 catalogs by choice, repo's own translation linter tolerates orphaned keys"
  - "D-02: index.scss left untouched — .runnerMessage (index.scss:157) is now a deliberately-retained dead rule, not an oversight, to keep the diff to a single source file"
  - "D-03: deleted the loginMessage const, not just its JSX render site, to avoid an unused-var lint error and to make the source-gate honest"

requirements-completed: [QUICK-260805-RWY]

# Metrics
duration: 10min
completed: 2026-08-05
---

# Quick Task 260805-rwy: Remove Manage Accounts Login Text Summary

**Deleted the "Login with your platform..." paragraph and its `loginMessage` const from `Login/index.tsx`, backed by a new source-text gate; Task 1 (code) is committed, Task 2 (human visual verification) is a pending checkpoint.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1 of 2 completed (Task 2 is `checkpoint:human-verify`, not executable by this agent)
- **Files modified:** 2

## Accomplishments
- Removed the `const loginMessage = t('login.message', ...)` declaration (was lines 87-90) from `Login/index.tsx`
- Removed the `<p className="runnerMessage">{loginMessage}</p>` render line (was line 154), leaving the neighbouring `disabledMessage` (old-macOS warning) paragraph untouched
- Added a new `describe` block to `Login/__tests__/index.test.tsx` with a negative source-text gate (proves `loginMessage`, `login.message`, `runnerMessage`, and the sentence fragment are all gone) and a positive control (proves `disabledMessage`, `runnerGroup`, and all six runner tiles — epic, gog, nile, zoom, steam, humble — survived)

## Task Commits

Task 1 was committed atomically:

1. **Task 1: Remove the login message paragraph and gate its removal** - `22824ebb9` (feat)

Task 2 (`checkpoint:human-verify`) was not attempted by this agent per plan instructions — it requires a human to visually confirm the page layout, which cannot be automated (this jest project runs with `testEnvironment: 'node'`, no jsdom, so no render/layout assertions are possible here).

**Plan metadata:** not yet committed (docs commit is the orchestrator's responsibility per task instructions)

## Files Created/Modified
- `src/frontend/screens/Login/index.tsx` - Deleted the `loginMessage` const and its `<p className="runnerMessage">` render site; `t`, `useTranslation()`, and the `useEffect` dependency array were left intact since `t` has many other callers in this file
- `src/frontend/screens/Login/__tests__/index.test.tsx` - Added a source-text gate `describe` block (negative assertions + positive control) following the file's existing `read()`/`LOGIN_TSX` conventions

## Decisions Made
- D-01: `public/locales/**` untouched — deleting `login.message` across ~38 catalogs is unnecessary upstream-merge conflict surface for zero user-visible benefit; the repo's `meta/lintTranslations.ts` already tolerates orphaned catalog keys (`printExtraTransations = false`)
- D-02: `index.scss` untouched — `.runnerMessage` (index.scss:157) is now dead CSS, left in place deliberately to keep this diff to two files and avoid an upstream merge conflict for a 6-line rule that costs nothing at runtime. **Recorded here explicitly so a future reader does not file it as an oversight.**
- D-03: Deleted the `loginMessage` const along with the JSX, not just the JSX — an unused const would trip `@typescript-eslint/no-unused-vars` and would also defeat the new source-text gate (the removed string would still be present in the file, just unused)

## Deviations from Plan

None - plan executed exactly as written. The trailing-comment gotcha from `<gotchas>` did not arise: no comment referencing the removed string, const, or class name was added to `index.tsx`.

## Issues Encountered

None. The full Frontend jest project (452/452 tests, 40 suites) stayed green, and `pnpm exec eslint` on both changed files reported 0 errors (3 pre-existing warnings, all outside the diff: one on line 37 of `index.tsx` predates this change, two on lines 198/204 of the test file belong to the pre-existing 260805-d62 test block).

`git diff --name-only` for this commit lists exactly the two files named in the plan's frontmatter (`Login/index.tsx`, `Login/__tests__/index.test.tsx`) — no `public/locales/` file and not `index.scss` appear.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Task 1 (code + automated gate) is complete and committed. **Task 2 — a `checkpoint:human-verify` — is still pending**: a developer needs to run `pnpm dev` (or `pnpm tauri:dev`), navigate to the Manage Accounts page, confirm the sentence is gone, and confirm header-to-runner-group spacing still looks correct with the paragraph removed. See the plan's Task 2 `<how-to-verify>` steps. This plan is NOT closed until that checkpoint is approved.

---
*Quick task: 260805-rwy*
*Completed: 2026-08-05 (Task 1 only; Task 2 checkpoint pending)*
