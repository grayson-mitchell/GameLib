---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 08
subsystem: ui
tags: [react, winetricks, settings, sticky-bar, log-panel, environment-banner, tdd, scss, remount-safety]

requires:
  - phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
    provides: "45-01 queue and Cancel remaining backend; 45-03 frozen winetricksBrowse copy; 45-05 deriveRowState and foldRunOutcomes; 45-06 classified lines, run.log and environment report; 45-07 tab body, treeHarness, tabFixtures, tokenCensus"
provides:
  - "StickyBar: rest / in-flight / done action bar with Cancel remaining that is disabled (never hidden) between verbs, on mousedown-capture"
  - "LogPanel: collapsed-by-default 160px role=log disclosure; curl rows as a percentage, only error lines red"
  - "EnvironmentBanner: persistent neutral info rows (darwin-only GPTK row, missing dependencies everywhere), no dismiss control, nothing when clean"
  - "Whole-tab list states: centered loading, empty-catalog treatment, fail-open installed-list read"
  - "Live percent and live classified lines from handleProgressOfWinetricks for the running verb; log seeded from run.log"
  - "remountSafety port: three independently reverted-to-red mount-gate triggers plus a remount-mid-run rebuild"
  - "common/winetricks/logBuffer.ts: appendLogLine shared by backend and renderer"
affects: [45-11, 45-12]

actuals:
  tokens: 29300
  tasks: 3
  commits: 5
plan_head_before: 862017cb802efa7b3a5caf011a6937e948126b1d
plan_head_after: 1916027df2cbd90ff1ffa15e80736847e339ff85

tech-stack:
  added: []
  patterns:
    - "Refs for listener-visible state: the progress listener is created once per (appName, runner), so the latest run and the seeded run id live in useRef, not state"
    - "Dock wrapper: one sticky container holds the log disclosure directly above the action bar, so the bar itself is plain flex"
    - "Per-trigger mount-gate revert-to-red: a temporary gate on the matching flag, run, capture, restore from a scratchpad copy"

key-files:
  created:
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/LogPanel/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/EnvironmentBanner/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/EnvironmentBanner/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/stickyBar.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/selectionLock.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/logPanel.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/environmentBanner.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/listStates.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/remountSafety.test.tsx
    - src/common/winetricks/logBuffer.ts
  modified:
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tabFixtures.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/applyTracer.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/groups.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/everythingElse.test.tsx
    - src/backend/tools/winetricksOutputClassifier.ts

key-decisions:
  - "The done summary persists until the selection changes: mode is done only while the latest run is done AND nothing is ticked, so ticking a row returns the bar to rest"
  - "Cancel remaining is disabled both between verbs (empty currentVerb, T-45-24) and once cancelRequested is true, so the press visibly took effect; it is never hidden"
  - "The in-flight text names the verb about to start while currentVerb is empty, so the gap never shows a blank title"
  - "Progress events are accepted only while this game's run is running exactly the verb named in the event: the payload carries a component, never a game, so another install's output is not ours to show"
  - "The 'Done' word stays derived (45-07) rather than timed; the plan's 1500 ms recentlyDone timer was not built, so the tab still contains no timer"
  - "A same-runId queue push keeps the live log; only an unseen runId reseeds from run.log (the plan's rule), because the live lines are newer than the push's snapshot"
  - "The installed-list read fails open (A-45-04): a failure there no longer declines the whole tab, because the catalog probe already decides whether the build supports the feature"
  - "appendLogLine moved to common/ so the renderer folds a live delta by the same progress-replace rule as the backend, rather than a drifting copy"

patterns-established:
  - "The dock: log disclosure above the bar inside one sticky wrapper owned by index.scss"
  - "Banner and bar text areas wrap or truncate by their own contract: banner wraps (informational), bar text truncates through the shared single-line mixin"

requirements-completed: [D-02, D-04, D-12, D-13, D-14, D-16, D-18, D-21]

