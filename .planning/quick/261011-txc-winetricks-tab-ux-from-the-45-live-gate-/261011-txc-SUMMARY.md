---
phase: quick-261011-txc
plan: "01"
subsystem: winetricks-settings-ui
tags: [winetricks, settings, ui, i18n, locales, todos]
dependency-graph:
  requires: [45-UAT-13, TODO-2026-10-11-winetricks-tab-ux-observations]
  provides:
    - winetricks-tab-everything-else-scoped-to-ungrouped
    - winetricks-tab-installed-group
    - winetricks-tab-suggested-collapsible
    - winetricks-tab-dock-opaque
    - winetricks-row-errored-tickable
    - winetricks-row-verb-id-visible
  affects:
    - public/locales/*/gamelib.json (winetricksBrowse.installedHeading)
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
tech-stack:
  added: []
  patterns:
    - "group-as-view: a group (Suggested/task group/Installed) is a filtered VIEW onto one catalog, never a partition the catalog is split into"
    - "raw-text JSON splicing for prettier-ignored, per-locale-ordered catalogue files (never json.load/json.dump round-trip)"
key-files:
  created:
    - src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx
    - .planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md
  modified:
    - src/common/winetricks/deriveRowState.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/SuggestedGroup/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.tsx
    - public/locales/*/gamelib.json (49 files, +1 line each)
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md
    - .planning/todos/completed/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md (moved from pending/)
decisions:
  - "Item 8 (row tag wording) kept as-is: 'Done' marks this run's own live feedback, 'Installed' marks the steady state; both stay, no code change."
  - "Item 9 (macOS drag-resize) split into its own pending todo rather than investigated here -- no code hypothesis exists yet, needs a live check on its own."
  - "The dock's top divider keeps the plan-mandated var(--divider, color-mix(...)) form rather than switching to --border-color; see Open observations -- this is a measured, not resolved, risk."
metrics:
  duration: "multi-session (Task 1 committed in a prior session; Task 2 and Task 3 completed in this session)"
  completed: 2026-10-11
status: complete
actuals:
  tokens: 23212
  tasks: 3
  commits: 5
commits: 5
plan_head_before: 1fc0425e65c26051835554a209aea1d22fc0ae05
plan_head_after: a674a2a3afa9601b472298775256addfbb70447b
---

# Quick 261011-txc: Winetricks Tab UX from the 45 Live Gate Summary

Implements 8 of the 9 locked UX fixes from the Phase 45 live-gate todo for the Winetricks
Settings tab: errored rows become tickable and every row shows its verb id, Everything else now
lists only ungrouped verbs when unsearched while search stays catalog-wide, a new collapsible
Installed group sits after Suggested, Suggested itself becomes a disclosure, the leaked
group-header padding is released, and the sticky dock paints opaque with a divider above the
search box -- plus closing the source todo and splitting its one unresolved item (macOS
drag-resize) into its own pending todo.

## Commits

| Commit | Type | Subject |
| --- | --- | --- |
| `432689f0c` | feat | an errored Winetricks row is tickable and every row shows its verb id |
| `eef7f6918` | feat | Winetricks tab lists ungrouped verbs in Everything else, adds an Installed group, makes Suggested collapsible, tightens group spacing and docks the bar opaque |
| `848d48b14` | chore | regenerate i18nForkTouchedFiles.json |
| `3d48b31a6` | test | update genI18nGateScope's hardcoded 206/248 fixture counts to 207/249 |
| `a674a2a3a` | docs | split the window-resize observation into its own todo and close the Winetricks tab UX todo |

All five commits carry `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` per this plan's
explicit trailer instruction.

## Task 1: errored rows tickable, verb id visible (`432689f0c`)

- `deriveRowState` rule 4/5 swap: `selected` now outranks `errored`, so ticking a failed verb
  re-batches it for the next Apply; unticking returns it to `errored`.
- `Row`'s `errored` case now renders the shared checkbox lead (enabled, unchecked) instead of a
  bare icon; the danger icon moved into the status fragment beside the failed tag and Retry.
- Every row template/state now shows a `WinetricksRow__verb` span beside the title (live gate
  45-12 G5: two "MS GDI+" rows, `gdiplus` vs `gdiplus_winxp`, indistinguishable by title alone).
