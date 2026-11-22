---
phase: 100-game-page-without-the-menu
verified: 2026-11-22T16:00:00Z
status: gaps_found
score: 9/10 must-haves verified
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
  - "src/frontend/screens/Game/GamePage/actions/__tests__/installActionGates.test.ts"
  - "src/frontend/screens/Game/GamePage/actions/installActionGates.ts"
  - "src/frontend/screens/Game/GamePage/actions/rowAction.ts"
  - "src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts"
  - "src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/DangerZone.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx"
  - "src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx"
  - "src/frontend/screens/Game/GamePage/index.tsx"
covered_digest: "v4:sha256:865c7146f375f064956524f18a3e62cafb7dc4e7eec407a4a482622da05f633f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 10/10
  gaps_closed: []
  gaps_remaining: []
  regressions:
    - "Truth 5 (pending and error states live inside each row; conflicting actions gated, D-11/D-12): the opt-in DLC switch rows added by quick 261122-rgi (OptInDlcRows.tsx) bypass installActionGates and lose their failure on a null re-read"
gaps:
  - truth: "Conflicting Install-tab actions are disabled with a reason while a long action runs (D-11, truth 5): the opt-in DLC switch rows stay live"
    status: failed
    reason: "OptInDlcRows takes no `gates`; its busy test is is.updating || is.queued || is.installing only. A probe render (run once, probe file deleted) showed disabled=false for is.moving, is.reparing, is.uninstalling and is.playing. A DLC toggle queues an update that downloads or deletes depot files, so it can run against a folder being moved, verified or removed. (The backend refuses an update while the bridge game is running, updateBridge.ts:68, so the playing case ends in a refusal, not file loss; moving, verifying and uninstalling have no such guard that I found.)"
    artifacts:
      - path: "src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx"
        issue: "no gate input; disabled = steamManaged || (otherBusy && !isPending); disabled reason can only be the download/update text"
      - path: "src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx"
        issue: "mounts <OptInDlcRows gameInfo={gameInfo} /> without gates, though it computes them for every other row"
      - path: "src/frontend/screens/Game/GamePage/actions/installActionGates.ts"
        issue: "no gate id for opt-in DLC rows"
    missing:
      - "An `optInDlc` gate in installActionGates (shown for an installed Steam game, via conflicting(...)), passed into OptInDlcRows; disabled and disabledReason derived from it (gateReasonText); tests per reason (moving, verifying, uninstalling, playing)"
  - truth: "Error states live inside each row (D-12, truth 5): a null re-read after a DLC change removes the whole group with its failure"
    status: failed
    reason: "After a change the effect calls setInfo(answer) unconditionally. getSteamOptInDlc answers null on any failure (PICS timeout, no appinfo, thrown error). setFailed runs, but the next render returns null (`if (!applies || !info) return null`), so the user sees the busy row, then the whole Optional content group vanishes with no failure text and no Retry. A probe render reproduced it: after a change and a null re-read, rendered=false, failures=0. The suite pins null only for the initial mount."
    artifacts:
      - path: "src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx"
        issue: "setInfo(answer) overwrites the last good answer with null (lines 65-84)"
    missing:
      - "Keep the last good info; treat a null re-read as an unconfirmed result that fails the row; test: re-read resolves null, group still rendered, one failure shown"
deferred: []
advisory:
  - finding: "WR-11: OptInDlcRows hand-rolls pending/failure instead of useRowAction / reportRowActionFailure; logError is called bare before the state resets, and `pending` has no bounded exit if the busy edge is never observed"
    category: other
    reason: "The stuck-busy outcomes need a throwing logError or coalesced status events; I did not reproduce either. Fixing WR-09/WR-10 should route the dispatch through useRowAction and reportRowActionFailure, which removes it."
    evidence_status: "code read; no failing test run"
  - finding: "IN-12: `desired` is built from the mount-time info snapshot and the update treats it as the full set to keep"
    category: other
    reason: "Needs a second writer to trigger; backend handling of an absent id not traced"
    evidence_status: "code read"
  - finding: "IN-13: the OptInDlcRows suite lacks the cases that carry WR-09/WR-10/WR-11"
    category: other
    reason: "Addressed by the tests listed under the two gaps"
    evidence_status: "code read; probe cases written and run once, then removed"
  - finding: "WR-06: a thrown sidecar moveInstall after the 'moving' status leaves the game on 'moving' and LocationRow hides the inline Move failure"
    category: other
    reason: "Carried from the previous report; cause is backend-owned and pre-dates phase 100; unchanged"
    evidence_status: "code read, round-2 review"
  - finding: "WR-07 (dead move-timeout hand-off) and WR-08 (danger-zone buttons do not gate each other)"
    category: other
    reason: "Carried from the previous report; unchanged"
    evidence_status: "code read"