coverage:
  - id: D1
    description: "Sticky bar: rest shows the selected count and an Apply whose accessible name carries the count; in flight shows 'Installing x of y . title' and Cancel remaining; done shows installed and, only when failed > 0, failed counts; the bar takes no error styling"
    requirement: "D-12"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/stickyBar.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Selection lock and Cancel: every checkbox and Retry disabled while the run is running, a toggle attempt changes nothing, winetricksCancelRemaining called once with (runner, appName), Cancel present but disabled between verbs"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/selectionLock.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live progress: the running verb's row shows 'Downloading N%' from progress events (ignored for other components, cleared when the verb changes or a non-progress line follows); classified lines append with progress-replace semantics and a 200-line cap; the panel is seeded from run.log and reseeded only for an unseen run"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/logPanel.test.tsx#the tab and the live log (D-14, D-18, A-45-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Log panel: collapsed behind a real aria-expanded button, 160px scrolling wrapping region, error lines the only red ones, noise muted, text as plain text nodes, expanded-empty shows logEmpty"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/logPanel.test.tsx#LogPanel (E9)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/logPanel.test.tsx#LogPanel stylesheet (E9-populated, E9-overflow, D-14)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Environment banner: darwin two rows, linux one row, nothing when clean, no button or dismiss control, neutral tokens, withheld while loading, wraps and never truncates"
    requirement: "D-16"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/environmentBanner.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Whole-tab list states: loading shows only the centered text, an empty catalog shows icon + heading + body with no banner, log or bar, a failed installed-list read still renders Available rows"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/listStates.test.tsx"
        status: pass
    human_judgment: false
  - id: D7
    description: "A run outlives navigation: the body mounts on !declined alone across a run starting, finishing and the post-run installed re-read (each proven red against its own temporary gate), and a remount mid-run rebuilds rows, bar and log without cancelling, applying, confirming or reaching for a dialog or toast"
    requirement: "D-18"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/remountSafety.test.tsx"
        status: pass
    human_judgment: false
  - id: D8
    description: "No stylesheet in the tab consumes a banned token and every var() has a fallback, now including the three new stylesheets"
    requirement: "D-21"
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts"
        status: pass
    human_judgment: false
  - id: D9
    description: "Narrow-width and long-locale presentation: bar text truncating before it pushes Cancel or Apply off, banner wrapping with all five tools missing, a 200-character log line wrapping inside 160px, and the visual weight of the sticky dock in two themes"
    verification: []
    human_judgment: true
    rationale: "These are the E2, E8 and E9 overflow / long-text backstop rows. SCSS truncation and wrapping rules are easy to write and silently not apply; only the compiled declarations and tokens are pinned here. The 45-12 live gate owns the narrow-viewport, de-locale and two-theme visual check."

duration: 30min
completed: 2026-10-10
status: complete
---

# Phase 45 Plan 08: Sticky bar, log disclosure, environment banner, list states and the remount-safety port Summary

**The Winetricks tab is now finished end to end: a three-mode sticky bar whose Cancel remaining is disabled between verbs, a collapsed 160px classified log fed live by progress events, a calm persistent environment banner, centered loading and empty-catalog states, live `Downloading N%` on the running row, and a ported remountSafety proof whose three mount-gate triggers were each reverted to red on their own.**

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-10-10T10:35Z
- **Tasks:** 3 (Tasks 1 and 2 each RED then GREEN; Task 3 a characterization lock proven by revert)
- **Files:** 20 source files changed (13 created, 7 modified), plus this summary

## Accomplishments

- `StickyBar` replaces the 45-01 inline footer. At rest it reads `N selected` with an Apply whose accessible name interpolates the count; in flight it reads `Installing x of y . title` with a neutral-outline Cancel remaining; when done it reads `N installed` and a separate `M failed` fragment only if something failed, with the ` . ` separator drawn in CSS. Cancel is rendered but disabled when `currentVerb` is empty and once `cancelRequested` is set. Apply and Cancel go through the shared mousedown-capture guard.
- `LogPanel` is a `<button aria-expanded>` plus a `role="log"` region that is always in the DOM (so `aria-controls` resolves) and only fills when expanded. A curl progress line renders as `Downloading N%`, never the raw meter row; only `log-error` lines use the danger token; `noise` is muted; an expanded empty log shows `logEmpty`.
- `EnvironmentBanner` renders one neutral `faCircleInfo` row per applicable warning: the GPTK row on darwin only (A-45-05) and the missing-dependencies row on every platform. It has no button, no dismiss control, no cautionary icon or status token, and renders nothing at all when clean.
- `index.tsx` subscribes `handleProgressOfWinetricks`: for the verb this game's run is installing it stores a verb-keyed percent and folds the delta lines into the log with the backend's progress-replace rule and a 200 cap. A run this tab has not seen (remount mid-run, fresh run) seeds the log and percent from `run.log`.
- List states: loading is only the centered `winetricks.loading-available` text; an empty catalog is icon + `emptyHeading` + `emptyBody` with no banner, log disclosure or bar; a failed installed-list read leaves every row Available.
- `remountSafety.test.tsx` proves the body stays mounted across a run starting, finishing and the post-run installed re-read, and that a remount mid-run rebuilds rows, bar and log from `winetricksQueueState` with no cancel, apply, confirm, dialog or toast.

