---
phase: 100-game-page-without-the-menu
plan: 01
subsystem: ui
tags: [react, game-page, install-tab, switch-row, themes, contrast, i18n]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "CONTEXT D-01/D-11/D-12/D-14/D-15/D-18/D-22 and the 012 A sketch"
provides:
  - "Install tab skeleton (InstallTab) with a Library & integration group and a working shortcuts switch row"
  - "Hook-free SwitchRow and RowFailure primitives (no flipping label, per-row pending, inline failure with Retry)"
  - "installActionGates (pure D-11 show/disabled/reason) and activeLongAction"
  - "rowAction (reducer, never-throw failure logging, runRowAction, useRowAction)"
  - "toggleShortcuts setFailed callback (rejection or contradicting answer)"
  - "--fav theme token in the body default and all 10 themes, plus contrast specs for the switch and inline failure"
affects: [100-02, 100-03, 100-04, 100-05, 100-06, 100-08, 100-09, 100-10]

plan_head_before: fb7f9b243740e4163f072a49e3286d9b8e7db8b7
plan_head_after: c14ece74d8b8fe455b11790cc75d1e454b612b07

actuals:
  tokens: 17100
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Hook-free presentational rows called as plain functions in node-env jest (walk the element tree)"
    - "Pure gating module (installActionGates) consumed by every Install-tab row"
    - "Row state machine idle/busy/failed with raw errors logged, never rendered (T-100-01)"
    - "Legacy rows kept in a .legacyRows wrapper so the old row CSS stays scoped during the rollout"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/IntegrationRows.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/SwitchRow.test.tsx
    - src/frontend/screens/Game/GamePage/actions/installActionGates.ts
    - src/frontend/screens/Game/GamePage/actions/rowAction.ts
    - src/frontend/screens/Game/GamePage/actions/__tests__/installActionGates.test.ts
    - src/frontend/screens/Game/GamePage/actions/__tests__/rowAction.test.ts
  modified:
    - src/frontend/screens/Game/GameSubMenu/shortcutsToggle.ts
    - src/frontend/screens/Game/GameSubMenu/__tests__/shortcutsToggle.test.ts
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/screens/Game/GamePage/components/index.tsx
    - src/frontend/themes.scss
    - src/frontend/customThemes/builtinTokens.generated.json
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "--fav uses one coral-pink literal (#ff5c8a) on dark themes, #fb4934 on gruvbox_dark, #ff79c6 on dracula and a dark red (#a03a45) on nord-light; the themes' own --danger tokens were rejected because they are dark reds meant for light text and fail 3:1 on dark bodies"
  - "Switch rows put the border on .switchRowWrap rather than .switchRow so the inline failure text sits above the row divider instead of below it"
  - "useRowAction and RowActionPhase are tagged @public for knip: plans 04-06 consume them, plan 01 proves the machine through the reducer and runRowAction tests"

patterns-established:
  - "Failure rule for a toggle: a rejection or an answer that contradicts the request is a failure; state is still set from the answer alone"
  - "Contrast specs resolve component-CSS declarations (flat rules, one per selector) against each theme and name the measured ratio in the failure object"

requirements-completed: [D-01, D-11, D-12, D-14, D-15, D-18, D-22]

coverage:
  - id: D1
    description: "Install tab shows a Library & integration group with an OS-labelled shortcuts switch row whose label never flips"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/SwitchRow.test.tsx#keeps the label text identical whatever the state (D-01)"
        status: pass
    human_judgment: true
    rationale: "Layout, wording per OS and visual fit inside the real right panel cannot be asserted without a rendered webview"
  - id: D2
    description: "Shortcuts switch flips only on the backend answer; pending pulses in-row without a spinner; a rejected or contradicting answer shows red inline text with Retry"
    requirement: D-18
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GameSubMenu/__tests__/shortcutsToggle.test.ts#setFailed (Phase 100 D-12/D-18)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/SwitchRow.test.tsx#busy: marks the row, ignores click and Space, shows the aside, renders no spinner"
        status: pass
    human_judgment: true
    rationale: "The live pulse, the Retry link and the real add/remove against the sidecar need a human to see them in the running app"
  - id: D3
    description: "installActionGates returns show/disabled/reason for every Install-tab action; a move disables Verify, Modify, Set folder and Uninstall while Open, Open prefix and Open saves stay live"
    requirement: D-11
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/actions/__tests__/installActionGates.test.ts#D-11 example: during a move"
        status: pass
    human_judgment: false
  - id: D4
    description: "rowAction busy/failed state machine and never-throw failure logging (raw error to console.error and logError only)"
    requirement: D-12
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/actions/__tests__/rowAction.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "--fav declared in every theme block and the body default; switch track, knob and inline-failure text clear their floors in all 10 themes"
    requirement: D-15
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts#Phase 100 game page tokens in every theme (D-15, D-22)"
        status: pass
    human_judgment: true
    rationale: "The source gate cannot see a pixel; a live look across themes still adjudicates the heart colour and track appearance"
  - id: D6
    description: "The ⋮ menu is untouched: GameSubMenu/index.tsx and DotsMenu.tsx are not edited"
    requirement: D-14
    verification:
      - kind: other
        ref: "git diff --name-only fb7f9b243..HEAD -- src/frontend/screens/Game/GameSubMenu/index.tsx src/frontend/screens/Game/GamePage/components/DotsMenu.tsx (empty)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-11-21
