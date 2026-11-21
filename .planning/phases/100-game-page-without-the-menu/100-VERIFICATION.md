---
phase: 100-game-page-without-the-menu
verified: 2026-11-22T14:00:00Z
status: human_needed
score: 10/10 must-haves verified
covered_files:
  - ".planning/phases/100-game-page-without-the-menu/100-01-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-01-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-02-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-02-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-03-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-03-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-04-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-04-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-05-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-05-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-06-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-06-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-07-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-07-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-08-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-08-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-09-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-09-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-10-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-10-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-11-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-11-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-12-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-12-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-13-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-13-SUMMARY.md"
  - ".planning/phases/100-game-page-without-the-menu/100-14-PLAN.md"
  - ".planning/phases/100-game-page-without-the-menu/100-14-SUMMARY.md"
  - "src-tauri/src/main.rs"
  - "src/backend/__tests__/longRunningChannels.test.ts"
  - "src/frontend/components/UI/UninstallModal/index.tsx"
  - "src/frontend/screens/Game/GamePage/actions/installActionGates.ts"
  - "src/frontend/screens/Game/GamePage/actions/rowAction.ts"
  - "src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts"
  - "src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/DangerZone.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx"
  - "src/frontend/screens/Game/GamePage/index.tsx"
covered_digest: "v4:sha256:a7c261ad7761d40f3ab0325988aa57f1278461079d3226b73d2baf288ea6f876"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "Every action the ⋮ menu held has a home next to what it changes (Version -> Verify / Update / What's new): CR-01 closed by 100-12; WR-02 (Open for installed third-party-managed games) closed by 100-13"
    - "Pending and error states live inside each row (Move row truthful, Retry safe): CR-02 closed by 100-11 (shell list), 100-12 and 100-13 (gate-aware Retry, no failure while moving, non-sticky failures); WR-04 and WR-05 closed by 100-13 and 100-14"
  gaps_remaining: []
  regressions: []
deferred: []
advisory:
  - finding: "WR-06: a thrown sidecar moveInstall after the 'moving' status leaves the game status at 'moving', and LocationRow's !is.moving suppression hides the inline Move failure for exactly that rejection"
    category: other
    reason: "Root cause (the handler rethrows with no 'done' status) predates phase 100 and is backend-owned; before the phase the same throw left the game stuck on moving with an unhandled rejection and no message at all. Reported, not blocking; the one-line backend try/finally fix is recorded in 100-REVIEW.md."
    evidence_status: "reproduced by reading code (installFlowRegistration.ts:527-581, legendary/gog moveInstall await changeGameInstallPath outside any try) and by the round-2 review; no failing test run"
  - finding: "WR-07: the move-timeout hand-off (isInvokeTimeout / stillRunning / release / isStatusMoving) cannot fire now that moveInstall is exempt from the shell bound"
    category: other
    reason: "Dead defensive code with passing tests; harmless, necessity-class finding"
    evidence_status: "code read"
  - finding: "WR-08: the two danger-zone buttons do not gate each other, and Remove all copies emits no game status"
    category: other
    reason: "D-11 gap on a narrow race (a second destructive click during a sweep that is itself confirmed); gate and status behaviour pre-existed"
    evidence_status: "code read"
human_verification:
  - test: "Run the 20 pending items in 100-HUMAN-UAT.md (themes midnight/dracula/gruvbox; Steam, Epic-GOG, sideloaded and not-installed walks; categories; Logs tab; Wine prefix button; Ratings tab; EOS switch on Linux; item 19 a Steam game with no install.version shows Version Unknown with Verify; item 20 a Move over 60 s under Tauri shows no 'Move failed' and cannot start a second move)"
    expected: "See each item's expected: line in 100-HUMAN-UAT.md; not duplicated here"
    why_human: "Theme legibility (D-15) and per-store behaviour on real installs (D-16) can only be seen in the running app; the moveInstall / changeInstallPath / steamRemoveAllCopies shell exemptions were added on handler shape, not on a live timing, so item 20 is the first real measurement"
---

# Phase 100: Game page without the ⋮ menu Verification Report

**Phase Goal:** The game page has no ⋮ menu: every action sits next to what it changes. The left card is the game (store link, Edit details, Favourite heart by the title, category chips, Hide); the Install tab is the hub for your copy (Location -> Open/Move, Size -> Modify, Version -> Verify/Check for updates, integration switch rows, red Uninstall last behind a confirmation); the ⚙ dialog owns how the game runs; the footer holds only tier-one actions. Requirements and the left-card play-time block are removed as duplicates; pending and error states live inside each row.
**Verified:** 2026-11-22
**Status:** human_needed
**Re-verification:** Yes, after gap closure (plans 100-11..14)

