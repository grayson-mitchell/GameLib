---
phase: 100-game-page-without-the-menu
plan: 09
subsystem: ui
tags: [react, game-page, deletion, gates, ratchets, i18n-scope, css]
status: complete

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plans 01-08: every item the ⋮ menu held has a home (Install tab rows, danger zone, EosOverlaySetting, Logs tab, install caret, Ratings tab)"
provides:
  - "The game page has no ⋮ menu: the dock holds status, Install/Play/Update, the launch option and ⚙ (D-01)"
  - "shortcutsToggle.ts and steamUninstallConfirm.ts (with their tests) live in GamePage/actions/; the long-running call-site guard moved with them and reads useSteamShortcut"
  - "Every gate keyed to the deleted files retargeted (EOS guard lives in EosOverlaySetting, shortcuts source gate reads IntegrationRows, dialog census back to five files, themeTokens is-text census 13)"
  - "D-07/D-08 GameCard guard in cardVisibility.test.ts: the right-click menu still holds exactly 18 items, Logs, Categories and Settings included"
  - "Dead .game-actions/.gameTools CSS and the specs that measured it are gone"
affects: [100-10]

plan_head_before: ff8be5a4ec98b3bf9bd13a367ff7a96d10efbb32
plan_head_after: 14258b9d6a586a5fe2583a570db0a80fb11e1dbc

actuals:
  tokens: 32800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A deleted component's gates are retargeted to the code that now holds the behaviour; only gates whose premise vanished are deleted, and the replacement for the D-07 half sits on the GameCard side"
    - "The fork-touched i18n list is hand-edited in the same commit as a deletion, then confirmed by regeneration (only generatedAt differs), so the A-17 anti-rot spec is green at every commit"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/actions/shortcutsToggle.ts (git mv)
    - src/frontend/screens/Game/GamePage/actions/steamUninstallConfirm.ts (git mv)
    - src/frontend/screens/Game/GamePage/actions/__tests__/shortcutsToggle.test.ts (git mv)
    - src/frontend/screens/Game/GamePage/actions/__tests__/steamUninstallConfirm.test.ts (git mv)
    - src/frontend/screens/Game/GamePage/actions/__tests__/longRunningCallSiteGuard.test.ts (git mv)
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/helpers/steamInstallOptionsEntry.ts
    - src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
  deleted:
    - src/frontend/screens/Game/GamePage/components/DotsMenu.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/DotsMenu.disclosure.test.tsx
    - src/frontend/screens/Game/GameSubMenu/ (index.tsx, index.css, repairFailure.ts, EOS decline guard, tileMenuParity, repairFailure tests)

key-decisions:
  - "The shortcuts source gate now reads IntegrationRows by slicing from `const handleShortcuts = () =>` to the next declaration, because the handler is an expression-bodied arrow and a brace-balanced block would return only the options object literal"
  - "The dock spec asserts the absence of any `<...Menu` element and faEllipsisV rather than naming the deleted component, so the plan's stale-path grep stays clean"
  - "themeTokens: the game-menu helper functions (gameMenuColourCandidates, gameMenuBaseForeground) go with the specs, since the first would throw on the removed .gameTools CSS"

requirements-completed: [D-01, D-07, D-08, D-14]

coverage:
  - id: D1
    description: "The game page footer has no ⋮ menu; DotsMenu and the GameSubMenu directory no longer exist"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts#L6"
        status: pass
    human_judgment: true
    rationale: "That nothing the menu offered is lost is the UAT in plan 10; the source gate only proves the element is not mounted"
  - id: D2
    description: "Every gate that read the deleted files is retargeted: EOS guard, long-running guard, shortcuts source gate, dialog census (5), themeTokens census (13)"
    requirement: D-14
    verification:
      - kind: unit
        ref: "pnpm exec jest --selectProjects Frontend (382 suites, 6608 tests)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/dialogOptionForwarding.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The library card right-click menu is unchanged by the phase: 18 items, Logs and Categories still reachable"
    requirement: D-07
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts#right-click menu unchanged by Phase 100 (D-07, D-08)"
        status: pass
    human_judgment: true
    rationale: "A source gate pins the item set; that Logs opens the settings dialog on its Logs tab is plan 10's live check"
  - id: D4
    description: "Dead .game-actions/.gameTools CSS removed; the MainButton and pure .is-text contrast families still pass in all 10 themes"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts"
        status: pass
    human_judgment: false

