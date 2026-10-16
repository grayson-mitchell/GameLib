---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 07
subsystem: ui
tags: [react, winetricks, settings, checkbox-model, tdd, scss, i18n]

requires:
  - phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
    provides: "45-01 tracer tab and queue; 45-03 frozen winetricksBrowse copy; 45-05 deriveRowState, foldRunOutcomes, resolveSuggestedComponents, resolveTaskGroup, familyFor, displayTitle; 45-06 annotated visibility-filtered catalog, run.log with lines and percent"
provides:
  - "WinetricksRow: two-line (56px) and one-line (44px) verb row with the six-state slot, checkbox only where a tick can mean 'will be installed' (D-10), cached as an orthogonal badge"
  - "GroupHeader, SuggestedGroup, TaskGroup, EverythingElseGroup: the three-tier body (D-05) - always-open Suggested fed by known fixes and PCGamingWiki Direct3D versions (D-06), five collapsed task groups (D-07), collapsed Everything else with a sticky search that filters only itself"
  - "useMouseDownActivate: the shared mousedown-capture plus suppressNextClick guard on the checkbox, Retry and every disclosure header (D-04)"
  - "labels.ts: exhaustive family-sentence and task-group-name helpers with gamelib-namespaced literal keys"
  - "tokenCensus.test.ts: the D-21 gate over every stylesheet in the tab, with a self-test that proves it can fail"
  - "treeHarness.ts and tabFixtures.ts: a component-expanding render harness for the node-environment Frontend jest project"
affects: [45-08, 45-11, 45-12]

actuals:
  tokens: 39880
  tasks: 3
  commits: 6
plan_head_before: 5250c7a4e64d4d69325850b0b668b4bdcf538fc2
plan_head_after: 813ff6990106054a1866bb9115e53ebb317ddf48

tech-stack:
  added: []
  patterns:
    - "Component-expanding hand-rolled render harness: a mocked 'react' whose hook state is per component INSTANCE (keyed by structural path), so a tab of child components can be exercised without jsdom"
    - "Row-render callback (renderRow) passed down to groups: the tab owns selection, queue and installed state; groups only choose which verbs appear and in which template, so one selection is shared by every tier (D-07)"
    - "Injected-TFunction label helpers use 'gamelib:'-prefixed literal keys so i18next-parser files them under the right namespace"
    - "Stylesheet census: comment-stripping checker plus a var() paren-matcher, with a sabotaged-sample self-test and a non-vacuity count"

key-files:
  created:
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/GroupHeader/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/SuggestedGroup/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/TaskGroup/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/useMouseDownActivate.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/labels.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/_ellipsis.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/winetricksInstallMouseRace.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/treeHarness.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts
  modified:
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/applyTracer.test.tsx

key-decisions:
  - "The transient 'Done' word is derived, not timed: a row shows phaseDone while its run is still running and its own outcome is installed, then Installed once the run ends. No timer exists in the tab (the plan said index.tsx would own a timer)"
  - "A verb the live run has already installed counts as installed for row state immediately, without waiting for the end-of-run installed-list re-read"
  - "Both suggestion lookups are awaited before the tab leaves loading (A-45-06) but each is abandoned after a 4s bound, so a hung PCGamingWiki request cannot hold the tab in its loading state"
  - "Live download percentage is the last non-noise line of run.log when it is a classified progress row; any later info or error line means the download ended"
  - "publisher and year render inline beside the title on BOTH templates (D-08 'every row'); E7-empty's 'no metadata line' is read as 'no separate line'"
  - "Only the primary mouse button activates the mousedown guard; a right or middle click neither acts nor arms the click-suppression flag"
  - "A hard 'locked' state disables an available OR selected checkbox and Retry (superset of the plan's 'available row'), because toggleVerb ignores input while locked and a silently dead enabled control is worse"

patterns-established:
  - "renderRow callback: groups never import selection or queue state"
  - "Header-style stylesheets truncate one-line labels through a shared mixin partial, so group stylesheets carry no scroll-container declaration at all"

requirements-completed: [D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-14, D-21]

