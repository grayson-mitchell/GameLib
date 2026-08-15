---
phase: quick-260815-kt0
plan: 01
subsystem: ui
tags: [react, i18n, login-screen, manage-accounts, css]

requires: []
provides:
  - Uniform, localised, italic "Connected" indicator on all six Manage Accounts store tiles
  - Removal of the RunnerProps.user identity prop and its two identity-fallback strings
affects: [login-screen, manage-accounts, i18n-gamelib-catalog]

tech-stack:
  added: []
  patterns:
    - "Component-root-scoped CSS selector (.runnerWrapper .runnerConnected) to prevent app-wide leakage"
    - "Element-graph jest specs (no jsdom) walking the returned React object graph as a permanent regression pin against identity leakage"

key-files:
  created: []
  modified:
    - src/frontend/screens/Login/components/Runner/index.tsx
    - src/frontend/screens/Login/components/Runner/index.css
    - src/frontend/screens/Login/index.tsx
    - src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx
    - public/locales/en/gamelib.json

key-decisions:
  - "Replaced login.unknownUser with login.connected in fork-owned gamelib.json only; upstream-owned translation.json's orphaned login.humble_connected key is deliberately left in place"
  - "Kept the .userData flex container instead of removing it, so the tile's 60px row balance and Logout button position are unaffected"
  - "Task 1's RED run found 4/5 specs failing (not 5/5): the logged-out absence spec already passed against unmodified source, since .userData/runnerConnected only ever render when isLoggedIn is true — recorded verbatim per plan instruction rather than reconciled"

requirements-completed: [QUICK-260815-kt0-01, QUICK-260815-kt0-02, QUICK-260815-kt0-03]

duration: ~25min
completed: 2026-08-15
---

# Quick Task 260815-kt0: Manage Accounts — Replace Per-Store Identity with Uniform Connected Label

**Every Manage Accounts tile now shows a single italic, i18n-resolved word "Connected" in place of the per-store username; the `user` prop and its two identity-fallback strings (Amazon's literal "Unknown", Humble's `login.humble_connected` fallback) are deleted from `RunnerProps` and every call site.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-15
- **Tasks:** 3 of 3 (Task 3 `checkpoint:human-verify` PASSED 2026-08-15 — see below)
- **Files modified:** 5

## Accomplishments

- `Runner/index.tsx` no longer accepts or renders any per-store identity value. The
  `isLoggedIn` block now renders `tGamelib('gamelib:login.connected', 'Connected')` inside a
  `runnerConnected` span, nested in the retained `.userData` flex container.
- `Runner/index.css` adds a component-root-scoped `.runnerWrapper .runnerConnected { font-style:
  italic }` rule — cannot leak app-wide (this repo has previously shipped an unscoped selector
  that did).
- `Login/index.tsx`'s six `user={...}` call sites (epic, gog, nile, zoom, steam, humble) and the
  now-unused `tGamelib` binding are deleted; the stale D-02/D-16 comment is rewritten to describe
  the uniform indicator.