duration: 85 min
completed: 2026-11-22
---

# Phase 100 Plan 09: Delete the ⋮ menu and retarget every gate keyed to it Summary

**The game page no longer carries a ⋮ menu: DotsMenu and the GameSubMenu directory are deleted, the two surviving pure modules moved into GamePage/actions with their tests, every source gate and ratchet keyed to the deleted files was retargeted (not dropped), and the GameCard now carries its own D-07 guard pinning the 18-item right-click menu.**

## Performance

- **Duration:** about 85 min (start time not captured at spawn; estimated from the session)
- **Completed:** 2026-11-22
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files:** 42 changed across both commits (194 insertions, 3018 deletions)

## Accomplishments

- Mount, barrel export, `DotsMenu.tsx`, its disclosure test and the whole `GameSubMenu/` directory removed; the dock order spec now asserts the footer ends at the gear and that no menu element is mounted.
- `shortcutsToggle` and `steamUninstallConfirm` moved with `git mv` (history follows); `useUninstallActions`, `IntegrationRows` and `UninstallModal` import the new paths. The long-running guard dropped its GameSubMenu case and keeps the `useSteamShortcut` case.
- The shortcuts source gate now reads `IntegrationRows`: delegates to `toggleShortcuts(`, never calls `setHasShortcuts(`, passes `busy={shortcutsBusy}` to the switch row and has no spinner swap.
- `showSteamSubMenuInstallOptions` and `SteamSubMenuInstallOptionsState` deleted with their specs (B1-B4, D1-D5); `steamEligibilityWiring` ORIGIN_CONTROLS is MainButton and GameCard; the dialog census is back to five files, seven calls.
- themeTokens is-text census re-derived to 13 total / 1 is-link; Task 2 then removed the `.gameTools` setup and the specs that measured it. The MainButton and pure `.is-text` families are untouched and still run 10 theme cases each.
- D-07 guard added to `cardVisibility.test.ts`: exactly 18 `onclick:` entries between `const items: Item[] = [` and `const wrapperClasses`, plus the Logs, Categories, Settings, Hide, Unhide, Favourite, Unfavourite, Edit, Uninstall and Remove-from-recent handlers, with a SANITY spec proving the count check trips on a copy missing one item. `GameCard/index.tsx` is not edited.
- Ratchets: DotsMenu entry removed from the frontend-screens-game DI shard, GameSubMenu count and reason removed from the gameInfo narrowing baseline; no knip baseline line was added or needed.
- i18n scope: scope 351 -> 348 and fork-touched 474 -> 471 (three files leave both lists; the two moved modules were renamed in place in DECLARED_UNSCANNED_DEBT and swapped in the fork-touched list); dated history entry added.
- Dead CSS (`.game-actions`, `.gameTools`, `.gameTools .link`, `&.is-open .gameTools`, the RTL rule) removed from `GamePage/index.css`; comments naming the deleted menu rewritten in `declaredUnavailable`, `Settings/index.css`, `_buttons.scss`, `hardcodedStringGate.ts`, the EOS guard header and MainButton S11.

## Task Commits

1. **Task 1: delete the ⋮ menu and retarget every gate keyed to it (tracer)** - `a2cb57668` (refactor)
2. **Task 2: remove the dead ⋮ CSS and the specs that measured it** - `14258b9d6` (chore)

The tracer's `<verify>` was re-run end to end after Task 1 (full Frontend project, dialogOptionForwarding, Meta i18n suites, codecheck, find-deadcode, narrowing ceiling, DI shard, prettier) before Task 2 began.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The planned shortcuts source gate slice returned the wrong block**
- **Found during:** Task 1
- **Issue:** `blockAfter(source, 'const handleShortcuts = () =>')` returns the first `{...}` after the anchor, which is the options object literal (`{ hasShortcuts, appName, ... }`), not the handler, so the `toggleShortcuts(` assertion failed.
- **Fix:** slice from the anchor to the next declaration (`const shortcutsLabel`) and assert on that; the now-unused `blockAfter` helper was removed from the test.
- **Files modified:** `GamePage/actions/__tests__/shortcutsToggle.test.ts`
- **Commit:** `a2cb57668`