human_verification:
  - test: "Run the 20 pending items in 100-HUMAN-UAT.md (themes midnight/dracula/gruvbox; Steam, Epic-GOG, sideloaded and not-installed walks; categories; Logs tab; Wine prefix button; Ratings tab; EOS switch on Linux; item 19 a Steam game with no install.version shows Version Unknown with Verify; item 20 a Move over 60 s under Tauri shows no 'Move failed' and cannot start a second move)"
    expected: "See each item's expected: line in 100-HUMAN-UAT.md; not duplicated here"
    why_human: "Theme legibility (D-15) and per-store behaviour on real installs (D-16) can only be seen in the running app; the moveInstall / changeInstallPath / steamRemoveAllCopies shell exemptions were added on handler shape, not a live timing, so item 20 is the first real measurement"
---

# Phase 100: Game page without the ⋮ menu Verification Report

**Phase Goal:** The game page has no ⋮ menu: every action sits next to what it changes. The left card is the game (store link, Edit details, Favourite heart by the title, category chips, Hide); the Install tab is the hub for your copy (Location -> Open/Move, Size -> Modify, Version -> Verify/Check for updates, integration switch rows, red Uninstall last behind a confirmation); the ⚙ dialog owns how the game runs; the footer holds only tier-one actions. Requirements and the left-card play-time block are removed as duplicates; pending and error states live inside each row.
**Verified:** 2026-11-22
**Status:** gaps_found
**Re-verification:** Yes, rebuilt against current code after the covered-input fingerprint went stale

## Summary

The previous report (human_needed, 10/10) went stale because later work touched the phase's surface: quick 261122-9sl (Steam Move in `installActionGates.ts`), quick 261122-rgi (opt-in DLC switch rows, `InstallTab/OptInDlcRows.tsx`, mounted from `InstallTab/index.tsx`) and phase 85 (`main.rs`). I re-read the current code. Everything the phase's own plans delivered still holds: the three `main.rs` long-running exemptions are intact and pinned, the 9sl gate change is correct, and no regression turned up in the ⋮-menu removal, left card, Version/Location/danger-zone rows, ⚙ dialog, footer or theme work.

The new surface is where it breaks. The opt-in DLC rows are mounted in the Install tab but were built outside the phase's shared pieces, and two round-3 review findings (WR-09, WR-10) are real: I reproduced both with a throwaway probe render. They violate D-11 (conflicting actions disabled while a long action runs) and D-12 (an error lives inside its row), which are the contracts truth 5 states. That makes truth 5 FAILED and the status `gaps_found`. The fix is small and the review already sketches it. The 20 human UAT items remain owed (precedence: gaps_found outranks human_needed, but they are carried in the frontmatter).

## Judgement on the round-3 findings (WR-09..WR-11, IN-12..IN-13)

The findings came from later work, but the files were modified after the previous `verified:` timestamp and the rows live on the shipped Install tab, so they count against the phase's contract as it now stands. For each:

- **WR-09 (no gates): breaks D-11, counted as a gap.** D-11 says conflicting Install-tab actions are disabled with a reason, and names Verify, Modify, Set folder and Uninstall during a Move. D-11 also says "switch rows stay live", but that sentence is about the integration switches (config toggles that touch no installed files). A DLC switch is not that: it queues an update that adds or deletes depot files in the install folder, which is the same class as Modify. I confirmed by probe that the switch is enabled during moving, reparing, uninstalling and playing. Mitigation I found: `updateBridgeGame` refuses when the bridge game is running, so playing ends in a refusal. I found no equivalent guard for moving, verifying or uninstalling (`nativeInstallsInFlight` only joins an in-flight update run). Severity is moderate: a Steam Move on macOS (9sl) plus a DLC toggle is an unlikely sequence, but the cost is file deletion under a relocating folder, and the contract exists to prevent exactly that.
- **WR-10 (null re-read wipes the group and its failure): breaks D-12, counted as a gap.** Reproduced: after a change and a null re-read the component renders nothing and shows no failure. A null answer is the documented result for a PICS timeout, so this is a silent failure on a plausible path, which is the opposite of "error states live inside each row".
- **WR-11 (hand-rolled pending/failure): advisory.** It is a contract deviation in style (the phase's rows use `useRowAction` / `reportRowActionFailure`), and its two stuck-busy hazards (a throwing `logError`, an unobserved busy edge) are unreproduced. It should be closed by the same change that fixes WR-09 and WR-10, not on its own.
- **IN-12, IN-13: advisory.** IN-12 needs a second writer; IN-13 is closed by the tests the two gaps ask for.

I did not downgrade WR-09/WR-10 under the re-verification evidence gate: the files changed since the previous pass, and I have a reproducible artifact (probe render output below), so they block.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No ⋮ menu on the game page; `DotsMenu` and `GameSubMenu` deleted | ✓ VERIFIED | `find src -iname "DotsMenu*" -o -iname "GameSubMenu*"` returns nothing; no `TimeContainer`, `DotsMenu` or `GameSubMenu` import in `src/frontend` |
| 2 | Left card is the game: store link, Edit details, Favourite heart, category chips + popover, Hide | ✓ VERIFIED | `LeftCard/` holds StoreBadgeLink, EditDetailsButton, FavouriteHeart, CategoryPopover, LibraryRow, HiddenNotice; no phase-100 change to these since the prior report |
| 3 | Install tab is the hub: Location, Size, Version, Engine, Cloud saves, Platforms, switch rows, red Uninstall last behind a confirmation | ✓ VERIFIED | `InstallTab/index.tsx` composes LocationRow, SizeRow, VersionRow, EngineRow, CloudSavesSync, PlatformSupport, OptInDlcRows, IntegrationRows, then DangerZone last; the DLC rows are an addition, their defects are scored under truth 5 |
| 4 | Every ⋮ action has a reachable home (D-14), including Verify with no version, Open for third-party-managed games, and Move for Steam on macOS | ✓ VERIFIED | `installActionGates.ts` `open: unaffected(isInstalled)`, `move: conflicting(managedStore || steamMove)`; `installTabRows.test.tsx` and `installActionGates.test.ts` pass (123 tests with the TS drift test) |
| 5 | Pending and error states live inside each row; conflicting actions are gated with a reason (D-10, D-11, D-12, D-18) | ✗ FAILED | Holds for Version, Location, Size, Engine, Cloud saves and both danger-zone actions (unchanged, tests green). Fails for the opt-in DLC rows: no gating (WR-09) and a null re-read drops the group and failure (WR-10). Probe output below. |
| 6 | ⚙ dialog owns how the game runs: Logs tab, EOS overlay switch, Wine prefix folder button | ✓ VERIFIED | Unchanged; GamesSettings suites pass |
| 7 | Footer holds only tier-one actions; Install ▾ extends to Locate / Steam options | ✓ VERIFIED | Unchanged; MainButton suites pass |
| 8 | Requirements ⋮ item and left-card play-time block removed; play time in the footer status | ✓ VERIFIED | No `TimeContainer` import; unchanged |
| 9 | Right-panel tabs Install · Achievements · Ratings · Requirements, Apple compatibility on Ratings | ✓ VERIFIED | Unchanged since round 1 |
| 10 | Theme tokens: `--fav` per theme with contrast test; switch track on `--accent` | ✓ VERIFIED | Unchanged; `themeTokens` suite passes. Live legibility is UAT item 2. |

**Score:** 9/10 truths verified (0 present, behavior-unverified).

## Required Artifacts / Key Links

| Artifact | Status | Details |
|----------|--------|---------|
| `InstallTab/VersionRow.tsx`, `LocationRow.tsx`, `DangerZone.tsx`, `SwitchRow.tsx` (`RowFailure`) | ✓ VERIFIED | Unchanged since the previous report; render tests green |
| `actions/installActionGates.ts` | ✓ VERIFIED (with gap) | `steamMove` correct and covered; lacks an opt-in DLC gate (gap 1) |
| `src-tauri/src/main.rs` `LONG_RUNNING_CHANNELS` | ✓ VERIFIED | `moveInstall`, `changeInstallPath`, `steamRemoveAllCopies` still members; `cargo test --bin gamelib-shell exempt` 8 passed |
| `InstallTab/OptInDlcRows.tsx` | ✗ HOLLOW against D-11/D-12 | Present, wired (`index.tsx:89`), data flows from `getSteamOptInDlc`; gates and failure persistence missing |
| Key link `InstallTab/index.tsx` -> `OptInDlcRows` | ⚠️ PARTIAL | Mounted, but `gates` not passed |

## Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| OptInDlcRows | `info.entries` | `window.api.getSteamOptInDlc` (backend `optInDlc.ts`) | Yes | ✓ FLOWING |
| VersionRow / LocationRow / DangerZone | version, install_path, row state | GameContext / `useRowAction` | Yes | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Game, GamesSettings, UninstallModal suites | `pnpm exec jest --silent src/frontend/screens/Game src/frontend/screens/Settings/sections/GamesSettings src/frontend/components/UI/UninstallModal` | 57 suites / 903 tests passed | ✓ PASS |
| installTabRows, installActionGates, longRunningChannels | `pnpm exec jest --silent --runTestsByPath ...` | 3 suites / 123 tests passed | ✓ PASS |
| `timeout_for` is None for the three exempt channels | `cd src-tauri && cargo test --bin gamelib-shell exempt` | 8 passed | ✓ PASS |
| WR-09 probe: DLC switch while the game is busy for another reason | probe copy of `installTabRows.test.tsx` with one added case, `jest -t PROBE`, file deleted afterwards | `moving disabled=false`, `reparing disabled=false`, `uninstalling disabled=false`, `playing disabled=false` | ✗ FAIL (gap 1) |
| WR-10 probe: null re-read after a change | same probe file | `rendered=false failures=0` | ✗ FAIL (gap 2) |

Gate facts from the orchestrator that I did not re-run: `pnpm codecheck` clean; the genI18nGateScope A-17 failure fixed in ee1995796; 100-VALIDATION.md nyquist_compliant; 100-SECURITY.md threats_open 0.

## Probe Execution

No probes declared by the phase. Skipped.

## Requirements Coverage

`.planning/REQUIREMENTS.md` does not exist in the repo, and `phase_req_ids` is null. The phase is driven by decision IDs. Every ID D-01..D-22 in `100-CONTEXT.md` is claimed by at least one PLAN `requirements:` field (union of the 14 plans = D-01..D-22); no orphans.

| D-id | Status | Note |
|------|--------|------|
| D-01..D-09 | Honoured | Unchanged |
| D-10 | Honoured | Busy labels on all phase rows; the DLC rows have their own busy label |
| D-11 | Not honoured for the DLC rows | Gap 1 |
| D-12, D-18 | Honoured for phase rows, not for the DLC rows | Gap 2 |
| D-13, D-14, D-17, D-19..D-22 | Honoured | Unchanged; D-14 now also covers Steam Move on macOS |
| D-15, D-16 | Pending human | UAT items 1-11, 14 |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `OptInDlcRows.tsx` | 39, 126 | busy test ignores gates | 🛑 Blocker (gap 1, reproduced) | D-11 |
| `OptInDlcRows.tsx` | 65-84, 89 | null answer overwrites `info` | 🛑 Blocker (gap 2, reproduced) | D-12 |
| `OptInDlcRows.tsx` | 44-50, 75-92, 115-124 | bare `logError`, hand-rolled pending | ⚠️ Warning (WR-11) | advisory |
| `LocationRow.tsx` / `installFlowRegistration.ts` | 35-39 / 527-581 | failure hidden while backend-stuck `moving` | ⚠️ Warning (WR-06, carried) | narrow |
| `DangerZone.tsx`, `rowAction.ts` | various | WR-07, WR-08 | ⚠️ Warning (carried) | narrow |

No `TBD`/`FIXME`/`XXX` markers in non-test files under `InstallTab/` or `actions/`.

## Human Verification Required

All 20 items in `100-HUMAN-UAT.md` are `result: pending`; none has been run. They are carried forward unchanged (full list and expected lines are in that file). Two matter most: item 19 (a Steam game with no `install.version` shows Version "Unknown" with Verify) and item 20 (a Move over 60 s under `pnpm tauri:dev` shows no "Move failed" and cannot start a second move). `100-HUMAN-UAT.md` has no item for the opt-in DLC rows; add one after the gaps close (toggle a DLC on a bridge install while a Move or Verify runs: switch disabled with a reason; force a failed re-read: row shows the failure, group stays).

## Gaps Summary

Two gaps, one root cause: `OptInDlcRows.tsx` was built with its own pending/failure state and its own busy test instead of the phase's shared pieces. Close both with one small plan: add an `optInDlc` gate to `installActionGates`, pass `gates` into `OptInDlcRows`, keep the last good `info` and fail the row on a null re-read, and drive the dispatch through `useRowAction` with `reportRowActionFailure` (which also retires WR-11). Add the tests IN-13 lists. Structured gaps are in the frontmatter for `/gsd-plan-phase --gaps`. No other phase-100 truth regressed.

---

_Verified: 2026-11-22_
_Verifier: Claude (gsd-verifier)_