status: complete
---

# Phase 100 Plan 01: Install tab skeleton and the shortcuts switch row Summary

**Install tab skeleton with a Library & integration group whose shortcuts switch flips only on the backend's answer, plus the pure D-11 gating module, the row busy/failed machine and a contrast-proven `--fav` and switch token set across all 10 themes**

## Performance

- **Duration:** about 35 min (start time was not captured; estimated from commit times)
- **Completed:** 2026-11-21T09:45:22Z
- **Tasks:** 3
- **Files modified:** 21 (9 created, 12 modified)

## Accomplishments

- The right panel's info tab now renders `InstallTab`: the eight legacy rows unchanged inside `.legacyRows`, then a "Library & integration" group holding the shortcuts switch. The label is a noun per OS (Applications shortcut, Desktop & Start menu shortcuts, Desktop & app menu shortcuts) and never changes with state.
- `toggleShortcuts` gained an optional `setFailed` callback: cleared on start, set on rejection or an answer that contradicts the request. The existing never-rethrow and `setBusy(false)`-in-finally behaviour is intact and the existing tests are untouched.
- `installActionGates` and `activeLongAction` encode the D-11 gating (copied from the old ⋮ menu's show gates and disabled expressions) for all 13 Install-tab actions, with reasons.
- `rowAction` provides the reducer, a port of the three-signal logging without a dialog, `runRowAction` and `useRowAction`.
- `--fav` is declared in the body default and every theme block; contrast specs now measure the switch track, knob, `--fav` and the inline-failure text in all 10 themes. Lowest ratios: `--fav` 4.29:1 (gruvbox_dark), track-on vs body 3.91:1 (gruvbox_dark), knob vs track 3.23:1 (cyberSpaceOasis), failure text 6.21:1 (gruvbox_dark).
- Plan-end gates green: full Frontend project (376 suites, 6494 tests), codecheck, lint (0 errors), find-deadcode, gameinfo-narrowing-ceiling, DI ceilings, i18n and i18n-churn-guard, Meta i18n suites.

## Task Commits

1. **Task 1: Tracer, shortcuts switch row in a new Install tab panel** - `cd3210969` (feat)
2. **Task 2: Pure D-11 gating and the row busy/failed machine** (TDD)
   - RED `fb9fb410e` (test) - both test files committed with the implementation absent (jest: "Cannot find module")
   - GREEN `5073e3eb0` (feat)
   - i18n scope bookkeeping `85d2c6429` (chore)
3. **Task 3: --fav and switch-track tokens with contrast specs** - `c14ece74d` (feat)

**Plan metadata:** the docs(100-01) commit that carries this file.

## Decisions Made

- `--fav` values: coral-pink `#ff5c8a` on cyberSpaceOasis, midnightMirage, high-contrast, nord-dark, marine, zombie and sweet; `#fb4934` gruvbox_dark; `#ff79c6` dracula; `#a03a45` nord-light (the only light theme). The themes' own `--danger` tokens were not used: they are dark reds that fail 3:1 on the dark bodies.
- The switch row's divider lives on `.switchRowWrap` so the inline failure text renders inside the row's block, above the divider.
- `useRowAction` and `RowActionPhase` carry `@public` tags: they are the plan's declared exports and plans 04-06 consume them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Eight barrel exports became dead code**
- **Found during:** Task 3 (plan-end `pnpm find-deadcode`)
- **Issue:** Moving the legacy rows into `InstallTab` (which imports them by file path, as the plan requires) left `AppleWikiInfo`, `RunsForMeToggle`, `CloudSavesSync`, `DownloadSizeInfo`, `HumbleOriginInfo`, `NativePortInfo`, `InstalledInfo` and `PlatformSupport` exported from `GamePage/components/index.tsx` with no importer, failing the knip ratchet.
- **Fix:** Removed those eight lines from the barrel. No other file imported them from it.
- **Files modified:** `src/frontend/screens/Game/GamePage/components/index.tsx`
- **Verification:** `pnpm find-deadcode` PASS, `pnpm codecheck` clean, full Frontend project green
- **Committed in:** `c14ece74d`

**2. [Rule 3 - Blocking] knip flagged `useRowAction` and `RowActionPhase` as unused exports**
- **Found during:** Task 3 (plan-end `pnpm find-deadcode`)
- **Issue:** Both are planned exports consumed only by later plans.
- **Fix:** Tagged them `@public` with a note on the consuming plans, as the ratchet message prescribes.
- **Files modified:** `src/frontend/screens/Game/GamePage/actions/rowAction.ts`
- **Committed in:** `c14ece74d`

**3. [Rule 3 - Blocking] Task 2 TDD and i18n bookkeeping sequencing**
- **Found during:** Task 2
- **Issue:** `pnpm gen-i18n-gate-scope` derives the fork-touched list from committed history, so untracked/intent-to-add files were not picked up. The plan's task order (bookkeeping inside the same task) would have produced a 448-file list missing the two `actions/` files.
- **Fix:** Committed the RED tests, then the GREEN implementation, then ran the generator and the bookkeeping as a separate chore commit (445 -> 450 fork-touched, scope 322 -> 327).
- **Committed in:** `fb9fb410e`, `5073e3eb0`, `85d2c6429`

**Other small differences (no rule applied, within the plan's intent):** the switch row grid is three columns (`1fr auto auto`) so the busy aside has its own cell beside the track; the `.switchRow` border moved to the wrapper as noted above; `.switchRowWrap` is therefore an additional selector beyond the plan's CSS list (it was already named in the plan's artifacts list).

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All three were needed to clear the plan's own gates. No scope creep; no file outside the plan's intent was changed beyond the barrel.

## Issues Encountered

- The plan expected `public/locales/en/gamelib.json` to carry unrelated uncommitted hunks. It did not at execution time, so the whole `pnpm i18n` diff (the nine new `gamepage.installTab.*` keys) was this task's and was staged directly.
- A first attempt to dump per-theme ratios through a scratch copy of the test file failed to compile; the ratios were read by temporarily instrumenting the real test and restoring it (no instrumentation is committed).

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. `IntegrationRows` intentionally holds only the shortcuts row; Runs for me and Show in Steam are added by later plans of this phase, and the group renders nothing when no row applies.

## Threat Flags

None. No new network endpoint, auth path or trust boundary; T-100-01 (raw error never rendered), T-100-02 (state from `result === true` only) and T-100-03 (`setBusy(false)` in finally, runRowAction never rethrows) are covered by tests.

## Next Phase Readiness

- Plans 02-06 can build rows on `SwitchRow`/`RowFailure`, ask `installActionGates` what to show and disable, and run actions through `useRowAction`; `--fav` exists for plan 02's heart.
- Plan 09 owns deleting the ⋮ menu: `GameSubMenu/index.tsx` and `DotsMenu.tsx` are untouched here, so five source-text gates still read them.
- Owed: a live look at the Install tab in at least midnightMirage, gruvbox_dark and dracula (the source gate cannot see a pixel).

## Self-Check: PASSED

- Created files all exist on disk (InstallTab/{index,SwitchRow,IntegrationRows}.tsx, index.css, SwitchRow.test.tsx, actions/{installActionGates,rowAction}.ts and both tests).
- Commits `cd3210969`, `fb9fb410e`, `5073e3eb0`, `85d2c6429`, `c14ece74d` are ancestors of HEAD; `git rev-list --count fb7f9b243..HEAD` = 5.
- Acceptance greps: `className="installTab"` 1, `className="infoTab"` 0, `div.installTab .legacyRows` 1, `role="switch"` 1, `setFailed` 7 in shortcutsToggle.ts, `--fav:` 11 in themes.scss; `GameSubMenu/index.tsx` and `DotsMenu.tsx` unchanged.

---
*Phase: 100-game-page-without-the-menu*
*Completed: 2026-11-21*