## Task Commits

1. **Task 1: Sticky bar and selection lock**
   - `7913d8b33` test(45-08): failing tests - 21 of 31 failing on assertions (inert type-correct StickyBar stub)
   - `3f0a17847` feat(45-08): extract the sticky bar with rest, in-flight and done modes
2. **Task 2: Log panel, environment banner, live percent, list states**
   - `91d10a5de` test(45-08): failing tests - 43 of 53 failing on assertions (inert stubs)
   - `e0fe6ea3b` feat(45-08): classified log panel, environment banner, live percent and list states
3. **Task 3: remountSafety port**
   - `1916027df` test(45-08): port remountSafety and prove a run outlives navigation (no production change was needed, so there is no `feat` commit for this task; the proof of value is the recorded reverts below)

**Plan metadata:** the `docs(45-08)` commit that carries this file.

## RED evidence

Task 1 RED ran against an inert `StickyBar` stub (same props, returns an empty div). Examples: `zero selected: reads "0 selected"` expected `"0 selected"`, received `""`; the tab-level Cancel tests threw `expected one Cancel remaining button, saw 0`; 21 of 31 failed, 10 passed (non-vacuity anchors and regressions of 45-07 behaviour that already held, such as the checkbox lock itself).

Task 2 RED ran against inert `LogPanel` and `EnvironmentBanner` stubs plus empty stylesheets. Examples: `E2-empty` expected `null`, received the stub div; the LogPanel stylesheet case expected `/height:\s*160px/` against a comment-only file; every tab-level progress case failed because no progress listener was subscribed; the empty-catalog case found no `WinetricksEmptyState`. 43 of 53 failed, 10 passed.

The plan is `type: execute`, so `gsd-tools check tdd-red-evidence` was not required; the runs are quoted instead, as in 45-05 through 45-07.

## Revert-to-red (Task 3, D-04)

The test was ported from git SHA **`e297ec0df^`** (`e297ec0df` is the 45-02 deletion commit): `git show e297ec0df^:src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx`. `index.tsx` was copied to the scratchpad first; each trigger was reverted by a temporary gate on its own flag around the populated branch, the file run, the output captured, and the copy restored with `cp` (never `git checkout --`). After each, `git diff --quiet HEAD -- index.tsx` held, and the final `cmp` against the pre-experiment copy was identical.

| Trigger | Temporary gate | Cases that went red | Cases that stayed green |
| --- | --- | --- | --- |
| 1, run starts | `&& !isRunning` | trigger 1, and remount-mid-run (its fixture is a running run) | triggers 2 and 3, failure end |
| 2, run finishes | `&& !isDone` | trigger 2, trigger 3, failure end (both pass through the done state) | trigger 1, remount-mid-run |
| 3, installed re-read in flight | new `revalidating` state set around `reloadInstalled`, `&& !revalidating` | trigger 3 only | triggers 1 and 2, failure end, remount-mid-run |

Verbatim failures (the assertion output, trimmed to the diff and failing line):

- **Trigger 1** `trigger 1, a run starts: a winetricksQueueChanged push with status running leaves the same body mounted`:
  ```
  expect(received).toEqual(expected) // deep equality
  - Expected  - 23
  + Received  +  5
  -   "dock": 1,   -   "everythingElse": 1,   -   "suggested": 1,   -   "taskGroups": 5,
  +   "dock": 0,   +   "everythingElse": 0,   +   "rows": Array [],   +   "suggested": 0,   +   "taskGroups": 0,
  > 173 |     expect(bodyOf(during)).toEqual(before)
  ```