- `public/locales/en/gamelib.json`'s `login.unknownUser` key is replaced with `login.connected:
  "Connected"`; `translation.json` (upstream-owned) is untouched.
- Five element-graph specs added to `Runner/__tests__/index.test.tsx`, RED-proven against
  unmodified source, now GREEN — including a permanent regression pin (test 2) that an arbitrary
  identity value passed through the (now-deleted) `user` prop slot can never reach the rendered
  tree, and a source-text gate (test 5) pinning both the localisation key's presence and the
  absence of a bare `>Connected<` JSX text node.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the login.connected catalog key and RED-prove the connected-state specs** -
   `24bdd8707` (test)
2. **Task 2: Render the italic connected label, delete the user prop, repair stale comments** -
   `0d54b16b7` (feat) — all four files (`Runner/index.tsx`, `Runner/index.css`,
   `Login/index.tsx`, `Runner/__tests__/index.test.tsx`) landed in this single commit per the
   plan's explicit instruction (`RunnerProps.user` cannot be removed without simultaneously
   updating its six call sites, or `tsc --noEmit` breaks between commits).

Task 3 (`checkpoint:human-verify`, visual check across three themes) is **not yet run** — see
Checkpoint section below.

## Files Created/Modified

- `src/frontend/screens/Login/components/Runner/index.tsx` — deleted `user`/`maxNameLength`;
  added `tGamelib` hook; renders `runnerConnected` span
- `src/frontend/screens/Login/components/Runner/index.css` — added scoped italic rule; repaired
  stale `.userData` comment
- `src/frontend/screens/Login/index.tsx` — removed six `user=` props + unused `tGamelib`
  binding; rewrote stale D-02/D-16 comment
- `src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx` — added 5 new specs;
  removed the now-nonexistent `user` prop from `makeProps` and one test override
- `public/locales/en/gamelib.json` — `login.unknownUser` → `login.connected: "Connected"`

## Decisions Made

- Followed the plan's explicit "all four files in ONE commit" instruction for Task 2 rather than
  the default per-task-atomic-commit convention, since `RunnerProps.user` removal and its six
  call-site updates are mutually load-bearing for `tsc --noEmit`.
- `login.humble_connected` in upstream-owned `translation.json` is left orphaned in place, per
  scouting finding 7 and the plan's own handoff note — touching it would fail the churn guard's
  live-tree assertion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed two self-introduced "unused eslint-disable directive" warnings**
- **Found during:** Task 2 verification (`pnpm lint` scoped to touched files)
- **Issue:** Task 1's new source-text-gate spec (test 5) had two
  `// eslint-disable-next-line @typescript-eslint/no-var-requires` comments above
  `jest.requireActual` calls; the project's lint config does not flag `no-var-requires` on these
  calls, so both directives were reported as unused.
- **Fix:** Removed both now-superfluous eslint-disable comments.
- **Files modified:** `src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx`
- **Verification:** `npx eslint` on the five touched files now reports zero problems from this
  file (0 errors, 0 warnings).
- **Committed in:** `0d54b16b7` (part of Task 2 commit, since the test file's other Task-2
  edits land in the same commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, self-introduced lint noise)
**Impact on plan:** Cosmetic only. No scope creep.

## Issues Encountered

**Discrepancy from plan's predicted RED failure set (Task 1):** the plan predicted all five new
specs would fail against unmodified `Runner/index.tsx`. Observed: only 4/5 failed. Test 4
("logged out: zero elements with className including runnerConnected or userData") **passed
against unmodified source**, because `.userData` (and everything inside it) is only ever
rendered when `props.isLoggedIn` is true — the logged-out branch already had zero such elements
before any code change. Recorded verbatim per the plan's own instruction ("If the observed
failing set differs from these five, record the discrepancy exactly as observed — do not
reconcile it silently to this plan's prose"). No action needed; this does not weaken the pin —
test 4 still guards the logged-out state going forward.

**Pre-existing unrelated `pnpm test:ci` failure (out of scope):** `src/backend/sidecar/__tests__
/steamAuthFlows.test.ts` carried an uncommitted modification (137 insertions, present in the
working tree before this session started) asserting `main.ts` registers two IPC handlers
(`persistBottleWineVersion`, `isSteamBottleEligible`) from Phase 34.13 Plan 07/08 follow-on work
that `main.ts` does not yet implement. This produces 6 failing tests / 1 failing suite,
making `pnpm test:ci` report **258 passed / 1 failed / 259 total suites** instead of the plan's
expected 258/258. This is entirely unrelated to this quick task's scope (five Login/Runner/
locale files; never touches `src/backend/`) and was present before this session's first edit.
Logged to `deferred-items.md` in this task's directory per the scope-boundary rule; left
untouched (not fixed, not reverted — reverting someone else's in-progress work would be
destructive). This task's own suites (`Login`, `Runner`) are 83/83 green, and `pnpm codecheck`
is clean.