- Status slot widened 12rem -> 13rem for the extra icon.

Tests re-pointed to the new contract, all in `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/`:
- `rowStates.test.tsx`: `errored: an unchecked enabled checkbox, the danger icon, the Install failed tag and Retry`
- `rowStates.test.tsx`: `only installed and installing have no checkbox among the six states (261011-txc: errored is now tickable)`
- `rowStates.test.tsx`: `disables an errored row checkbox (261011-txc)`
- `rowStates.test.tsx`: `shows the verb id as a text node in the title line, beside the title (261011-txc)`
- `groups.test.tsx`: `a failed row is tickable: ticking re-batches it with another verb, unticking returns it to failed (261011-txc)`
- `tokenCensus.test.ts`: `the status slot: flex 0 0 auto, width 13rem (261011-txc: room for icon, failed tag and Retry)`

No regression-sweep file outside these needed re-pointing; the full tab test directory plus
`deriveRowState.test.ts` was green with zero unexpected failures.

## Task 2: Everything-else scoping, Installed group, collapsible Suggested, spacing, opaque dock (`eef7f6918`, `848d48b14`, `3d48b31a6`)

- **Everything else** now derives its unsearched row set as the catalog minus every task-group
  member minus every curated verb (`UNGROUPED`), not the full `allComponents` list; a search still
  matches across the whole catalog (a task-group member such as `vcrun2019` is absent unsearched,
  present once searched).
- **New `InstalledGroup`** component (`src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx`):
  collapsed by default, member-count badge, renders `null` when nothing is installed (A-45-01),
  no checkbox on its rows (nothing to batch -- it's a status view, not an action list).
- **`SuggestedGroup`** lost its static non-collapsible branch; `GroupHeader`'s `expanded`/
  `onToggle`/`controlsId` props are now all required -- every group is a disclosure button.
- **Spacing**: `GamesSettings/index.scss`'s `section:not(:nth-of-type(0))` floor leaked
  `padding-top: var(--space-xl)` (3em) onto every group; a `0,3,0`-specificity override releases
  it to `0`, and the tab's own `gap: var(--space-sm)` (0.75em) now carries the visual separation.
  `GamesSettings/index.scss` itself is byte-unchanged (confirmed via `git diff --quiet`).
- **Dock**: paints opaque (`background: var(--body-background, #070a0b)`) with a top divider
  (`box-shadow: 0 -1px 0 var(--divider, color-mix(...))`) at `z-index: 2`, strictly above the
  Everything-else search box's `z-index: 1`. 45-UAT.md item 13 annotated in place (still opens
  `result: issue`).
- **49 locale catalogues** each gained `winetricksBrowse.installedHeading`, copied verbatim from
  that file's own `installedTag` value, inserted via raw-text splicing (never round-tripped
  through `json.load`/`json.dump`) at the correct case-insensitive alphabetical position per file.