## Summary

Both blockers from the first report are closed in the code, not just in the SUMMARYs, and no regression turned up. What remains is 20 live checks that only a person in the running app can do, plus three non-blocking round-2 review warnings that I judged advisory (WR-06 reasoning below). There are no gaps. Status is `human_needed` because the human-verification list is non-empty (decision-tree rule 2).

## Re-verification of the previous gaps

| Previous gap | Verdict | Evidence |
|---|---|---|
| Gap 1 / CR-01: Version row returned null when `install.version` was empty, so Verify, Update and What's new were unreachable | CLOSED | `VersionRow.tsx` guard is now `!is_installed \|\| isSideloaded \|\| thirdPartyManagedApp \|\| platform === 'Browser'`; `!version` is gone. A missing version renders the new `versionUnknown` ("Unknown") and never "up to date". Hooks (`useContext`, `useRowAction`) sit above the early return. `installTabRows.test.tsx` (a real hook-harness render test, not a source grep) asserts Verify + Unknown for a Steam game with no version, Verify + Update for Legendary with no version, the four guard cases still null, and that Verify calls `repair(appName, runner)`. Passes. |
| Gap 2 / CR-02: `moveInstall` was not in `LONG_RUNNING_CHANNELS`, so a Move over 60 s showed a false "Move failed" with an ungated Retry | CLOSED | `src-tauri/src/main.rs:311,319,325` list `moveInstall`, `changeInstallPath`, `steamRemoveAllCopies`; `timeout_for` returns `None` for them. I ran `cargo test --bin gamelib-shell exempt`: 8 passed, including `install_location_and_remove_all_copies_channels_are_exempt`. The TS mirror in `longRunningChannels.test.ts` has the three entries and member tests. `LocationRow` hides the Move failure while `is.moving`, and both Location failures pass `retryDisabled`/`retryDisabledReason` from `gates.move` / `gates.setFolder`; `RowFailure` makes Retry inert via `aria-disabled` plus an early return (`SwitchRow.tsx:43,53`). Tests cover the inert Retry. |
| WR-02: Browse Files lost for installed third-party-managed games | CLOSED | `installActionGates.ts`: `open: unaffected(isInstalled)`; test "keeps Open, without Move or Wrong folder, for an installed third-party-managed game". |
| WR-04: sticky / masked row failures | CLOSED (Location row) | Starting Move dismisses the folder row and vice versa; an effect on `install.install_path` dismisses both; three tests. Review IN-11 notes Verify and Uninstall failures are still only cleared by retry, low impact. |
| WR-05: danger-zone confirms had no failure path | CLOSED | `useUninstallActions` runs Remove all copies and both Uninstall routes through `useRowAction`; a partial sweep (`refused > 0`) and an `error` answer count as failure; Retry re-asks the confirmation; `UninstallModal` takes `runUninstall` with a catch-and-log fallback. Danger-zone tests (sweep refusal, error answer, rejection, clean sweep, retry re-asks, inert retry, busy label, Uninstall both routes) pass. |

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No ⋮ menu on the game page; `DotsMenu` and `GameSubMenu` deleted | ✓ VERIFIED | `find src` finds no `DotsMenu*` file or `GameSubMenu` dir; no import of either (one comment in `EosOverlaySetting.tsx`); footer holds status, MainButton, launch option, ⚙ |
| 2 | Left card is the game: store link, Edit details, Favourite heart, category chips + popover, Hide | ✓ VERIFIED | `LeftCard/` has StoreBadgeLink, EditDetailsButton, FavouriteHeart, LibraryRow, CategoryPopover, HiddenNotice, all imported in `GamePage/index.tsx` (lines 50-81); no regression since round 1 |
| 3 | Install tab is the hub: Location, Size, Version, Engine, Cloud saves, Platforms, switch rows, red Uninstall last behind a confirmation | ✓ VERIFIED | `InstallTab/index.tsx` composes LocationRow, SizeRow, VersionRow, EngineRow, CloudSavesSync, PlatformSupport, rows, IntegrationRows, then DangerZone; Uninstall goes through `UninstallModal` or Steam's own dialog, Remove all copies keeps its confirm |
| 4 | Every ⋮ action has a reachable home (D-14), including Verify with no version and Open for third-party-managed games | ✓ VERIFIED | CR-01 and WR-02 fixed (table above); render tests |
| 5 | Pending and error states live inside each row (D-10, D-11, D-12, D-18) | ✓ VERIFIED (advisory WR-06 below) | `useRowAction` busy/failed machine; FactAction busy/disabled with reasons; RowFailure with gate-aware Retry; Location, Version and both danger-zone failures render inside their row; Move no longer lies at 60 s because the shell waits; Retry cannot start a move the Move button would refuse |
| 6 | ⚙ dialog owns how the game runs: Logs tab, EOS overlay switch, Wine prefix folder button | ✓ VERIFIED | Unchanged since round 1; 90 suites incl. GamesSettings pass |
| 7 | Footer holds only tier-one actions; Install ▾ extends to Locate / Steam options | ✓ VERIFIED | Unchanged; MainButton suites pass |
| 8 | Requirements ⋮ item and left-card play-time block removed; play time in the footer status | ✓ VERIFIED | `TimeContainer` is only mentioned in comments; `usePlayTime` feeds GameStatus |
| 9 | Right-panel tabs Install · Achievements · Ratings · Requirements, Apple compatibility on Ratings | ✓ VERIFIED | Unchanged since round 1 |
| 10 | Theme tokens: `--fav` per theme with contrast test; switch track on `--accent` | ✓ VERIFIED | Unchanged; `themeTokens` suite passes. Live legibility is UAT item 2. |

