---
phase: quick-260815-lta
plan: 01
subsystem: ui
tags: [i18n, react, mui, nav-shell, css]

requires: []
provides:
  - Tier-1 nav tab strip re-keyed to Accounts/Library (content) and all-caps (CSS presentation)
affects: [navigation-shell, i18n-catalog]

tech-stack:
  added: []
  patterns:
    - "All-caps tab presentation via text-transform: uppercase (CSS), never baked into i18n
       defaults or catalog values -- keeps 48 non-English locales' own casing rules intact"

key-files:
  created: []
  modified:
    - src/frontend/components/UI/NavShell/components/NavTabs/index.tsx
    - src/frontend/components/UI/NavShell/components/NavTabs/index.scss
    - public/locales/en/translation.json
    - src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx
    - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx

key-decisions:
  - "New keys minted in the default translation namespace (not gamelib:), following 3202f2ed6's
     precedent for nav.tabs.* and this component's own no-gamelib: source gate"
  - "nav.tabs.games deleted outright from en/translation.json rather than kept alongside library
     -- it existed in no other locale and nothing references it after the rename"
  - "userselector.manageaccounts abandoned (unreferenced from NavTabs) but left byte-identical
     in all 45 locales that translate it -- not repurposed, not touched"
  - "letter-spacing was explicitly left out of scope per the plan; carried forward as an open
     design question for the Task 3 checkpoint"

requirements-completed: [QUICK-260815-lta-01, QUICK-260815-lta-02, QUICK-260815-lta-03]

duration: 25min
completed: 2026-08-15
---

# Quick Task 260815-lta: Tier-1 Nav Tab Headings Summary

**Renamed the first two tier-1 nav tabs ("Manage Accounts" -> "Accounts", "Games" -> "Library")
via new i18n keys, and applied ALL-CAPS to all four tabs via `text-transform: uppercase` in CSS
-- keeping the rename (content) and the caps (presentation) as two fully separate changes.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-15T03:37:00Z (approx, plan read time)
- **Completed:** 2026-08-15T04:02:25Z
- **Tasks:** 2 of 3 completed (Task 3 is a checkpoint, see below)
- **Files modified:** 5

## Accomplishments

- `NavTabs/index.tsx`'s first two `<Tab label=…>` props now resolve through new fork-minted keys
  `nav.tabs.accounts` ("Accounts") and `nav.tabs.library` ("Library"), replacing
  `userselector.manageaccounts` ("Manage Accounts") and `nav.tabs.games` ("Games") respectively.
  `stores` and `Settings` keys are untouched -- both byte-identical to before, including the
  `Settings` key shared with `SettingsModal/index.tsx`.
- `public/locales/en/translation.json`'s `nav.tabs` block is now `{accounts, library}`; the
  dead `games` entry (minted en-only by this fork in `3202f2ed6`) is deleted, not kept alongside.
  Every other of the 48 non-English catalogs is untouched.
- `.NavTabs .MuiTab-root` in `index.scss` now declares `text-transform: uppercase`, replacing the
  retired `text-transform: none;` override, with a rewritten comment stating the
  presentation-vs-content rationale. No hex colours, no new top-level rule, every `MuiTab*`
  selector still nested under `.NavTabs` (verified structurally).
- Both structural test suites (`NavTabsComponent.test.tsx`, `destinationCoverage.test.tsx`)
  updated: new label expectations, a re-pointed source-key gate (via `stripSourceComments`),
  a new "no baked ALL-CAPS literal" gate, a flipped stylesheet gate (`uppercase` present /
  `none` absent), and SANITY counter-checks for every new prohibition.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-key the two renamed labels and sync the en catalog** - `0f864fa42` (feat)
2. **Task 2: Flip the stylesheet to uppercase and retire the comment that contradicts it** - `9619e7239` (feat)

**Plan metadata:** `445606286` (docs: plan all-caps tier-1 nav tab headings) -- pre-existing, committed before this execution session started.

_Note: this plan's tasks are not TDD-typed; each is a single commit._

## Files Created/Modified