coverage:
  - id: D1
    description: "A real checkbox row renders each of the six derived states in its own slot; installed rows have no checkbox and cannot be selected; locked disables the checkbox and Retry"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx#each derived state renders its slot (D-10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "One gesture toggles or retries exactly once; the mousedown-capture guard also covers every disclosure header"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/winetricksInstallMouseRace.test.tsx"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx#disclosure mouse race (D-04: every disclosure header)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No stylesheet in the tab consumes --navbar-*, --text-hover, raw --status-* or --border-color and every var() has a fallback; the checker fails on a sabotaged sample"
    requirement: "D-21"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Suggested is always open and never empty: game-specific rows (known fixes, then Direct3D) then the curated 8 under Commonly needed; a failed or hung lookup falls back to the curated 8 with no seam"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx#Suggested for this game (E3, D-06)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Five task groups, collapsed, real aria-expanded buttons, member-count badge; an empty group renders nothing; one selection keyed by verb is shared by Suggested, groups and Everything else"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx#task groups (E4, D-05, D-07)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx#one selection keyed by verb (D-07, E4-partial)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Everything else is collapsed, last, with a sticky plain-input search that filters verb OR title (2-character threshold) and only itself; zero results offers Clear search; a selection survives clearing or collapsing"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx"
        status: pass
    human_judgment: false
  - id: D7
    description: "Failed rows show Retry, which starts a fresh one-verb run and clears the failed state only once the backend accepts it; a remounted tab rebuilds failed rows from the queue state; the installed list is re-read once per finished run"
    requirement: "D-12"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx#run state on the rows (D-10, D-12, D-13, D-18)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Narrow-width and long-locale presentation: ellipsis on title, caption and group label, fixed 56px/44px row heights, fixed-width status slot, wrapping zero-result heading (E3-E7 long-text and overflow backstop rows)"
    verification: []
    human_judgment: true
    rationale: "SCSS truncation rules are easy to write and silently not apply; these need the live narrow-viewport and de-locale visual check, owned by the 45-12 live gate. Only the compiled heights, scope and token rules are test-pinned here."

duration: 38min
completed: 2026-10-10
status: complete
---

# Phase 45 Plan 07: Native Winetricks tab body - rows, Suggested, task groups, Everything else Summary

**The novice-first body of the Winetricks tab: a real-checkbox verb row with six states at fixed 56px/44px metrics, an always-open Suggested group fed by known fixes and PCGamingWiki Direct3D versions, five collapsed task-group disclosures and a collapsed Everything else with a sticky search that filters only itself - one selection keyed by verb across all of them, guarded by the ported mousedown race fix and a D-21 stylesheet token census.**

## Performance