**Score:** 10/10 truths verified (0 present, behavior-unverified).

### Weighing WR-06 against truth 5

WR-06: if `moveInstall` rejects after the sidecar has sent status `moving` (Legendary and GOG `moveInstall` await `changeGameInstallPath`, and GOG `setup(...)`, after a successful copy and outside any try), the handler rethrows with no `done` status. The game stays on `moving`, the renderer's `moveRow` goes to `failed`, and `LocationRow` hides that failure because `is.moving` is still true.

Decision: this is an acceptable pre-existing backend issue, recorded as an advisory warning, not a goal gap, for four reasons.

1. The stuck status is not caused or worsened by phase 100. I read the pre-phase code (`GameSubMenu/index.tsx` at `a2cb57668^`): `onMoveInstallYesClick` did a bare `await window.api.moveInstall(...)` with no catch, so the same throw left the game on `moving` with an unhandled rejection and no message anywhere. The phase did not make a visible error invisible; it moved from "silent and stuck" to "stuck, with the Location row reading Moving…".
2. The trigger is narrow: a throw after the copy succeeded, in the install-record rewrite or the GOG prefix setup. Failures the backend reports itself (`{status:'error'}`) still get their dialog and a `done` status, which is the documented D-18 split.
3. Failures that are renderer-side (picker, `requestAppSettings`) or that precede the `moving` status (path guard; that branch sends `done` before it throws) still show inline with Retry.
4. The correct fix is in the backend handler (`try { ... } finally { send 'done' }`), outside phase 100's frontend scope, and it is one small change. I recommend a follow-up task or todo for it rather than another gap round; it also makes WR-07's dead hand-off removable.

It does weaken the row-honesty promise in one corner, which is why it is carried as an advisory and not silently dropped. If the operator wants the stricter reading, WR-06 is a one-plan fix, but it does not block the goal.

## Required Artifacts / Key Links

| Artifact | Status | Details |
|----------|--------|---------|
| `InstallTab/VersionRow.tsx` | ✓ VERIFIED | Ungated by version, Unknown text, gate-aware Retry, wired from `InstallTab/index.tsx` |
| `InstallTab/LocationRow.tsx`, `useInstallLocationActions.ts` | ✓ VERIFIED | Wired: hook feeds `locationActions` and `settingFolder` into gates |
| `InstallTab/DangerZone.tsx`, `useUninstallActions.ts`, `UninstallModal` | ✓ VERIFIED | `runModalUninstall` passed as `runUninstall`; row failures render under the buttons |
| `SwitchRow.tsx` `RowFailure` retryDisabled | ✓ VERIFIED | Used by VersionRow, LocationRow, DangerZone |
| `src-tauri/src/main.rs` `LONG_RUNNING_CHANNELS` | ✓ VERIFIED | Three entries, Rust pin test green, TS mirror green |
| `installTabRows.test.tsx` | ✓ VERIFIED | 810 lines, real render-tree tests for VersionRow, Location (CR-02/WR-02/WR-04), danger zone; closes the round-1 "source-grep only" complaint for these rows |

## Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| VersionRow | `gameInfo.install.version`, `gameInstallInfo.game.version`, `hasUpdate` | GameContext / page props from the installed-game record and install info | Yes; absent version is a real, handled state | ✓ FLOWING |
| LocationRow | `install_path`, `is.moving`, `moveFailed` | Library state, `libraryStatus`, `useRowAction` | Yes | ✓ FLOWING |
| DangerZone | `uninstallBusy`, `removingAllCopies`, failures | `useRowAction` plus `gates.*` from game status | Yes | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Game, GamesSettings, uiState, NavShell, UninstallModal suites and the TS long-running drift test | `npx jest --silent src/frontend/screens/Game src/frontend/screens/Settings/sections/GamesSettings src/frontend/state/__tests__/uiState.test.ts src/frontend/components/UI/NavShell src/frontend/components/UI/UninstallModal src/backend/__tests__/longRunningChannels.test.ts` | 90 suites / 1711 tests passed | ✓ PASS |
| `timeout_for` returns None for the three new channels | `cd src-tauri && cargo test --bin gamelib-shell exempt` | 8 passed, 0 failed | ✓ PASS |

