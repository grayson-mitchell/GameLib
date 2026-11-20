---
phase: quick-261011-jj1
plan: 01
subsystem: ui
tags: [scss, css-specificity, react, i18next, jest, winetricks]

requires:
  - phase: quick-261011-hh5
    provides: "the Settings dialog paper min-width release that this plan's two narrower, rigid floors sat below"
provides:
  - "a top-level 0,3,0 override rule releasing the GamesSettings 500px section floor for the Winetricks tab's three groups"
  - "a shrinkable, ellipsis-truncating cached badge with a title tooltip, sharing the row title's flex weight"
  - "specificity + CSS-rule-parsing jest helpers (splitTopLevel, specificity, compareSpecificity, parseRules, effectiveDecls, beatsSectionFloor, cachedBadgeYields) reusable by future WinetricksSettings CSS pins"
affects: [winetricks, settings-dialog, css-specificity-pins]

actuals:
  tokens: 5367
  tasks: 3
  commits: 3
  plan_head_before: b7f8a392492912deda24858056c510ef557c2dea
  plan_head_after: 6c56101d930ff130f4812bc3f1bf62bad3d0169f

tech-stack:
  added: []
  patterns:
    - "Computed CSS specificity (not assumed stylesheet load order) used to prove one selector strictly out-specifies another, with a hand-rolled left-to-right specificity scorer that throws on selector text it cannot score (#, [, ::, *, :where(, :has() rather than silently mis-scoring"

key-files:
  created: []
  modified:
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx
    - .planning/todos/completed/2026-10-11-winetricks-tab-keeps-two-rigid-width-floors-at-narrow-windows.md

key-decisions:
  - "Chose a top-level :is(.settingsDialogContent, .settingsWrapper) .WinetricksSettings :is(.WinetricksSuggested, .WinetricksTaskGroup, .WinetricksEverythingElse) rule at specificity 0,3,0, strictly above the GamesSettings floor's 0,2,1 in any stylesheet load order, over two 0,2,1 shapes that would only tie the floor and win by load order"
  - "Cached badge shrinks at the SAME flex weight as the row title (flex: 0 1 auto), not a lower fractional factor, because a lower factor drives the title to zero width first (its own floor is min-width: 0) before the badge yields -- accepting, as the cost, that the German badge may now ellipsize slightly earlier at moderate widths such as the ~700px paper 261011-hh5 was proven against"
  - "padding-top: var(--space-xl) on the GamesSettings floor rule is deliberately left reaching the three groups; whether that is wanted spacing or an unrelated carry-over stays an open, recorded, unanswered design question"

requirements-completed: [45-12-G1, D-02, D-21]

duration: "commits span 2026-10-11T14:28:53+13:00 to 2026-10-11T14:34:10+13:00; session start not separately logged"
completed: 2026-10-11
status: complete
---

# Quick Task 261011-jj1: Winetricks narrow-window width floors Summary

Released the GamesSettings 500px section floor for the Winetricks tab's three groups with a
computed-specificity 0,3,0 override rule, and let the rigid cached badge shrink with an ellipsis
at the row title's own flex weight, recovering its full label on hover via a native `title`
attribute.

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 SCSS, 1 TSX, 2 jest test files, 1 todo moved+edited)
- **Commits:** 3 task commits (this SUMMARY and STATE.md updates are the orchestrator's docs commit, not included here)

## Accomplishments

- The tab's three `<section>` groups (`WinetricksSuggested`, `WinetricksTaskGroup`,
  `WinetricksEverythingElse`) now win `min-width: 0` against the GamesSettings 500px section
  floor in any stylesheet load order, without editing `GamesSettings/index.scss` and without
  `!important`.
- `.WinetricksRow__cached` is split from the rigid `.WinetricksRow__category` rule and now
  shrinks with an ellipsis at the title's own flex weight, so it can no longer paint over the
  row's fixed 12rem status slot. Its full localised label is recoverable via `title={cachedLabel}`.
- `tokenCensus.test.ts` gained a reusable specificity scorer and CSS-rule parser (`specificity`,
  `compareSpecificity`, `parseRules`, `effectiveDecls`, `beatsSectionFloor`, `cachedBadgeYields`)
  that future Winetricks CSS-cascade pins can reuse.
- The residual todo is closed with a Resolution recording both fixes, the open padding-top
  question, and the still-owed `de`-locale live capture.

## Task Commits

