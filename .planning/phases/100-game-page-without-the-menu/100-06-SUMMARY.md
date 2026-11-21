---
phase: 100-game-page-without-the-menu
plan: 06
subsystem: ui
tags: [react, game-page, install-tab, switch-rows, danger-zone, uninstall, i18n]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plan 01 SwitchRow, useRowAction/reportRowActionFailure, installActionGates and IntegrationRows; plan 04 gateReasonText; plan 05 the cloud-saves and Auto-sync rows already in IntegrationRows"
provides:
  - "actions/useSteamShortcut.ts: addedToSteam / steamRefresh / steamFailed state, an isAddedToSteam probe and handleAddToSteam copied from the menu, failing inline"
  - "Show in Steam switch row in Library & integration for every runner that can add a shortcut, installed or not (the only row for a game that is not installed)"
  - "RunsForMeToggle reshaped in place as a SwitchRow (macOS, non-native) rendered first in Library & integration, state from the backend's returned map only"
  - "actions/useUninstallActions.ts: Uninstall and Remove all copies handlers copied from the menu with both confirmations intact"
  - "InstallTab/DangerZone.tsx: the last block of an installed game's Install tab, owning its UninstallModal"
affects: [100-08, 100-09, 100-10]

plan_head_before: 5983e7a5d972923034ed886cd0e56ee8ef6c706c
plan_head_after: 4211225439a3fc6ff61c7a20dca6b38ed7483401

actuals:
  tokens: 15535
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A hook per action family (useSteamShortcut, useUninstallActions) beside useInstallLocationActions; each copies the menu handler verbatim and replaces its error dialog with reportRowActionFailure plus an inline failure flag"
    - "A component that must be a hook caller reuses useRowAction for busy/failed instead of hand-rolled state (RunsForMeToggle)"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/actions/useSteamShortcut.ts
    - src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/DangerZone.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/IntegrationRows.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GameSubMenu/__tests__/longRunningCallSiteGuard.test.ts
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "The danger-zone border mixes --install-danger-text into --border-color, not the raw danger token: danger at 35% and then 50% left gruvbox_dark under the 3:1 non-text floor (2.85 and 2.55), because that theme's danger is darker than its border; the derived text token is the one the failure text already proves at 6.21:1"
  - "Runs for me renders only for installed games inside Library & integration; a not-installed game's group shows Show in Steam alone, as the plan specifies (it previously showed Runs for me in the legacy rows regardless of install state)"
  - "The Show in Steam probe depends on the capability alone, not on is_installed, so a shortcut that outlived an uninstall still reads as on"

patterns-established:
  - "Source gates pin 'nothing renders after DangerZone' so a later plan cannot put a row below the destructive block"

requirements-completed: [D-01, D-11, D-12, D-13, D-14, D-18]

coverage:
  - id: D1
    description: "Show in Steam is a switch row for every non-Steam game, installed or not; it flips only on the backend's answer, pulses while pending, and an add that answers false or a rejection shows inline red text with Retry"
    requirement: D-18
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GameSubMenu/__tests__/longRunningCallSiteGuard.test.ts#useSteamShortcut handleAddToSteam clears steamRefresh in a finally block"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#Show in Steam never opens a dialog and gates on canAddSteamShortcut, not on is_installed (D-01, D-12, D-18)"
        status: pass
    human_judgment: true
    rationale: "Forcing a rejected or false add to see the inline text, and the row's placement for a game that is not installed, need the running app"
  - id: D2
    description: "Runs for me is a switch row on macOS non-native games whose state comes from the backend's returned map; a failed write shows inline with Retry"
    requirement: D-12
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#Runs for me is a SwitchRow that sets state only from the backend map, first in Library & integration (D-01, D-18)"
        status: pass
    human_judgment: true
    rationale: "The macOS-only gate and the auto-set note under the description need a look on a Mac"
  - id: D3
    description: "The danger zone is the last block of an installed game's Install tab with a red Uninstall… and, for Steam, Remove all copies…, both disabled with a reason while the game plays or another long action runs"
    requirement: D-11
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#the danger zone is the last block of the tab, owns UninstallModal and keeps both confirmations (D-01, D-13, T-100-17, T-100-18)"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts#danger-zone border (--install-danger-text mixed into --border-color) is >= 3:1 against --body-background (10 themes)"
        status: pass
    human_judgment: true
    rationale: "Whether the red block reads as a danger zone in each theme, and that it is not reachable mid-play, need the running app"
  - id: D4
    description: "Uninstall and Remove all copies keep their confirmations: UninstallModal for non-Steam, steamUninstallNeedsConfirm failing closed for Steam, and the Remove all copies confirm"
    requirement: D-13
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GameSubMenu/__tests__/steamUninstallConfirm.test.ts"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#no fact or switch row calls window.api.uninstall; the danger zone hook alone does (D-01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GamePage's dead uninstall-modal state is gone"
    requirement: D-14
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#GamePage keeps no dead uninstall modal state (Pitfall 6)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-11-21
status: complete
---

# Phase 100 Plan 06: Show in Steam, Runs for me and the danger zone Summary

**Show in Steam and Runs for me become switch rows that follow the backend's answer and fail inline, and an installed game's Install tab now ends in a red danger zone holding Uninstall… and Remove all copies… behind their existing confirmations**

## Performance

- **Duration:** 13 min
- **Tasks:** 3 of 3
- **Files:** 15 changed (3 created)