**2. [Rule 3 - Blocking] The dock spec could not name the deleted component**
- **Found during:** Task 2
- **Issue:** the plan's stale-path `git grep` (which must exit 1) matches `DotsMenu` anywhere under `src/frontend`, including the "none" assertion written in Task 1.
- **Fix:** the spec asserts `not.toMatch(/<\w*Menu\b/)` and no `faEllipsisV` instead.
- **Files modified:** `GamePage/__tests__/gamePageActionDock.test.ts`
- **Commit:** `14258b9d6`

**3. [Rule 3 - Blocking] Fork-touched list hand-edited instead of regenerated after the commit**
- **Found during:** Task 1
- **Issue:** the fork-touched list is derived from committed history, so editing only after the commit would leave the A-17 anti-rot spec and A0 red at the Task 1 commit.
- **Fix:** hand-edited the list in the Task 1 commit (remove five, add two, 471 total), then ran `pnpm gen-i18n-gate-scope` after the commit: it reported 471 and differed only in `generatedAt`, which was restored with `git checkout`.
- **Commit:** `a2cb57668`

**4. [Rule 3 - Blocking] Extra comment and helper cleanup the plan did not list**
- **Found during:** Tasks 1 and 2
- **Issue:** comments in `installActionGates.ts`, `rowAction.ts`, `useInstallLocationActions.ts`, `useSteamShortcut.ts`, `useUninstallActions.ts`, `steamInstallOptionsEntry.ts` and the EOS guard header still described the menu as live or named its deleted paths (the last, plus `declaredUnavailable.test.ts`, would also trip the stale-path grep); in themeTokens, `gameMenuColourCandidates` and `gameMenuBaseForeground` would throw on the removed CSS and a stale duplicate doc block sat above `buttonFamilyColourCandidates`.
- **Fix:** comment-only rewrites; the two helpers and the stale block removed with the specs.
- **Commits:** `a2cb57668`, `14258b9d6`

**Total deviations:** 4 (1 Rule 1, 3 Rule 3). **Impact:** none on behaviour; no scope growth beyond the deleted menu's own footprint.

## Verification

- Task 1 `<verify>` and acceptance criteria: all green after the tracer commit (directory and DotsMenu gone, moved modules present, `toHaveLength(13)` present, `D-07` present, `GameCard/index.tsx` untouched).
- Task 2 `<verify>`: `gameTools` count 0, stale-path `git grep` exits 1, themeTokens + MainButton S11 + declaredUnavailable + dock + EOS guard specs 371 passed, Meta `hardcodedStringGate|genI18nGateScope` 204 passed (1 skipped, pre-existing), codecheck clean, prettier clean over every path written.
- Plan `<verification>`: full Frontend project 382 suites / 6608 tests passed after Task 2; dialogOptionForwarding 18 passed; find-deadcode PASS (312 baselined); gameinfo-narrowing-ceiling PASS; backend-di-ceilings shard frontend-screens-game PASS.
- The full `test:ci` run and the live UAT are plan 100-10.

## Known Stubs

None.

## Threat Flags

None. T-100-26 (gate retargeting) and T-100-27 (uninstall confirm after the move) are mitigated as planned: `steamUninstallConfirm.ts` and its fail-closed tests moved byte-identical (R100), and the Frontend project passes with `UninstallModal` and `useUninstallActions` importing the new path.

## Issues Encountered

`pnpm exec jest` re-ran `pnpm install` / `download-helper-binaries` as a pretest hook once; no tracked file changed. The Meta jest suites take about three minutes (they were run in the background).

## Next Phase Readiness

Ready for plan 100-10: the UAT file (18 items) and the full phase-gate run. Plan 10 should live-check that the card's Logs entry opens ⚙ on the Logs tab (the D-07 guard only pins the call).

## Self-Check: PASSED

- Created/moved files exist: `GamePage/actions/shortcutsToggle.ts`, `GamePage/actions/steamUninstallConfirm.ts` and the three moved tests FOUND; `GameSubMenu/` and `DotsMenu.tsx` MISSING as intended.
- Commits `a2cb57668` and `14258b9d6` are ancestors of HEAD.
- Plan commit ledger: `plan_head_before` ff8be5a4e, 2 commits measured with `git rev-list --count`.