- **Duration:** about 38 min (start time was not captured by an explicit command; derived from the previous plan's completion and the first commit)
- **Completed:** 2026-10-10T09:54Z
- **Tasks:** 3 (each RED then GREEN)
- **Files:** 21 changed (18 created, 3 modified)

## Accomplishments

- `WinetricksRow` renders exactly one of the six derived states: a `<button role=checkbox>` for available, selected and queued; a spinner plus `phaseDownloading`/`phaseInstalling` for installing; a success icon plus `installedTag` (and no checkbox element at all) for installed; a danger icon plus `installFailedTag` plus `Retry` for errored. A verb with no family falls back to the 44px template, so no 56px row ever has a blank second line.
- The tab now renders three tiers: Suggested (static heading, no caret), the five task groups (`TASK_GROUP_IDS` order, collapsed, a bare count badge) and Everything else. Suggested's game-specific rows come from `getKnownFixes` and PCGamingWiki `direct3DVersions` through `resolveSuggestedComponents`, awaited with a bound before first paint.
- A verb ticked in any tier is ticked in every tier, and Apply sends the verbs in tick order across tiers (tested with a Suggested tick followed by a runtimes tick).
- Everything else filters only itself: verb OR title, case-insensitive, two-character threshold, a counted `resultsHeading`, a zero-result block with Clear search, category tags only while searching. A tick made while filtered survives clearing the search and collapsing the group.
- `tokenCensus.test.ts` reads every `.scss` under the tab and fails on a banned token or a `var()` without a fallback; its self-test proves it fails on `var(--navbar-active)` and `var(--accent)`, and a non-vacuity test requires at least 10 `var()` uses.

## Task Commits

1. **Task 1: checkbox row, mousedown helper, ported mouse race, token census**
   - `f250d26c8` test(45-07): failing tests - 39 of 50 failing on assertions (stubs only)
   - `7b640258f` feat(45-07): the row, helper, label helpers and Row stylesheet
2. **Task 2: Suggested group and the five task-group disclosures**
   - `b411969b6` test(45-07): failing tests - 30 of 31 failing on assertions
   - `d89757ed6` feat(45-07): GroupHeader, SuggestedGroup, TaskGroup and the reworked tab state
3. **Task 3: Everything else**
   - `dc670ceb7` test(45-07): failing tests - 15 of 16 failing on assertions
   - `813ff6990` feat(45-07): EverythingElseGroup mounted last

**Plan metadata:** the `docs(45-07)` commit that carries this file.

## RED evidence

Each RED run failed on a planned assertion, not on a compile error or a missing module. Task 1 used inert type-correct stubs (a row returning an empty `div`, label helpers returning `''`, a no-op hook) so ts-jest could compile; Tasks 2 and 3 needed no stubs because they import the existing tab. Examples: Task 1 `expected exactly one WinetricksRow__checkbox, saw 0`; Task 2 `expected one Suggested group, saw 0` and (a regression for the stale-closure bug below) `expect(api.winetricksListInstalled).toHaveBeenCalledTimes(2)` receiving 1; Task 3 `expected one Everything else group, saw 0`. The plan is `type: execute`, so `gsd-tools check tdd-red-evidence` was not required; the runs are quoted instead, as in 45-05 and 45-06.

## Files Created/Modified

See `key-files` above. Notable shape: `Row/index.tsx` exports the `RenderWinetricksRow` callback type that the three group components receive instead of any selection or queue state.

## Source of the ported tests

The mouse-race test was ported from git SHA **`e297ec0df^`** (`e297ec0df` is the 45-02 deletion commit): `git show e297ec0df^:src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx`. The Phase 44 Install and Open GUI arms no longer exist (D-10, D-17); the same four-case contract (mousedown once, click after mousedown once, click alone once, flag survives re-render) now covers the checkbox and Retry. `rowStates.test.tsx` re-asserts the still-applicable invariants of the deleted rowStates test (one slot per state, cached is a modifier not a state, compiled stylesheet non-empty with a sanity control) and the search invariants of the deleted `WinetricksBrowse.test.tsx` live in `everythingElse.test.tsx`.

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The queue listener closed over a stale `queueState`**
- **Found during:** Task 2
- **Issue:** `onQueueChanged` computed `wasRunning` from the `queueState` captured when the mount effect first ran (always the empty initial state), so `wasRunning && state.run?.status === 'done'` was never true and the installed list was never re-read after a run finished.
- **Fix:** A `useRef` holds the last run id whose completion already triggered a re-read; the listener re-reads once per finished run. A remounted tab that finds an already-finished run records its id so it does not re-read redundantly. Regression-tested (`re-reads the installed list when a run finishes (once per run)`, RED in `b411969b6`).
- **Files modified:** `src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx`
- **Committed in:** `d89757ed6`

**2. [Rule 3 - Blocking] Labels need a `gamelib:` namespace prefix to be extracted into the right catalog**
- **Found during:** Task 1
- **Issue:** The plan shows `t('winetricksBrowse.family.vcrun', ...)` in `labels.ts`, but that file receives an injected `t` and has no `useTranslation('gamelib')`, so i18next-parser would file those 18 keys under the default `translation` namespace. `pnpm i18n --fail-on-update` runs pre-push.
- **Fix:** Every key in `labels.ts` is `gamelib:winetricksBrowse...` (the idiom `RedeemSteamKeyDialog/copy.ts` already uses); the injected `tGamelib` resolves it identically at runtime. Verified by running `npx i18next --silent`: zero added or restored keys and no change under `public/locales/`. A test pins both the prefix and each default against the English catalog.
- **Files modified:** `labels.ts`, `__tests__/rowStates.test.tsx`
- **Committed in:** `7b640258f`

**3. [Rule 3 - Blocking] Two shared test helper files and one stylesheet partial outside `files_modified`**
- **Found during:** Tasks 1 and 2
- **Issue:** The plan's tests are on a harness that only calls one function component, but the tab is now composed of child components. Without an expanding renderer each of the five test files would carry its own copy of a non-trivial per-instance hook-state implementation. Separately, the plan's acceptance grep requires zero `max-height|overflow` matches in `GroupHeader/index.scss` and `index.scss`, but the header label needs `overflow: hidden; text-overflow: ellipsis` to truncate (E4-long-text).
- **Fix:** Added `__tests__/treeHarness.ts` and `__tests__/tabFixtures.ts` (test-only, not collected as tests), and `_ellipsis.scss`, a one-mixin partial the group stylesheet `@use`s. The group stylesheets contain neither word; the partial opens no scroll region and caps no body height. The census walks the partial too.
- **Committed in:** `f250d26c8`, `b411969b6`, `d89757ed6`

**4. [Rule 2 - Missing Critical] Bounded lookups, primary-button guard, `data-verb`**
- **Found during:** Tasks 1 and 2
- **Issue:** A-45-06 makes both suggestion lookups block first paint; an unbounded wait would hold the tab in its loading state if a request never settles. A right-click `mousedown` would have run the action and a middle click would have armed the click suppression for a `click` that never comes. A selection that is identifiable only by DOM position cannot be asserted across tiers.
- **Fix:** A 4-second bound on each lookup (cleared on settle, fake-timer tested); `if (event.button) return` in the mousedown guard (tested); a `data-verb` attribute on the row root.
- **Committed in:** `7b640258f`, `d89757ed6`

**5. [Rule 3 - Blocking] `findDeadcode` transients resolved at the source**
- **Found during:** Tasks 1 and 2
- **Issue:** `RenderWinetricksRow`, `taskGroupName` and the test-harness factory exports had no consumer the analysis could see.
- **Fix:** Exports added only when their consumer landed (`RenderWinetricksRow` in Task 2); `taskGroupName` is consumed by the catalog-pinning label test from Task 1; the three harness factories carry `// ts-prune-ignore-next` with the reason (they are reached through `jest.requireActual('./treeHarness')` inside a hoisted `jest.mock` factory, a string path static analysis cannot follow).

---

**Total deviations:** 5 (1 Rule 1, 1 Rule 2, 3 Rule 3). **Impact:** no scope change; item 1 is a real bug in the 45-01 tracer that this plan's `Installed` rows depended on.

## Issues Encountered

- A shell heredoc containing curly quotes failed to parse on this box; the test file was written with the Write tool instead (project note 5). No file was left half-written.
- `react-hooks/rules-of-hooks` still warns on `index.tsx`'s `useEffect` after the `if (!runner)` early return. It is the same pre-existing warning (it moved from line 75 to 129 as the file grew); the lint ceilings pass (`production: PASS | tests: PASS`). Not fixed - out of scope.

## Known, Accepted, Temporary State

- The sticky bar, environment banner, empty-catalog state (E10), log disclosure and the `winetricks.loading-available` treatment are still the tracer-level versions in `index.tsx`; they are 45-08's, as its plan states.
- `winetricksBrowse.logEmpty`, `needsGuiTag` and `installingRow` remain in the catalog; 45-11 owns catalog removals.
- The 4-second lookup bound is a judgement call; it is a single constant (`SIGNAL_TIMEOUT_MS`) in `index.tsx`.

## Known Stubs

None. Scanned the created and modified files; no hardcoded-empty UI values, placeholders or unwired components. `knownFixVerbs` and `direct3DVersions` start empty by design and are filled from the two lookups before the tab leaves loading.

## Threat Flags

None. No new IPC channel, endpoint or file-access path. The renderer now calls the existing `getKnownFixes` and `getWikiGameInfo` preload APIs; T-45-19/20/21 are mitigated and test-pinned (renders only the backend's visibility-filtered catalog, text nodes only with no `dangerouslySetInnerHTML`, suggestions resolve only against the visible catalog).

## Verification

- `npx jest --selectProjects Frontend --silent --testPathPattern "(WinetricksSettings|DeferredChannelCallSiteGuard)"`: 8 suites, 116 tests passed
- `npm run codecheck`: exit 0
- `npx jest meta/__tests__/findDeadcode.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/lintTranslations.test.ts`: 4 suites, 410 tests passed
- `npx i18next --silent`: zero added or restored keys, no diff under `public/locales/`
- `node meta/lintScoped.cjs`: `production: PASS | tests: PASS` (0 errors)
- `npx prettier --check` over every path written: clean (none prettier-ignored)
- Acceptance greps: no `dangerouslySetInnerHTML` / `FilterFacetGroup'` / `components/UI/SearchBar` outside tests (exit 1); no template-literal keys in `labels.ts` or `Row/index.tsx` (0, 0); 18 `case '` arms in `labels.ts`; 0 `max-height|overflow` in `GroupHeader/index.scss` and `index.scss`; `position: sticky` x2 in the Everything else stylesheet; `resultsHeading` passes `count`
- Not run, by instruction: the full `npm test` (about 40 suites fail on this Windows box regardless of the change)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 45-08 can replace the tracer sticky bar, add the environment banner, log disclosure and the E10 empty state in `index.tsx`; the tiers above them are done.
- 45-12 owns the narrow-width, `de`-locale and two-theme visual checks that discharge the E3-E7 backstop rows, and the D-15 real-log measurement carried from 45-06.

## Self-Check: PASSED

- All 18 created files exist on disk; the three modified files carry the work.
- Commits `f250d26c8`, `7b640258f`, `b411969b6`, `d89757ed6`, `dc670ceb7`, `813ff6990` are in `git log`; `git log --grep "^test(45-07)"` shows 3 and `"^feat(45-07)"` shows 3 (RED before GREEN per task).
- Plan-level checks above all pass.

---
*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Completed: 2026-10-10*