- **Trigger 2** `trigger 2, a run finishes: the done state (status done) leaves the same body mounted`: the same diff (`- Expected - 23`, `+ Received + 5`, every tier `1/5/1/1` expected and `0` received, `rows` expected 17 verbs and received `[]`), failing at `> 190 |     expect(bodyOf(after)).toEqual(before)`.
- **Trigger 3** `trigger 3, the post-run installed-list re-read is in flight: the body stays mounted for the whole window`: the same diff, failing at `> 213 |     expect(bodyOf(during)).toEqual(before)`, the render taken while the re-read is held open.

Honest limit of the harness: it keeps a component instance's state even if a pass does not render it, so a real unmount cannot be observed. What does break under a gate, and is asserted, is that the tiers and rows are absent from the pass rendered during the trigger window. Triggers 2 and 3 are inherently sequential (the re-read only happens after a done push), so gate 2 also reds the trigger 3 case; trigger 2's case was shaped to settle the re-read and push the finished run a second time precisely so that gate 3 leaves it green.

## Files Created/Modified

See `key-files`. Frontend files created, for 45-11's locale-key census: `StickyBar/index.tsx`, `StickyBar/index.scss`, `LogPanel/index.tsx`, `LogPanel/index.scss`, `EnvironmentBanner/index.tsx`, `EnvironmentBanner/index.scss`, and the six test files `stickyBar`, `selectionLock`, `logPanel`, `environmentBanner`, `listStates`, `remountSafety` (all under `src/frontend/screens/Settings/sections/WinetricksSettings/`, tests in `__tests__/`). Modified frontend files that carry locale-key consumers: `index.tsx` (`emptyHeading`, `emptyBody`).

## Decisions Made