- `src/frontend/components/UI/NavShell/components/NavTabs/index.tsx` - Two `label=` props re-keyed; JSDoc amended noting the quick-task rename and that caps are CSS-driven
- `src/frontend/components/UI/NavShell/components/NavTabs/index.scss` - `text-transform: none` -> `uppercase`, comment rewritten
- `public/locales/en/translation.json` - `nav.tabs` block replaced: `{games}` -> `{accounts, library}`
- `src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx` - Label expectations, source-key gate, new baked-caps gate, flipped stylesheet gate, SANITY twins for all four new prohibitions
- `src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx` - Destination union updated, describe title + prose updated

## Decisions Made

- **Namespace:** default `translation` namespace, not `gamelib:` -- both new keys mint there,
  matching `nav.tabs.games`'s own precedent (`3202f2ed6`) and this file's own no-`gamelib:`
  source gate (`NavTabsComponent.test.tsx`'s gamelib-prefix prohibition).
- **`nav.tabs.games` deleted, not kept:** it was fork-minted en-only for this exact tab; leaving
  it behind `keepRemoved: true` semantics would have stranded a dead key beside a live one.
- **`userselector.manageaccounts` abandoned, not repurposed:** 45 locales translate it as
  "Manage Accounts" / local equivalents; touching it would force an English-only rename onto
  every non-English user. It stays exactly as-is in all 45 catalogs -- simply unreferenced from
  this component going forward.

## Deviations from Plan

### Auto-fixed Issues

None required by the plan's own logic -- both tasks executed exactly as written. See "Issues
Encountered" below for a race condition that required *re-applying* (not deviating from) the
planned edits multiple times, and a scope-boundary item that was deliberately *not* fixed.

**Total deviations:** 0
**Impact on plan:** None -- plan executed exactly as written, twice over, after the interference described below.

## Issues Encountered

**Concurrent-session file interference during Task 1 and Task 2.** While editing
`NavTabs/index.tsx`, `public/locales/en/translation.json`, `NavTabsComponent.test.tsx`,
`destinationCoverage.test.tsx`, and later `NavTabs/index.scss`, each file was independently
reverted back to its pre-edit content on disk by an external process mid-execution -- observed
via direct `grep`/content checks immediately after each `Edit` call reported success, and again
via `git diff`/`git status` (one revert also un-staged an already-`git add`ed
`translation.json`). No destructive git command was run by this session to cause it (only
`git add` and read-only `git diff`/`git status` were used); the working tree independently shows
seven-plus files under active edit by a different, concurrently-running session per this task's
own constraints. Resolution: re-applied each edit, verified its survival with a direct `grep`
immediately after (not relying on the Edit tool's own "file state is current" claim), and did
not run the verification/commit step until every file's content was confirmed stable
immediately beforehand. Both commits (`0f864fa42`, `9619e7239`) landed clean with no unrelated
files staged, and a post-commit re-run of the full targeted test suite (300/300 Frontend,
134/134 Meta) still passes after both commits with zero further interference observed.

**`pnpm codecheck` fails on an unrelated, untracked file.** `src/frontend/screens/Settings/components/LoginBackground.tsx`
(new, untracked, part of the concurrent session's in-flight work -- not in this plan's
`files_modified`, zero grep hits for `NavTabs`/`nav.tabs`) fails `tsc --noEmit` with three
type errors unrelated to this task. Per the scope boundary rule, left unfixed and logged to
`.planning/quick/260815-lta-change-title-tab-headings-to-accounts-li/deferred-items.md`.
Substituted `npx eslint` on the four touched source/test files (clean, zero output) plus the
full targeted jest suites as this task's own correctness evidence, since a whole-repo `tsc`
command cannot isolate this task's files from a concurrent session's unrelated breakage.

## Known Stubs

None.

## Threat Flags

None -- this plan's threat model (T-260815-lta-01..05, SC) is unchanged by execution; no new
network endpoint, auth path, file access pattern, or schema change was introduced. The
concurrent-session interference above is a working-tree hazard, not a new threat surface.

## User Setup Required

None - no external service configuration required.

## Task 3: Human Verification Checkpoint -- OPEN, NOT ATTEMPTED

**This is a `checkpoint:human-verify` task and has deliberately NOT been self-approved.** Tasks 1
and 2 are code-complete and committed; Task 3 requires a live, three-theme visual sweep that no
automated suite in this repo can perform (no CSS transform evaluation, no DOM, in this jest
project).

### What was built

The tier-1 nav tab strip now renders **ACCOUNTS · LIBRARY · STORES · SETTINGS**. The two renamed
labels resolve through new fork keys (`nav.tabs.accounts`, `nav.tabs.library`) synced into
`public/locales/en/translation.json`; the all-caps look is `text-transform: uppercase` on
`.NavTabs .MuiTab-root`, so no string literal and no catalog value carries the caps, and the
shared `stores` / `Settings` keys were not touched at all.

Automated coverage already proves label order and text, key minting, absence of retired keys,
absence of baked caps, the stylesheet rule, MUI selector scoping, zero upstream catalog churn,
and lint cleanliness on the touched files (typecheck could not be cleanly isolated from an
unrelated concurrent-session file -- see Issues Encountered). What it CANNOT prove is how it
looks.

### How to verify (operator steps)

1. `pnpm tauri:dev` -- **not** `tauri dev`, which serves a stale static bundle from
   `frontendDist` and would show the old labels.
2. Look at the navbar. Confirm the four tabs read **ACCOUNTS**, **LIBRARY**, **STORES**,
   **SETTINGS**, in that left-to-right order.
3. Click each tab in turn and confirm routing is unchanged: ACCOUNTS goes to the Manage Accounts
   page, LIBRARY to the game library, STORES to your default store, SETTINGS to
   Settings -> General.
4. Confirm the active tab still merges into the content surface with no visible seam or 1px gap
   along the navbar's bottom edge, and that the wordmark and Downloads ring still sit level with
   the tab strip (F-34.10-03 / F-34.10-04 regression check -- the uppercase change should not
   have moved anything, but this is the surface those findings live on).
5. Confirm the four tabs still fit the navbar width without wrapping or clipping. ALL-CAPS is
   wider than mixed case and "SETTINGS" is the rightmost tab. If it is tight, say so.
6. Repeat steps 2, 4 and 5 in **each** of these themes (Settings -> General -> Theme), one at a
   time, because the navbar/body lightness inversion differs per theme: `midnightMirage`,
   `dracula`, `gruvbox_dark`.
7. Open Settings and confirm the Settings modal's own tab labels, and any other `<Tabs>` in the
   app (Wine Manager, Download Manager, Games settings), are **NOT** uppercased -- the rule must
   stay scoped to `.NavTabs`.
8. Optional design call: if the caps read cramped, note whether `letter-spacing: .12em` should
   be added (the sketch's uppercase convention). It was deliberately left out of scope by this
   plan.

### Checkpoint result per theme

Not yet run -- **awaiting the operator's live verification.** No theme has been swept.

### `letter-spacing` requested at checkpoint?

Not yet known -- carry forward once the checkpoint is answered. If requested, it is a small,
scoped follow-up to `.NavTabs .MuiTab-root`'s existing rule block (add `letter-spacing: .12em`
next to the `text-transform: uppercase` declaration this plan just added).

## Next Phase Readiness

- Tasks 1 and 2 are done, committed, and independently verified stable against the
  concurrent-session interference described above.
- **Blocked on Task 3** (the human-verify checkpoint) before this quick task can be considered
  fully closed. The resume signal is: type "approved", or describe what looks wrong (per theme,
  with the step number).
- `.planning/quick/260815-lta-change-title-tab-headings-to-accounts-li/deferred-items.md` records
  one out-of-scope item (`LoginBackground.tsx` typecheck failure) for whichever session owns
  that file to pick up.

---
*Quick task: 260815-lta*
*Completed (Tasks 1-2): 2026-08-15*
*Task 3 (human-verify checkpoint): OPEN*

## Self-Check: PASSED

- Commit `0f864fa42` (Task 1): FOUND in `git log --oneline --all`
- Commit `9619e7239` (Task 2): FOUND in `git log --oneline --all`
- All 5 files in `key-files.modified` exist on disk
- `deferred-items.md` exists on disk
- This `SUMMARY.md` exists on disk