**`pnpm lint` is not "0 warnings" project-wide** — the repo carries a large pre-existing baseline
(56 errors, ~3578 warnings across the whole codebase, confirmed via `git stash`/`git stash pop`
to predate this session and unrelated to the five touched files). Scoped to this task's own
files (`npx eslint <the 5 files>`), the result is 0 errors / 6 warnings, and every one of those 6
was independently confirmed pre-existing (three in `Runner/index.tsx` at lines 97/127/141, one
in `Login/index.tsx` at line 37, both `.css`/`.json` files reported "ignored, no matching
config"). The plan's done-criteria text ("`pnpm lint` clean, 0 warnings") appears to assume a
project-wide-clean baseline that does not currently hold; interpreted as "no new warnings
introduced by this task's diff," which is satisfied.

## User Setup Required

None - no external service configuration required.

## Checkpoint: Task 3 — Human Verification ✅ PASSED (2026-08-15)

**Status:** RESOLVED. User ran the six verification steps and reported **all pass** — every signed-in
tile shows the italic "Connected" with no identity text, Humble reads identically to the rest,
signed-out tiles are unchanged, tile rhythm and Logout position are unmoved, and the label stays
legible in **midnightMirage**, **gruvbox_dark** and **dracula**. No defects reported in any store or
any theme. Task 3 edits no files (`<files>none</files>`), so no further commit of source was needed —
the plan is complete at `0d54b16b7`.

**Automated gates run before pausing (per the plan's `what-built` instruction):**

- `npx jest --selectProjects Frontend src/frontend/screens/Login src/frontend/screens/Login/components/Runner`
  → **83/83 suites, 1164/1164 tests PASSED**
- `pnpm codecheck` (`tsc --noEmit`) → **clean**
- `pnpm lint` (scoped to the 5 touched files) → **0 errors, 6 pre-existing warnings** (see
  Issues Encountered above for the project-wide baseline caveat)
- `pnpm test:ci` (full suite) → **258 passed / 1 failed / 259 total suites, 5054/5061 tests**
  (the 1 failing suite and 6 failing tests are the pre-existing, unrelated
  `steamAuthFlows.test.ts` WIP documented above and in `deferred-items.md`; not fixed per the
  scope-boundary rule)

**What was built (verbatim from the plan):** Every store tile on Manage Accounts now shows an
italic "Connected" instead of a username. The `user` prop, the 20-char truncation, the Amazon
"Unknown" fallback and the Humble-specific "Connected" fallback are all deleted. The string is
localised through `gamelib:login.connected` and the italics come from
`.runnerWrapper .runnerConnected` in the Runner stylesheet.

**How to verify (verbatim from the plan):**

1. `pnpm tauri:dev` (NOT `tauri dev` — that serves a stale static bundle) and open the
   **Manage Accounts** tab.
2. For every store you are currently signed into, confirm the tile shows the italic word
   **Connected** and no username, user id, email, or "Unknown" anywhere on the tile.
3. Confirm the Humble tile reads identically to the others (this is the inconsistency the
   change exists to remove).
4. Confirm a signed-OUT tile is unchanged: its login button text is intact and there is no
   "Connected" text on it.
5. Confirm the tile's vertical rhythm and the Logout button position look unchanged from before
   — the label occupies the same slot the username did.
6. Switch themes and re-check step 2 in each: **midnightMirage** (default), **gruvbox_dark**,
   and **dracula**. Dracula is the one that breaks naive implementations (its navbar is lighter
   than the body); confirm the italic label stays legible against the tile background in all
   three.

**Resume signal received:** user reported "completed task 3 - all pass" on 2026-08-15.

## Next Phase Readiness

All 3 tasks complete. Tasks 1 and 2 are committed and fully gated at the code level (scoped jest,
tsc, eslint all green); Task 3's live visual gate is PASSED across all three themes. The one
`pnpm test:ci` failure is pre-existing, unrelated, and belongs to a concurrent Phase 34.13 session —
see Issues Encountered and `deferred-items.md`; it remains open and is NOT closed by this task.

Two handoff items carried forward (neither is a defect, both are deliberate scope boundaries):

1. **`login.humble_connected` in upstream-owned `translation.json` is now orphaned** — its only
   consumer was deleted here. Left in place because `i18nCatalogChurnGuard.test.ts`'s live-tree
   block would fail `pnpm test:ci` on any diff to `public/locales/en/translation.json`.
2. **The per-store identity reads are still live** (`epic.username`, `gog.username`,
   `zoom.username`, `steam?.username`, `amazon.user_id`) because they also compute the
   `isLoggedIn…` state in `Login/index.tsx`. Retiring the identity fetch itself would first
   require moving those runners onto an explicit `isLoggedIn` signal — out of scope for a quick
   task, and it would touch IPC.

---
*Quick task: 260815-kt0*
*Completed (all 3 tasks; Task 3 human-verified PASS across midnightMirage / gruvbox_dark / dracula): 2026-08-15*

## Self-Check: PASSED

All 5 modified source/locale files, the summary itself, and `deferred-items.md` verified
present on disk. Both task commits (`24bdd8707`, `0d54b16b7`) verified present in `git log
--oneline --all`.