See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `appendLogLine` moved to `common/` with a backend re-export**
- **Found during:** Task 2
- **Issue:** The plan has the renderer fold live deltas "with progress-replace semantics and a 200-line cap", which is exactly the backend's `appendLogLine`. No frontend file imports runtime code from `backend/`, and a copy would let the two rules drift.
- **Fix:** The function body moved verbatim to `src/common/winetricks/logBuffer.ts`; `winetricksOutputClassifier.ts` now `export { appendLogLine } from 'common/winetricks/logBuffer'`, so every backend import and the existing classifier test are untouched.
- **Files modified:** `src/common/winetricks/logBuffer.ts` (new), `src/backend/tools/winetricksOutputClassifier.ts` (outside the plan's `files_modified`)
- **Verification:** Backend `winetricksOutputClassifier winetricksQueue winetricksInstallLifecycle` 3 suites / 71 tests pass; `findDeadcode` passes.
- **Committed in:** `e0fe6ea3b`

**2. [Rule 1 - Bug, test of a superseded mechanism] 45-07's percent test read the tail of every pushed `run.log`**
- **Found during:** Task 2
- **Issue:** `groups.test.tsx` "shows a live download percentage ..." drove the percent by pushing a second queue state with the same run id and a different `log`. The plan replaces that mechanism with live progress events and reseeds the log only for an unseen run id, so the old drive no longer applies.
- **Fix:** The same two assertions (`Downloading 42%`, then `Installing…` once a non-progress line follows) are now driven through `handleProgressOfWinetricks`. No assertion was weakened.
- **Files modified:** `__tests__/groups.test.tsx`
- **Committed in:** `e0fe6ea3b`

**3. [Rule 3 - Blocking] A sixth test file and shared-fixture changes outside `files_modified`**
- **Found during:** Tasks 1 and 2
- **Issue:** The E10 list-state rows (loading, empty catalog, fail-open installed read) fit none of the five named test files, and the tab tests needed the progress listener, an environment-bearing queue state and a `platform` on the mounted context.
- **Fix:** Added `__tests__/listStates.test.tsx`; extended `tabFixtures.ts` (`handleProgressOfWinetricks` on `MockApi`, `capturedProgressListener`, `idleStateWith`, an `environment` argument on `queueStateWith`, a `platform` argument on `mountTab`); added the three new stylesheet mocks to `applyTracer`, `groups` and `everythingElse`.
- **Committed in:** `7913d8b33`, `91d10a5de`

**4. [Rule 2 - Missing Critical] Installed-list read fails open instead of declining the tab**
- **Found during:** Task 2
- **Issue:** The 45-07 code called `setDeclined(true)` when the installed-list read failed, which contradicts A-45-04 and the E10-partial truth (catalog loaded, installed read failed: rows render as Available).
- **Fix:** A failed installed read sets `installed` to `[]` and continues; the catalog probe still decides declination, and the queue-state probe still declines.
- **Committed in:** `e0fe6ea3b`

**5. [Plan variance, no code consequence] The `position: sticky` lives on the dock, not on `.WinetricksStickyBar`**
- **Found during:** Task 1
- **Issue:** The plan puts `position: sticky; bottom: 0` on the bar and also wants the log panel "directly above the StickyBar inside the bar region". Two sticky siblings would not stay adjacent.
- **Fix:** `.WinetricksSettings__dock` (index.scss) is the one sticky element holding LogPanel then StickyBar. The bar is plain flex. Same behaviour, one pinned region.

**6. [Plan variance] The 1500 ms `recentlyDone` timer was not built**
- **Found during:** Task 2
- **Issue:** The plan and the orchestrator notes disagree on a timer. 45-07 already derives the `Done` word (a row shows `phaseDone` while its run is running and its own outcome is `installed`), and the orchestrator instruction is to keep that discipline.
- **Fix:** None needed; the tab still contains no timer, so there is nothing to clear on unmount.

---

**Total deviations:** 6 (1 Rule 1, 1 Rule 2, 2 Rule 3, 2 plan variances). **Impact:** no scope change. Item 4 fixes a contradiction between 45-07 and the plan's own E10-partial truth; item 1 touches one backend file only to share a pure function.

## Issues Encountered

- `npm run lint` reached its warning ceiling exactly (638 of 638) after the first GREEN run because three new tests used `String(el.props.className ?? '')`, which `@typescript-eslint/no-base-to-string` warns on; the three sites now narrow with `typeof ... === 'string'` and `lint` is `production: PASS | tests: PASS`.
- A shell heredoc with a backslash escape could not be trusted on this box (project note 5); a script anchored on `// Splits on` instead of the backslash-bearing comment did the `appendLogLine` move. The moved file and the shortened classifier were read back and are as intended.
- `react-hooks/rules-of-hooks` still warns on `index.tsx`'s `useEffect` after the `if (!runner)` early return. Same pre-existing warning as 45-07 (moved to line 190); counted inside the ceiling, not fixed - out of scope.

## Known, Accepted, Temporary State

- **A few lines can appear twice in the log at a seed boundary.** `run.log` is appended per line while `progressOfWinetricks` is flushed on an interval, so a tab that seeds from `winetricksQueueState` mid-run can receive, as a flush a moment later, lines the snapshot already held. The window is one flush interval and only on a remount or a fresh run's first push; there is no line id to dedupe on. The live gate (45-12) should look for it.
- **Lines emitted between `winetricksApply` accepting and the tab recording the new run are dropped from the live view** (`latestRun` is updated on the apply response and on the queue push, whichever comes first); they remain in `run.log`, and a remount recovers them.
- `winetricksBrowse.needsGuiTag` and `winetricksBrowse.installingRow` have no consumer anywhere under `src/frontend` or `src/common` (confirmed by a census of every non-test `winetricksBrowse.*` literal). 45-11 owns their removal. `logEmpty` is now consumed.
- Layout/overflow rows that need a real viewport are backstop-verified by 45-12: E2 overflow and long-text, E8 overflow and long-text (bar text truncation), E9 overflow and long-text (a 200-character line in the 160px panel), and the two-theme look of the dock.

## Known Stubs

None. Scanned the created and modified files; no hardcoded-empty UI values, placeholders or unwired components. The `LogPanel` and `EnvironmentBanner` RED stubs were replaced in the GREEN commit.

## Threat Flags

None. No new IPC channel, endpoint or file-access path; the renderer subscribes `handleProgressOfWinetricks` and calls `winetricksCancelRemaining`, both of which already existed. T-45-23 is mitigated and test-pinned (log text and banner values reach the DOM only as React text nodes; no `dangerouslySetInnerHTML` anywhere in the tab); T-45-24 is mitigated and test-pinned (Cancel disabled while `currentVerb` is empty and after `cancelRequested`); T-45-22 is accepted as planned (paths shown only in the user's own window, behind a collapsed disclosure).

## Verification

- `npx jest --selectProjects Frontend --silent --testPathPattern "(WinetricksSettings|DeferredChannelCallSiteGuard)"`: 14 suites, 208 tests passed
- `npx jest --selectProjects Frontend --silent stickyBar selectionLock applyTracer` (Task 1's command): 3 suites passed; `logPanel environmentBanner tokenCensus applyTracer` (Task 2's): 4 suites passed
- `npx jest --selectProjects Backend --silent winetricksOutputClassifier winetricksQueue winetricksInstallLifecycle`: 3 suites, 71 tests passed
- `npm run codecheck`: exit 0; `npx tsc --noEmit -p tsconfig.json`: 0 `error TS`
- `npx jest meta/__tests__/findDeadcode.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/lintTranslations.test.ts`: 4 suites, 410 tests passed
- `npm run lint`: `production: PASS | tests: PASS` (638 warnings, 0 errors, at the ceiling)
- `npx i18next --silent`: no added or restored keys, no change under `public/locales/`
- `npx prettier --check` over every path written: clean (`src/frontend/**` is not prettier-ignored)
- Acceptance greps: `overflow-y: auto|scroll` is 1 in `LogPanel/index.scss` and 0 in every other tab stylesheet; `faTriangleExclamation|faXmark|--danger|--status` is 0 in both EnvironmentBanner files; no `dangerouslySetInnerHTML` outside tests; every `selectedCount`, `installedCount`, `failedCount` and `applyAriaLabel` call in `StickyBar/index.tsx` passes `count`
- Not run, by instruction: the full `npm test` (about 40 suites fail on this Windows box regardless of the change)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **45-11** (locale census and removals): `winetricksBrowse.*` keys now consumed by this plan's files: `StickyBar` (`selectedCount`, `applyAriaLabel`, `apply`, `installingBar`, `cancelRemaining`, `installedCount`, `failedCount`), `LogPanel` (`showDetails`, `hideDetails`, `logEmpty`, `phaseDownloading`), `EnvironmentBanner` (`environmentBannerGptk`, `environmentBannerMissingDeps`), `index.tsx` (`emptyHeading`, `emptyBody`), plus translation `winetricks.loading-available`. Keys with no consumer: `needsGuiTag`, `installingRow`. No new keys were added.
- **45-12** (live gate) owns: the narrow-width, `de`-locale and two-theme checks for the E2, E8 and E9 overflow rows; whether the dock's sticky behaviour holds inside `.App .content`; the duplicated-line window at a seed boundary; and the D-15 real-log measurement carried from 45-06.
- This is the last frontend plan: nothing else consumes frontend exports. Every new export is default-exported and consumed by `index.tsx`; `logBuffer.appendLogLine` is consumed by both `index.tsx` and the backend classifier re-export.

## TDD Gate Compliance

Plan `type: execute` with `tdd="true"` tasks. Task 1 and Task 2 each have a `test(45-08)` RED commit before the `feat(45-08)` GREEN commit (`git log --grep "^test(45-08)"` shows 3, `"^feat(45-08)"` shows 2). Task 3 is a characterization lock of behaviour that 45-01 and 45-07 already implemented: it has a `test(45-08)` commit and no `feat(45-08)` commit because the plan says to change `index.tsx` only if a case fails for a real reason, and none did; red was demonstrated by the three recorded reverts instead.

## Self-Check: PASSED

- All 13 created files exist on disk; the modified files carry the work.
- Commits `7913d8b33`, `3f0a17847`, `91d10a5de`, `e0fe6ea3b`, `1916027df` are in `git log`.
- Plan-level checks above all pass.

---
*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Completed: 2026-10-10*