Gate facts from the orchestrator that I did not re-run (the full `pnpm test:ci`, `find-deadcode`, codecheck, lint, DI ceilings, i18n, planning-gates): the one `cargoFeatures.test.ts` failure and the `meta/genStoreSchemas.ts` deadcode finding. I checked the diff `b65ca20a9..HEAD` touches no Cargo file and no `genStoreSchemas.ts`, so both are consistent with being pre-existing and outside phase 100.

## Probe Execution

No probes declared by the phase. Skipped.

## Requirements Coverage

`phase_req_ids` is null. D-ID accounting against `100-CONTEXT.md`:

| D-id | Status | Note |
|------|--------|------|
| D-01..D-09 | Honoured | Unchanged since round 1 verification |
| D-10, D-11 | Honoured | Busy labels, disabled-with-reason gates; Retry now obeys its action's gate (Version, Location, danger zone) |
| D-12, D-18 | Honoured, with WR-06 advisory | Inline failure plus Retry on Location, Version, both danger-zone actions; failures non-sticky on Location |
| D-13 | Honoured | Verify has no confirmation; Move/Set folder/Uninstall/Remove all copies keep theirs; danger-zone Retry re-asks (Move/Set-folder Retry goes to the picker, IN-08) |
| D-14 | Honoured | Verify, Update, What's new reachable without a version; Open reachable for third-party-managed games |
| D-15, D-16 | Pending human | UAT items 1-11, 14 |
| D-17, D-19, D-20, D-21, D-22 | Honoured | Unchanged |

No orphaned requirements.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `LocationRow.tsx` / `installFlowRegistration.ts` | 35-39 / 527-581 | Failure suppressed while a backend-stuck `moving` status persists | ⚠️ Warning (WR-06, pre-existing cause) | Narrow; see weighing above |
| `rowAction.ts`, `useInstallLocationActions.ts` | 49-66 / 29-39 | Unreachable timeout hand-off | ⚠️ Warning (WR-07) | Dead defensive code |
| `DangerZone.tsx` | 47-96 | Uninstall and Remove all copies do not gate each other | ⚠️ Warning (WR-08) | Narrow race between two confirmed destructive actions |
| `LeftCard/index.css`; `longRunningCallSiteGuard.test.ts` header | various | WR-01 (Edit button over 32-bit badge), WR-03 (stale header) | ⚠️ Warning, carried from round 1 | Not goal-blocking |
| IN-01..IN-11 | various | Info | ℹ️ Info | Not goal-blocking |

No `TBD`/`FIXME`/`XXX` markers in any non-test file changed since `b65ca20a9`.

## Human Verification Required

All 20 items in `100-HUMAN-UAT.md` are pending (items 19 and 20 were added by 100-14 for CR-01 and CR-02). Two matter most for this re-verification:

### 1. Steam game with no `install.version` (UAT 19)

**Test:** Open a bridge-installed Steam game (or a Steam install whose ACF buildid is 0) and look at the Version row.
**Expected:** Version reads "Unknown" with Verify beside it; Verify starts at once with no confirmation.
**Why human:** Needs a real bridge install; the render test uses a fixture.

### 2. A Move over 60 s under Tauri (UAT 20)

**Test:** Move a large managed game's install folder (copy time above 60 s) in `pnpm tauri:dev` started fresh after the Rust change.
**Expected:** The row reads "Moving…" throughout, never "Move failed"; Move and Wrong folder stay disabled with a reason; no second move can start. This also measures whether the three new `LONG_RUNNING_CHANNELS` entries need adjusting (they were added on handler shape, not a live timing, per IN-09).
**Why human:** Real long copy over the Rust shell; no jsdom or unit test can reach it.

The remaining items (themes, store walks, categories, Logs tab, Wine prefix button, Ratings tab, EOS switch) are in `100-HUMAN-UAT.md` and are not duplicated here.

## Gaps Summary

No gaps. Both round-1 blockers and the folded warnings (WR-02, WR-04, WR-05) are closed and covered by behavioural tests I ran. Open items for the operator: the 20 live UAT checks, and a decision on whether to schedule the WR-06 backend `finally` fix (recommended as a follow-up todo, severity low, platform all, not another gap round).

---

_Verified: 2026-11-22_
_Verifier: Claude (gsd-verifier)_