1. **Task 1: Release the GamesSettings 500px section floor** - `a653147` (fix, tdd=true, type=tracer)
2. **Task 2: Let the cached badge shrink with an ellipsis and a full-label tooltip** - `9534d25` (fix, tdd=true)
3. **Task 3: Close the todo with a Resolution** - `ffd2151` (docs)

_Both code tasks were TDD: each is a single commit carrying both the new/extended tests and the
implementation, per the plan's "commit only these N files" instruction — RED was observed and
discarded before GREEN was committed, matching the plan's commit-scope contract._

## RED -> GREEN Evidence

**Task 1 (tokenCensus.test.ts only):**
- RED: `Tests: 4 failed, 29 passed, 33 total` — exactly the three `it.each` real-file cases
  (`WinetricksSuggested`, `WinetricksTaskGroup`, `WinetricksEverythingElse`) plus the
  "override declares min-width only" test, matching the plan's prediction exactly.
- GREEN (same file, after adding the override rule to `WinetricksSettings/index.scss`):
  `Tests: 33 passed, 33 total`.

**Task 2 (tokenCensus.test.ts + rowStates.test.tsx):**
- RED: `Tests: 3 failed, 71 passed, 74 total` — exactly the real-file `cachedBadgeYields` test,
  the badge/title flex-parity test, and the new rowStates "title equals text" test, matching the
  plan's prediction exactly.
- GREEN (same two files, after splitting the badge rule in `Row/index.scss` and adding
  `title={cachedLabel}` in `Row/index.tsx`): full WinetricksSettings directory run —
  `Tests: 226 passed, 226 total` (13 suites).

## Verify Outcomes (exact, as run)

**Task 1:**
- `pnpm jest .../tokenCensus.test.ts --selectProjects Frontend` → `Tests: 33 passed, 33 total`.
- `git diff --quiet b7f8a3924 -- GamesSettings/index.scss EverythingElseGroup/index.scss InstallModal/index.scss public/locales` → exit 0, "floor, Everything-else, InstallModal and locales byte-unchanged".
- `npx eslint .../tokenCensus.test.ts && pnpm codecheck` → both exit 0 (after adding, then removing, an `eslint-disable-next-line @typescript-eslint/no-unused-vars` on `effectiveDecls` — see Deviations).
- Scoped `npx prettier --file-info` on both Task 1 paths → both report `"ignored": false`; `npx prettier --check` initially flagged `tokenCensus.test.ts`, fixed with `--write` (formatting only), then `--check` passed and jest was re-run GREEN.

**Task 2:**
- `pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings --selectProjects Frontend` → `Test Suites: 13 passed, 13 total`, `Tests: 226 passed, 226 total`.
- `git diff --quiet b7f8a3924 -- public/locales GamesSettings/index.scss` → exit 0, "locales and GamesSettings floor byte-unchanged".
- `npx eslint Row/index.tsx tokenCensus.test.ts rowStates.test.tsx && pnpm codecheck` → both exit 0.
- Scoped `npx prettier --file-info` on all four Task 2 paths → all report `"ignored": false`; `npx prettier --check` passed with no changes needed.
- `graphify update .` ran (`56135 nodes, 64591 edges, 4871 communities`); `graphify-out/` is gitignored, nothing to commit.

**Task 3:**
- Combined precheck (`test -f` completed, `test ! -e` pending, `grep -q '^## Resolution ...'`, `git diff --quiet HEAD -- 45-UAT.md`) → all passed.
- `pnpm planning-gates` → `12/12 planning gates passed.`
- `npx prettier --file-info` on the completed todo path → reports `"ignored": true`; `--check` deliberately omitted as vacuous per the gamelib-conventions skill.

**Overall `<verification>` block (plan-level, run after Task 3):**
- `pnpm jest src/frontend/screens/Settings/sections/WinetricksSettings --selectProjects Frontend` → `226 passed, 226 total`.
- `pnpm codecheck` → exit 0. `pnpm planning-gates` → `12/12 planning gates passed.`
- `git diff --quiet b7f8a3924 -- GamesSettings/index.scss InstallModal/index.scss public/locales` → exit 0.
- `git log --oneline b7f8a3924..HEAD` → shows exactly the two `fix(winetricks): ... (261011-jj1)` commits and the `docs(quick-261011-jj1): ...` todo commit, in order: `a653147`, `9534d25`, `ffd2151`.
- Not verified here, and owed to the operator, per the plan: the narrow-window `de` live capture (see Open observations below).

