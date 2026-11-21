---
phase: 100-game-page-without-the-menu
verified: 2026-11-22T12:00:00Z
status: gaps_found
score: 8/10 must-haves verified
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
  - "src-tauri/src/main.rs"
  - "src/frontend/screens/Game/GamePage/actions/installActionGates.ts"
  - "src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx"
  - "src/frontend/screens/Game/GamePage/index.tsx"
covered_digest: "v4:sha256:cf7f77a2d96a7e837afdaf7ce597fa758698b1b94722e75433220c3414969984"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Every action the ⋮ menu held has a home next to what it changes (Version -> Verify / Update / What's new)"
    status: failed
    reason: "VersionRow returns null when install.version is empty. Verify and Repair has no other home, so it is unreachable for any installed game with no version string, including bridge-installed Steam games (markBridgeGameInstalled writes no version) and Steam installs whose ACF buildid is 0 (installVersionField omits it). The old ⋮ item had no version precondition. CONTEXT D-14 requires every action to stay reachable."
    artifacts:
      - path: "src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx"
        issue: "Line 55 `|| !version` in the early-return guard hides the whole row, taking Verify, Update and What's new with it"
    missing:
      - "Drop `!version` from the guard; render the row for any installed, non-sideloaded, non-third-party, non-browser game and show the version text only when present (e.g. an 'Unknown' value)"
      - "A behavioural or render-tree test that VersionRow renders Verify with no install.version (current tests are readFileSync greps and cannot see this)"
  - truth: "Pending and error states live inside each row (Move row is truthful and Retry is safe)"
    status: partial
    reason: "moveInstall is not in LONG_RUNNING_CHANNELS in src-tauri/src/main.rs (only openDialog, repair, install, syncSaves and others are; moveInstall appears only in a comment). The sidecar handler awaits the whole copy, so under Tauri a move over 60 s rejects while the backend is still moving. The new useRowAction catches that and the Location row shows 'Move failed' with a Retry link for a move that is still running. Retry (retryMove) re-opens the picker and calls moveInstall again and is not gated on is.moving or gates.move.disabled, so a second move can start against the same install."
    artifacts:
      - path: "src-tauri/src/main.rs"
        issue: "LONG_RUNNING_CHANNELS lacks moveInstall (and changeInstallPath, steamRemoveAllCopies)"
      - path: "src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts"
        issue: "moveRow.run dispatches fail on the transport timeout; retryMove is ungated"
      - path: "src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx"
        issue: "RowFailure renders its Retry regardless of is.moving"
    missing:
      - "Add moveInstall (and changeInstallPath, steamRemoveAllCopies) to LONG_RUNNING_CHANNELS with a measurement note"
      - "Make Retry inert (or the failure hidden) while is.moving; do not report fail for a timeout while the game status is still 'moving'"
deferred: []
human_verification:
  - test: "Run the 18 pending live checks in 100-HUMAN-UAT.md (themes midnight/dracula/gruvbox, Steam / Epic-GOG / sideloaded / not-installed walks, categories, Logs tab, Wine prefix button, Ratings tab, EOS switch on Linux)"
    expected: "See each item's expected: line in 100-HUMAN-UAT.md; do not duplicate here"
    why_human: "Theme legibility (D-15) and per-store behaviour on real installs (D-16) can only be seen in the running app"
---

# Phase 100: Game page without the ⋮ menu Verification Report

**Phase Goal:** The game page has no ⋮ menu: every action sits next to what it changes. Left card is the game, the Install tab is the hub for your copy, the ⚙ dialog owns how the game runs, the footer holds only tier-one actions, Requirements and left-card play time are removed as duplicates, and pending and error states live inside each row.
**Verified:** 2026-11-22
**Status:** gaps_found
**Re-verification:** No, initial verification

## Summary

The structural work is real and matches the design contract. `DotsMenu.tsx` and `GameSubMenu/` are deleted and no import of either remains (only comments and test headers mention them). The left card, Install tab, Logs tab, footer caret, play time in the status line and the Ratings tab all exist, are wired into `GamePage/index.tsx`, and the 88 suites / 1610 tests under `Game`, `GamesSettings`, `uiState` and `NavShell` pass when I ran them. Two review findings hold up under the code and defeat the goal's central promise ("every action sits next to what it changes", "pending and error states live inside each row"), so the phase is not yet achieved.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No ⋮ menu on the game page; `DotsMenu` and `GameSubMenu` deleted | ✓ VERIFIED | Files absent; grep of `src` and `meta` finds only comment and test-header mentions; the footer in `GamePage/index.tsx:593-630` holds GameStatus, MainButton, LaunchOptionSelector, SettingsButton |
| 2 | Left card is the game: store link, Edit details, Favourite heart, outlined category chips + popover, Hide + hidden notice | ✓ VERIFIED | `StoreBadgeLink`, `EditDetailsButton`, `FavouriteHeart`, `LibraryRow`, `CategoryPopover`, `HiddenNotice` all rendered at `index.tsx:554-585`; popover validates before addCategory (T-100-04), create-and-assign in one step (D-09) |
| 3 | Install tab is the hub: Location/Size/Version/Engine/Cloud saves/Platforms facts, notes, switch rows, red Uninstall last behind confirmation | ✓ VERIFIED | `InstallTab/index.tsx` composition; `DangerZone` renders last, `startUninstall` goes through `UninstallModal` or `steamUninstallNeedsConfirm`, Remove all copies keeps a confirm dialog; Cloud-saves MUI Menu is click-only (D-03) |
| 4 | Every ⋮ action has a reachable home (Verify, Update, What's new, Move, Set folder, Modify, Open, Open prefix, shortcuts, Show in Steam, Uninstall, Remove all copies, EOS, Logs, Categories, Store, ProtonDB, Favourite, Hide, Edit) | ✗ FAILED | Verify, Update and What's new live in `VersionRow`, which returns null when `!install.version` (CR-01); confirmed in `VersionRow.tsx:49-57`, and Steam bridge/ACF-buildid-0 installs have no version (`bridgeInstallState.ts:164-170`, `installedMap.ts:58-67`). Phase 101 does not cover this. Also WR-02: Open (Browse Files) is hidden for installed third-party-managed games where the old item showed. |
| 5 | Pending and error states live inside each row (D-10, D-11, D-12) | ✗ FAILED (partial) | Mechanism is real (`rowAction.ts`, `FactAction` busy/disabled, `RowFailure`, `installActionGates`) and switch rows flip on the backend answer. But the Move row reports a false failure after 60 s and offers an ungated Retry (CR-02): `moveInstall` is not in `LONG_RUNNING_CHANNELS`. WR-04/WR-05 (sticky failures; danger-zone confirms with no failure path) also weaken it. |
| 6 | ⚙ dialog owns how the game runs: Logs tab, Diagnostics link, EOS overlay switch (Linux + Epic), Wine prefix folder button | ✓ VERIFIED | `GamesSettings/index.tsx` Logs `TabPanel` + `LogSettings`; `uiState.openGameLogsModal` opens `initialTab: 'logs'`, `GameCard` still calls it (D-07); `EosOverlaySetting` gated `isLinux && legendary && is_installed`; `WinePrefix.tsx` folder button calls `window.api.openFolder` |
| 7 | Footer holds only tier-one actions; Install ▾ extends to Locate for non-Steam (D-20) | ✓ VERIFIED | `installCaret.ts` returns `steamOptions` or `locate`; `MainButton.tsx:307-465` mounts it; no Uninstall or trash in the footer |
| 8 | Requirements ⋮ item and left-card play-time block removed; play time kept in footer (D-17) | ✓ VERIFIED | `TimeContainer` absent from `src`; `usePlayTime`/`playTimeSummary` feed `GameStatus` (`GameStatus.tsx:418-427`); Requirements remains only as a right-panel tab. (IN-06 notes a cosmetic " · Never played" suffix on unavailable states.) |
| 9 | Right-panel tabs `Install · Achievements · Ratings · Requirements`, Apple compatibility moved to Ratings (D-04) | ✓ VERIFIED | `index.tsx:636-739`: scrollable Tabs, `AppleWikiInfo` + `ProtonDbLink` inside the `extra` panel |
| 10 | Theme tokens: `--fav` in every theme block with a contrast spec; switch track on `--accent` (D-22) | ✓ VERIFIED | `themes.scss` declares `--fav` in the body default and each theme block; `themeTokens.test.ts:3299-3320` asserts presence and ≥3:1 for all themes (suite passes). Live dracula legibility left to UAT item 2. |

**Score:** 8/10 truths verified.

## D-ID Accounting (against 100-CONTEXT.md)

| D-id | Status | Note |
|------|--------|------|
| D-01, D-02 | Honoured | Design contract followed; Logs tab, EOS switch, prefix folder present |
| D-03 | Honoured | Fact row, Sync now ▾ (click-only Menu), Open saves folder, Auto-sync as switch row |
| D-04, D-05, D-06 | Honoured | Apple block on Ratings; static fact rows; notes in `installNotes` before the integration group |
| D-07, D-08, D-09 | Honoured | GameCard Logs re-pointed via `openGameLogsModal`; Categories modal untouched; popover create-and-assign |
| D-10, D-11 | Honoured in mechanism | Busy labels and gate reasons exist; Move busy label correct only while the invoke is live (see CR-02) |
| D-12, D-18 | Partially honoured | Inline failure + Retry exists, but Move's failure is false past 60 s, Retry ungated, failures sticky (WR-04), danger-zone has no failure path (WR-05) |
| D-13 | Honoured | Verify has no yes/no; Move/Set folder keep confirms; Uninstall/Remove all copies keep confirms |
| D-14 | Violated for one action | ⋮ is deleted but Verify is unreachable when `install.version` is empty (CR-01) |
| D-15, D-16 | Pending human | 100-HUMAN-UAT.md items 1-3 and 4-11, 14 |
| D-17 | Honoured | Play time in `GameStatus`, `TimeContainer` removed |
| D-19 | Honoured | "Update" calls `handleUpdate`, shown only for managed stores; but it shares CR-01's version gate |
| D-20 | Honoured | Caret offers Locate for non-Steam, Steam options for Steam |
| D-21 | Honoured | Cloud saves values Syncing…/Auto-sync on/Manual/Unsupported; `enableQuickSavesMenu` toggle removed from the frontend (only the backend setting remains, which is frontend-only-phase appropriate) |
| D-22 | Honoured | `--fav` per theme with contrast test; switch track on `--accent` |

## Required Artifacts / Key Links

| Artifact | Status | Details |
|----------|--------|---------|
| `GamePage/components/InstallTab/*` (index, Location, Size, Version, Engine, FactRow, SwitchRow, IntegrationRows, DangerZone, NotInstalledFacts, StaticFactRows, WhatsNewLink) | ✓ exists, substantive, wired | All composed by `InstallTab/index.tsx`, mounted at `GamePage/index.tsx:707`. VersionRow substantive but over-gated (CR-01) |
| `GamePage/components/LeftCard/*` | ✓ VERIFIED | Mounted in `index.tsx` |
| `GamePage/actions/*` (gates, rowAction, caret, shortcuts, uninstall, location, cloudSync) | ✓ VERIFIED | Imported by the rows; gate logic mirrors old ⋮ conditions except WR-02's `open` |
| Logs tab (`GamesSettings` + `LogSettings`), `EosOverlaySetting`, `WinePrefix` folder button | ✓ VERIFIED | Wired in `GamesSettings/index.tsx` |
| `moveInstall` -> `LONG_RUNNING_CHANNELS` | ✗ NOT_WIRED | Missing from `src-tauri/src/main.rs:199-` list (CR-02) |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Game, GamesSettings, uiState, NavShell suites | `npx jest --silent src/frontend/screens/Game src/frontend/screens/Settings/sections/GamesSettings src/frontend/state/__tests__/uiState.test.ts src/frontend/components/UI/NavShell` | 88 suites / 1610 tests passed | ✓ PASS |
| `moveInstall` in shell long-running list | `grep -n moveInstall src-tauri/src/main.rs` | comments only, no list entry | ✗ FAIL |

Note: most Install-tab tests are `readFileSync` source gates, which is why they pass while CR-01 and CR-02 stand. Plan 100-10's full-suite claim (1125 suites, rc 0) was not re-run; the scoped run above is my own evidence.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `VersionRow.tsx` | 55 | `|| !version` hides whole row | 🛑 Blocker | Verify unreachable (CR-01) |
| `useInstallLocationActions.ts` / `main.rs` | 35-47 / 199 | false failure + ungated Retry | 🛑 Blocker | Second concurrent move possible (CR-02) |
| `installActionGates.ts` | 134 | `open` excludes third-party-managed | ⚠️ Warning | Browse Files lost for installed EA/Ubisoft-managed games (WR-02) |
| `LocationRow.tsx` / `rowAction.ts` | 29-45 | sticky failures; Set-folder failure masked by Move failure | ⚠️ Warning | WR-04 |
| `useUninstallActions.ts` | 42-54 | un-awaited / uncaught `uninstall` and `steamRemoveAllCopies` | ⚠️ Warning | Unhandled rejections, no row failure (WR-05) |
| `LeftCard/index.css` | 182-188 | Edit button overlays 32-bit badge | ⚠️ Warning | WR-01 |
| `longRunningCallSiteGuard.test.ts` | 15-20 | header cites deleted `cloudSavesSyncFailure.test.tsx`; rewritten CloudSavesSync/VersionRow/LocationRow/DangerZone have only source greps | ⚠️ Warning | WR-03: no behavioural coverage |
| IN-01..IN-06 | various | unencoded store URL, ProtonDB steamID fallback dropped, stale comments, duplicate `useTranslation`, a11y, " · Never played" suffix | ℹ️ Info | Not goal-blocking |

No `TBD`/`FIXME`/`XXX` debt markers were checked beyond the review's file list; the review reported none. All 13 review findings are still `open` in `100-REVIEW-DISPOSITION.md`.

## Requirements Coverage

The phase has no REQUIREMENTS.md ids; D-01..D-22 are accounted for above against 100-CONTEXT.md.

## Human Verification Required

The 18 pending items in `100-HUMAN-UAT.md` cover D-15 (midnight, dracula, gruvbox) and D-16 (Steam, Epic/GOG, sideloaded, not-installed), plus categories, the Logs tab, Wine prefix button, tabs and the Linux EOS switch. They are not duplicated here. Two additions the UAT should absorb once the gaps are fixed: a Steam game with no `install.version` (e.g. a bridge install) must show Verify (CR-01), and a Move longer than 60 s must not show "Move failed" or allow a second move (CR-02).

## Gaps Summary

Two root causes block goal achievement:

1. **Version row over-gated (CR-01).** Verify, Update and What's new are hidden whenever `install.version` is empty. This is a regression of reachability versus the deleted ⋮ item and breaks the phase's own D-14 rule. Fix is a one-line guard change plus a render test.
2. **Move row error/pending state untrue past 60 s (CR-02).** Missing `LONG_RUNNING_CHANNELS` entry plus an ungated Retry make the inline failure lie and allow a duplicate move. Fix is the Rust list entry plus gating Retry on `is.moving`.

WR-02, WR-04 and WR-05 are real but secondary; fold them into the same gap-closure round (`/gsd-plan-phase 100 --gaps`). Live UAT should run after the gaps close.

---

_Verified: 2026-11-22_
_Verifier: Claude (gsd-verifier)_