- **i18n gate scope**: hand-inserted `WinetricksSettings/InstalledGroup/index.tsx` into both
  `meta/i18nGateScope.json` (sorted position) and `meta/i18nForkTouchedFiles.json`, plus a
  provenance clause on `i18nGateScope.json`'s `generatedBy`. Post-commit, `pnpm gen-i18n-gate-scope`
  confirmed the hand-insert matches the live derivation exactly (zero diff in the `files` array;
  only `generatedAt` and the `purpose` string's unicode encoding changed) -- committed as the
  `chore` regeneration commit.

Tests re-pointed or added, all in `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/`:
- `everythingElse.test.tsx`: `is collapsed by default with the ungrouped count as its badge and no rows or search box` (re-pointed to the new `UNGROUPED` fixture)
- `everythingElse.test.tsx`: `shows only the ungrouped verbs as one-line rows in parser order with no category tags and no results heading` (re-pointed)
- `everythingElse.test.tsx`: `UNGROUPED sanity (261011-txc) > equals the catalog minus every task-group member minus every curated verb` (new)
- `everythingElse.test.tsx`: `a task-group member is absent from the unsearched list and present once a search matches it (261011-txc)` (new)
- `groups.test.tsx`: `non-vacuity: renders a static header and the curated 8 under the sub-heading when there is no per-game signal` (selector fix: `WinetricksGroupHeader` -> `WinetricksGroupHeader__label`)
- `groups.test.tsx`: `is expanded by default and collapsible: a disclosure button with aria-expanded true, toggling hides the rows (261011-txc)` (replaces the retired "is always open: its header is a static heading, never a disclosure button")
- `groups.test.tsx`: `Installed group (261011-txc) > renders nothing when nothing is installed (A-45-01)` (new)
- `groups.test.tsx`: `Installed group (261011-txc) > sits between Suggested and the first task group, collapsed with a member-count badge, and expands into installed rows with no checkbox` (new)
- `groups.test.tsx`: `Installed group (261011-txc) > appears once a run finishes installing a verb, without a remount` (new)
- `tokenCensus.test.ts`: `the override declares min-width: 0 and padding-top: 0, releasing the floor's leaked padding (261011-txc)` (retitled and extended from the min-width-only version)
- `tokenCensus.test.ts`: `the real index.scss beats the floor for %s` (`it.each`, `WinetricksInstalled` added to the group list)
- `tokenCensus.test.ts`: `dock paints above the sticky search (261011-txc) > the dock is opaque with a top divider and z-index 2, strictly above the Everything else search box at z-index 1` (new)

**Regression-sweep fix outside the plan's named files:** `meta/__tests__/genI18nGateScope.test.ts`'s
`A0`/`A2`/`A3`/`A4` specs assert literal file counts (206 for the hand-curated scope, 248 for the
derived fork-touched set). The hand-insert above grew both artifacts by one file, redding all four
specs until the literals were bumped to 207/249 (commit `3d48b31a6`, with a new historical comment
entry matching the file's own convention for documenting count transitions). No other file outside
the plan's named set needed re-pointing.

Final verification totals for this task: `npx jest src/frontend/screens/Settings/sections/WinetricksSettings src/common/winetricks --selectProjects Frontend Common` -> **18 suites passed, 343 tests passed, 0 failed**. `npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts --selectProjects Meta` -> **2 suites passed, 183 passed, 1 skipped, 0 failed** (after the count fix; the first run, before the fix, showed 1 suite failed / 3 tests failed, reported above honestly rather than silently re-run until green).

`pnpm codecheck`: clean (no output, both tsconfigs). `pnpm lint`: exit 0, `0 errors, 638 warnings` (`production: PASS | tests: PASS`; the warnings are pre-existing and outside this task's scope). `pnpm lint-translations:gamelib`: `720 findings, 0 hard failures`, exit 0. `pnpm i18n --fail-on-update`: exit 0, `Added keys: 0` across every namespace/locale. `pnpm find-deadcode`: `unreachable: 46 OK | used-in-module: 0 OK`, exit 0. `npx prettier --check` over every non-ignored touched path: clean. `graphify update .` ran once after the code edits (56425 nodes, 65068 edges, 4883 communities), not committed.

## Task 3: split item 9, close the source todo (`a674a2a3a`)

- Created `.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md`
  with `severity: minor`, `platform: macos`, `ready: human` in that exact order, carrying item 9's
  text verbatim plus the three supporting facts and the evidence pointer.
- `git mv`'d `.planning/todos/pending/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md`
  to `completed/` and appended a `## Resolution (2026-10-11, quick 261011-txc)` section mapping all
  nine items to their fix commit (or disposition).
- `pnpm planning-gates`: **12/12 gates passed**, including `todo-frontmatter-gate.py`.
- The frontmatter-order check, the resolution-section-existence check, and the source-todo-absence
  check (the plan's three `<verify>` commands) all passed.

## Item 8 decision record

Row tag wording (`Done` for a verb installed in the current run vs. `Installed` for a
pre-existing one) is **kept as two words, by design, no code change**: `Done` is deliberately this
run's own live feedback (confirms *this* Apply succeeded), `Installed` is the steady state for
everything already on the bottle before this run started. Recorded in the source todo's Resolution
section and here; no follow-up task exists for it.

## Open observations

- **The dock's divider token resolves near-invisible in most themes, including midnightMirage --
  not live-verified.** `src/frontend/themes.scss` (lines 10-28) documents, from a prior
  measurement on a different consumer, that `--divider` is declared in only 2 of the theme blocks
  and otherwise falls through to `--neutral-03`; measured against `--body-background` it comes out
  at **1.04:1 dracula, 1.08:1 gruvbox_dark, 1.19:1 high-contrast, 1.45:1 midnightMirage** -- all
  far under the 3:1 non-text floor. That measurement is the reason `--border-color: gray` exists as
  the established fix for exactly this failure mode elsewhere in the codebase. This plan's dock
  rule (`box-shadow: 0 -1px 0 var(--divider, color-mix(in srgb, currentColor 14%, transparent))`)
  deliberately keeps the plan-mandated `var(--divider, ...)` form rather than switching to
  `--border-color`, per the plan's explicit instruction to preserve that exact form. The practical
  consequence: in most dark themes (and measurably in midnightMirage) the dock's top divider line
  is likely to render invisible against the body background, even though the opaque `background`
  fix itself (the actual 45-UAT item 13 defect -- content showing through the bar) is real and
  independent of the divider's visibility. **Not live-verified this session** -- a capture is owed
  at the next 45-12 run, same as the rest of this plan's visual changes.
- **None of items 1-7's fixes are live-verified.** All of Task 2's changes (Everything-else
  scoping, the Installed group, collapsible Suggested, spacing, the opaque dock) are verified only
  by jest + a Sass-compiled CSS census, not by an actual running build. The source todo's Resolution
  section states this explicitly: a look is owed at the next 45-12 run.
- **Item 9 (macOS drag-resize) has no code hypothesis.** It was split into its own pending todo
  rather than investigated, per the plan -- it needs a live check on its own before any fix is
  attempted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Blocking issue caused by this task's own change] `genI18nGateScope.test.ts`'s hardcoded 206/248 file-count fixtures went stale**
- **Found during:** Post-commit verification of Task 2 (running the meta gate-scope test suite per the plan's `<verify>` instruction)
- **Issue:** The `A0`/`A2`/`A3`/`A4` specs in `meta/__tests__/genI18nGateScope.test.ts` assert literal counts (206 hand-curated scope files, 248 derived fork-touched files) as regression anchors. This task's hand-insert of `InstalledGroup/index.tsx` into both artifacts grew each by exactly one file, redding all four specs.
- **Fix:** Bumped the four literal assertions and their test titles to 207/249, and added a new historical comment entry documenting the transition, matching the file's own established convention for recording prior count changes (e.g. the Phase 45 plan 45-11 entry immediately above it).
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`
- **Commit:** `3d48b31a6`

No other deviations. Every other change tracked exactly to the plan's explicit instructions.

## Known Stubs

None. `InstalledGroup` renders real installed-verb data derived from the same catalog/metadata
source as every other group; no hardcoded empty/placeholder values were introduced.

## Threat Flags

None. No new network endpoints, auth paths, or trust-boundary schema changes were introduced. The
three threat-model entries named in the plan (T-txc-01 verb-id XSS-safety via React text child,
T-txc-02 errored-checkbox elevation guard via `locked`/`toggleVerb`, T-txc-03 locale-catalogue
tampering via raw-text splice + re-parse) were followed as specified; no package installs were
performed (T-txc-SC: none).

## Self-Check: PASSED

Verified on disk / in git history:
- `FOUND: src/frontend/screens/Settings/sections/WinetricksSettings/InstalledGroup/index.tsx`
- `FOUND: .planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md`
- `FOUND: .planning/todos/completed/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md` (moved, not duplicated -- confirmed absent from `pending/`)
- `FOUND: 432689f0c` in `git log --oneline --all`
- `FOUND: eef7f6918` in `git log --oneline --all`
- `FOUND: 848d48b14` in `git log --oneline --all`
- `FOUND: 3d48b31a6` in `git log --oneline --all`
- `FOUND: a674a2a3a` in `git log --oneline --all`
- `git rev-list --count 1fc0425e6..HEAD` = 5, matching `commits: 5` above
- Working tree clean except `.planning/milestone.lock` (unrelated, pre-existing untracked file) and this plan's own `.planning/quick/261011-txc-.../` directory (PLAN.md + this SUMMARY.md, intentionally left for the orchestrator to commit)