## Files Created/Modified

- `src/frontend/screens/Settings/sections/WinetricksSettings/index.scss` - adds the top-level 0,3,0 override rule releasing the GamesSettings floor for the three groups
- `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss` - splits `.WinetricksRow__cached` from `.WinetricksRow__category` into its own shrinkable, ellipsis-truncating rule
- `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx` - hoists `cachedLabel` and renders the cached span with `title={cachedLabel}`
- `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts` - adds specificity/rule-parsing helpers and both tasks' pins
- `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx` - adds the cached-span title-equals-text assertion
- `.planning/todos/completed/2026-10-11-winetricks-tab-keeps-two-rigid-width-floors-at-narrow-windows.md` - moved from `pending/`, with a `## Resolution` section appended

## Decisions Made

See `key-decisions` in frontmatter above for the three load-bearing decisions (override shape,
badge shrink-weight parity and its visible cost, and leaving `padding-top` unanswered).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking lint error] `effectiveDecls` was unused at the end of Task 1**
- **Found during:** Task 1 verify (`npx eslint`)
- **Issue:** The plan has Task 1 define `effectiveDecls` for Task 2's later use ("Task 2 uses it, and defining it now keeps the helpers together"), but Task 1's own commit has no caller for it yet, so eslint's `@typescript-eslint/no-unused-vars` failed the Task 1 verify block.
- **Fix:** Added a one-line `eslint-disable-next-line @typescript-eslint/no-unused-vars` comment above the Task 1 definition, with a note that Task 2's `cachedBadgeYields` consumes it. Removed that disable comment in Task 2 once `cachedBadgeYields` was added and the usage became real — confirmed Task 2's `npx eslint` run on the final state passes cleanly with no disable comment present.
- **Files modified:** `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts` (both the add and the removal are folded into their respective task's single commit, since each task's "GREEN" state is what gets committed).
- **Verification:** `npx eslint` passed in both Task 1's and Task 2's verify runs.
- **Committed in:** `a653147` (Task 1, with the disable comment present); `9534d25` (Task 2, with the disable comment removed since the function is now used).

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** No scope creep — a one-line lint accommodation for an intentional two-task helper split that the plan itself specified. No behavior or test-coverage change.

## Issues Encountered

A combined `git add <completed-path> <pending-path>` in Task 3 silently failed to stage the
completed file's content (the invalid, already-`git mv`'d pending pathspec made the whole command
exit non-zero before updating the index for the valid path), leaving the index holding the
pre-Resolution 51-line content even though `git status` showed it as staged. Caught before
committing by diffing the staged blob directly (`git show :<path> | wc -l`) against the working
tree's line count; re-ran `git add` on the completed path alone, which produced the correct
107-line staged content, confirmed via `git diff --cached --stat` showing the real insertion/deletion
counts before committing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The fix is desk-verified only (jest, computed-specificity pins, eslint, codecheck, prettier,
planning-gates). Two things remain genuinely unmeasured and are carried forward by the closed
todo's Resolution rather than claimed here:

## Open observations

- **Owed: a live capture at a ~600-700px window in the `de` locale.** This plan's fixes
  (the 0,3,0 floor release and the shrinkable cached badge) are desk-derived and pinned by jest
  against compiled CSS and a DOM-tree harness, but neither has been confirmed in a real, running
  window: that the three groups actually wrap instead of the dialog scrolling sideways below the
  former 500px floor, and that the German cached badge actually ellipsizes clear of the 12rem
  status slot rather than painting over it.
- **Owed: whether the badge's earlier ellipsis onset at ~700-800px is visually acceptable.**
  Choosing `flex: 0 1 auto` (title parity) over a lower shrink factor means the German cached
  badge may now truncate slightly sooner than it did before, even at the wider ~700px paper that
  261011-hh5 already proved against. This is the visible cost of the parity decision and has not
  been looked at live.
- **The `padding-top: var(--space-xl)` design question is recorded, not answered.** The override
  rule declares `min-width: 0` only, so the GamesSettings floor's `padding-top` keeps reaching the
  three groups exactly as before. Whether that leaked spacing is wanted for the groups or is an
  unrelated carry-over from the shared floor rule is still open, and is pinned (the floor-unchanged
  test) so a future change to the floor rule itself will be caught here.

---
*Phase: quick-261011-jj1*
*Completed: 2026-10-11*
## Self-Check: PASSED