## Accomplishments

- Show in Steam is a switch row under Library & integration for every runner that can add a non-Steam shortcut, installed or not; for a game that is not installed it is the only row. The probe and `handleAddToSteam` are copied from the menu, the `finally { setSteamRefresh(false) }` is kept, and an add answering false or a rejection shows fixed text with Retry instead of an error dialog.
- Runs for me is a switch row (macOS, non-native) at the top of the group. The switch flips only from the map `setRunsForMe` returns; a failed write shows inline with Retry. The `ToggleSwitch` and its wrapper div are gone.
- The danger zone closes an installed game's Install tab: one line of consequence text, a red Uninstall… and, for Steam, Remove all copies…. Both use `aria-disabled` plus a reason tooltip from the plan 01 gates, so they stay in the focus ring but do nothing while the game plays or another long action runs.
- Uninstall keeps its confirmation: UninstallModal for non-Steam games; for Steam, `steamUninstallNeedsConfirm` decides (a rejected route query falls back to `CLOSED_STEAM_DELETE_ROUTE`, so the modal opens). Remove all copies keeps its "Remove all copies?" confirm as the only path to `steamRemoveAllCopies`.
- GamePage no longer holds the uninstall-modal state and mount that nothing opened (Pitfall 6).
- The menu (GameSubMenu, DotsMenu) is untouched and still offers every item until plan 09.

## Task Commits

1. **Task 1 (tracer): Show in Steam switch row end to end** - `75a50ae29`
2. **Task 2: Runs for me as a switch row** - `a0357f228`
3. **Task 3: danger zone, dead page state removed** - `69187961b`
4. **i18n scope bookkeeping (fork-touched 468 to 471, scope 345 to 348), unused type export dropped** - `421122543`

The tracer's `<verify>` passed end to end (jest, codecheck, prettier) before the expansion tasks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Danger-zone border could not reach 3:1 in gruvbox_dark by raising the danger weight**
- **Found during:** Task 3
- **Issue:** the plan's border `color-mix(var(--danger…) 35%, var(--border-color))` measured 2.85:1 in gruvbox_dark, and its instruction to raise the danger weight made it worse (50% gave 2.55:1) because that theme's danger token is darker than its border.
- **Fix:** mix `--install-danger-text` (the danger token pulled towards the body text, already proven at 6.21:1 as failure text) into `--border-color` at 60%. All ten themes now clear 3:1; no literal colours. The border is declared as `border-width`, `border-style` and `border-color` longhands so the spec can resolve the colour declaration.
- **Files modified:** InstallTab/index.css, themeTokens.test.ts
- **Commit:** 69187961b

**2. [Rule 3 - Blocking] Unused `UninstallActions` type export failed knip**
- **Found during:** Task 3 plan-end gates
- **Issue:** `find-deadcode` flagged `export type UninstallActions` in useUninstallActions.ts as a new finding.
- **Fix:** removed the type (nothing consumed it).
- **Commit:** 421122543

**3. [Plan observation] Runs for me no longer shows for a game that is not installed**
- Before this plan it rendered in the legacy rows for any game. The plan puts it in the installed-game rows and says a not-installed game's group shows Show in Steam alone, so it is now rendered only when `is_installed`.

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking), 1 observation. **Impact:** none on scope.

## Known Stubs

None.

## Issues Encountered

None beyond the deviations above. A shell `&&` chain with a failing `sed` silently skipped the test-file edit once; caught by re-reading the diff before running the gates.

## Notes for Later Plans

- `useUninstallActions` imports `steamUninstallConfirm` from `../../GameSubMenu/`; plan 09 moves the module and must repoint that import, and retarget the GameSubMenu case in `longRunningCallSiteGuard.test.ts` (the `useSteamShortcut` case already exists beside it).
- `.legacyRows` now holds only `AppleWikiInfo`; plan 08 moves it and removes the wrapper.
- `ROADMAP.md` carries another session's uncommitted phase-85 hunk (and a staged 85-22 to 85-25 plan rename sits in the index), so this plan did not stage either; see the final report.

## Threat Flags

None. The boundaries touched are the existing renderer-to-sidecar uninstall, remove-all-copies and Steam shortcut commands, unchanged in shape. T-100-17 (route query fails closed, button disabled during play or a long action), T-100-18 (the confirm is the only path to `steamRemoveAllCopies`) and T-100-19 (fixed translated failure text, raw errors only through `reportRowActionFailure`) are covered by the source gates above.

## Self-Check: PASSED

- Created files exist: useSteamShortcut.ts, useUninstallActions.ts, DangerZone.tsx.
- Commits `75a50ae29`, `a0357f228`, `69187961b`, `421122543` are ancestors of HEAD.
- Acceptance criteria: `handleAddToSteam` count 1, `useSteamShortcut` in the guard test 2, `ToggleSwitch` in RunsForMeToggle 0, `SwitchRow` 2, `showUninstallModal` in GamePage 0, `<UninstallModal` in DangerZone 1, `steamUninstallNeedsConfirm` in useUninstallActions 3.
- Plan gates: full Frontend jest 6636 passed (382 suites), Meta genI18nGateScope and hardcodedStringGate passed, codecheck, lint (0 errors), find-deadcode, narrowing ceiling, DI shard and frontend DI check (0 failures), i18n churn guard, prettier over every touched non-ignored path.
