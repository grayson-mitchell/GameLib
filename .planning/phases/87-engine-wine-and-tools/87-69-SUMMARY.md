---
phase: 87-engine-wine-and-tools
plan: 69
subsystem: gap-closure-live-gate
tags: [gap-closure, svc-02, d-06, d-11, d-12, d-13, d-e, live-gate, macos, signed-build, release-0.13.1, re-run]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-60's re-run contract 87-RERUN-1-HUMAN-UAT.md; 87-68's signed and notarized 0.13.1 gap build with 'Gate (gap build): pending'; the gap fixes 87-61 to 87-67 and 87-70"
provides:
  - "87-RERUN-1-HUMAN-UAT.md scored: '## Pre-run re-check' (Task 1), seven results (3 pass, 2 issue, 2 blocked), '## Run record', '## Findings and observations' (RF1 to RF6, O1 to O3), '## Closing inventory', status partial"
  - "87-HUMAN-UAT.md '## Re-run 1 (87-69)': each superseded 87-59 half mapped to its re-run item and new result; the 87-59 results unchanged"
affects: [87-verification, 87-gap-cycle-2]

actuals:
  tokens: 12000
  tasks: 3
  commits: 4

plan_head_before: 2646f28c37ea0bc1411f8f84b5c6a3a31745e82e
plan_head_after: f13eaf114
commits: 4

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-69-SUMMARY.md
  modified:
    - .planning/phases/87-engine-wine-and-tools/87-RERUN-1-HUMAN-UAT.md
    - .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md

key-decisions:
  - "87-69 re-run scored on the signed 0.13.1 gap build (CDHash 266b7378..., P8 met): items 2, 4 and 6 pass; items 1 and 7 issue; items 3 and 5 blocked; SVC-02's live half is NOT fully proven on macOS"
  - "87-69: F1 does not reproduce on 0.13.1 (offline gate line verdict=blocked:crossover-missing, dialog reads '(offline)', no download); item 1 is issue only because Play stays on launching after the refusal (RF2)"
  - "87-69: new findings for a further gap cycle: RF1 CrossOver launches from GameLib exit in 1-2 s (blocks item 5), RF2 launch state not ended after the offline refusal, RF3 uninstall-dialog Cancel removed the Steam shortcut, RF4 is-protected-root pre-flight on the stored shared prefix runs before the 87-70 bottle route (uninstaller.ts:385-409), RF5 redundant offline warning before the refusal, RF6 in-use/unsafe-name render as bad-reply"
  - "87-69 operator decisions: pin move aside approved; Trash Goblin uninstall with its bottle approved (refused by RF4, nothing deleted); item 5 moved to Caravan SandWitch; empty shared prefix created and removed for the RF1 diagnostic; restores: keep"

requirements-completed: []

duration: about 9h40m of wall clock (2026-11-24T18:37Z to 2026-11-25T04:15Z), of which the operator's run was 18:43Z to 19:21Z plus the closing compare; most of the rest launch 4 left open
completed: 2026-11-25
---

# Phase 87 Plan 69: Live macOS Re-run Gate on the Signed Gap Build Summary

**The re-run of the Phase 87 gap closure on signed 0.13.1 scored 3 pass, 2 issue and 2 blocked. The offline refusal (F1), Winetricks on the game's own bottle (F3), the wine-manager install and list refresh (F2, F4) and the redacted engine log lines are now proven live. Bottle removal is refused by a pre-flight check (RF4). Stop cannot be reached because CrossOver launches drop after 1 to 2 s (RF1). Nobody could name a title for the 180 s hold.**

## Scores

| Item | Result | Launch | Key evidence |
|---|---|---|---|
| 1 Offline refusal | issue | 2 | the gate line reads `verdict=blocked:crossover-missing`, so F1 does not reproduce. The operator saw the dialog text "(offline)", and no download ran. NOT MET: Play stays on launching after the refusal (RF2) |
| 2 Engine lines, redacted | pass | 2 (+ all 8 archives) | 12 download/verify/extract lines and 4 `[engine-notice]` lines. 148 engine-origin lines carry 0 home paths, 0 account names, 0 argument lines and 0 tokens. One launcher-origin `[Legendary]` line was excluded (O1). Presence control: 211 non-engine lines carry the raw home path |
| 3 180 s no-raise hold | blocked | none | the operator could name no title the matcher cannot see |
| 4 Winetricks on own bottle | pass | 1 | `fontsmooth=bgr` landed in the bottle's own `winetricks.log` and changed `user.reg`. No `Prefixes/shared` was created. Offline `tahoma` exited with code 1 and the row ended "install failed" |
| 5 Stop on CrossOver | blocked | 1, 3 | RF1: no CrossOver game stayed running long enough to press Stop |
| 6 Wine manager | pass | 1 | Wine-11.18 installed and removed, and the row followed both. 0 `installWineVersion` IPC rejections. The DXMT skip line was logged once |
| 7 Bottle removal | issue | 4 | the toggle names the bottle and is enabled, but the uninstall was refused `is-protected-root` (RF4). Cancel removed the Steam shortcut (RF3). The sibling stayed byte-identical (1902 files, 0 diff lines) |

The launch 3 re-adopt worked: the marker went from pinned back to crossover (`reason=cx-healthy`), and the save hash `7eb70257...` stayed the same.

## SVC-02 verdict

**SVC-02's live half is NOT fully proven on macOS.** Four of the seven re-run items did not pass. Each is named with its finding:

- Item 1, issue: RF2. The refusal itself is correct.
- Item 3, blocked: no title the matcher cannot see could be named. This is the plan's flagged assumption.
- Item 5, blocked: RF1.
- Item 7, issue: RF4 stops the removal half; RF3 is a side defect.

REQUIREMENTS-v0.11.md already marks SVC-02 Complete (line 26 and traceability line 78). Earlier plans set that, and this plan did not change it. The verifier should reconcile that mark with this verdict. Because of the verdict, this plan does not run `requirements.mark-complete`.

## New findings (for a further gap cycle, D-06)

- **RF1 (F6):** CrossOver launches from GameLib exit after 1 to 2 s, with legendary `launcher-exited` and nile exit code 1. Wine-Staging launches work. The one CrossOver launch right after the pinned-to-crossover restore also works. The same nile command run from a shell starts the game, even with the sidecar's minimal env. Suspected: the TS CrossOver spawn path (`src/backend/launcher.ts`) and the CrossOver overlay (`launch/settings.rs`). Existing todo: `2026-11-24-bottled-games-exit-about-one-second-after-the-wine-command.md`.
- **RF2 (F7):** after an engine-blocked launch, the launch start and display-sleep prevention are never ended (`src/backend/launcher.ts:232`, `:266`).
- **RF3 (F8):** Cancel in the uninstall dialog removed the game's Steam shortcut. The uninstall path did not run. Suspected: the click fell through to `useSteamShortcut.ts` `handleAddToSteam` → `removeFromSteam` (`shortcutsFlowRegistration.ts:405-412`). Not traced.
- **RF4 (F9):** `src/backend/utils/uninstaller.ts:385-409` runs the D-14 pre-flight `checkRemoval` on the stored shared default prefix before the 87-70 per-game-bottle route runs. Every bottle-backed game on the default prefix is therefore refused `is-protected-root`.
- **RF5:** the generic "might not play properly offline" warning appears before a refusal that is certain.
- **RF6:** the bottle op's `in-use` and `unsafe-name` replies are missing from `REMOVAL_REASONS` (`src/common/types/safety.ts:51`), so they render as `bad-reply` (`uninstaller.ts:131-139`). This was found by reading the code, not seen live.
- Observations: O1, the `[Legendary] Launching` line logs the full env, including the raw home path. O2, the helperIntegration jest run can orphan `steam-bridge-helper-signin`. O3, only `WINEPREFIX=<bottle>` ends a CrossOver wineserver, not `CX_BOTTLE`, which matches what 87-65's op sets (`bottles/lifecycle.rs:121-126`).

## Task Commits

1. **Task 1: pre-run re-check** - `b74b86393` (docs)
2. **Task 2: operator run** - checkpoint, no commit. The run record is in the session `notes.log`, which is never committed.
3. **Task 3: score, findings, pointer** - `f13eaf114` (docs)

**Plan metadata:** `76e7c4227` (ROADMAP, STATE). This SUMMARY was swept into the concurrent session's commit `3d4b1e926` (`fix(88): WR-09 ...`) before the metadata commit staged it; its content there is byte-identical, and main was not rewritten because another session was committing on it. A fourth commit corrects this paragraph.

`commits: 4` counts this plan's commits only: `git log --grep 87-69` over the ledger range, 2 task commits, the metadata commit and this correction (the SUMMARY's first version sits in `3d4b1e926`, not counted). Main is shared with the concurrent Phase 88 session, so the raw `git rev-list --count 2646f28c3..HEAD` gave 112 before the metadata commit, and almost all of those are Phase 88 commits.

## Decisions Made

See key-decisions. The operator approved the pin move and the Trash Goblin uninstall, with its bottle, before either action, and the approvals are in `notes.log`. The operator's restore decision was **keep**.

## Deviations from Plan

- **[Run order] Item 5 moved to the sibling.** The operator decided this at 18:59:48Z, after Trash Goblin exited within 1 s (RF1). Caravan SandWitch exited the same way. The item was tried again in launch 3. Because the diagnostic run touched the sibling, `sibling-before.sha` was retaken with the app closed: 1902 files, 2 diff lines against the P4 original, which is kept as `sibling-before-p4.sha`.
- **[Run order] P3 redone.** The first copy was taken while 0.13.0 was still running. It was discarded and redone with P2 clean.
- **[Diagnostic, operator-approved] An empty shared prefix was created to test the RF1 hypothesis** and then removed.
- **[Run order] Item 3 did not run.** No title was named for it.
- **[State updates] Skipped steps.** `state.advance-plan`, `state.record-session` and `state.update-progress` were not run, because STATE's Current Position belongs to Phase 88, which is live in another session. Only the decisions and the metric were added. `requirements.mark-complete` was skipped for the reason given under the SVC-02 verdict.

## Issues Encountered

None in the scoring. The two remaining UX gaps for the operator (the disabled-toggle legibility, which could not be reached, and the 180 s hold) are recorded in the re-run file.

## Known Stubs

None. The plan wrote only documentation.

## Next Phase Readiness

Phase 87 needs a further gap cycle for RF1 to RF6, through `/gsd-plan-phase 87 --gaps`. Items 3, 5 and 7, plus the disabled-toggle legibility, need a re-run 2 after RF1 and RF4 are fixed and a launcher title is named. The 8.3G session captures stay in the scratchpad (mode 0700) until Phase 87 is verified.

## Self-Check: PASSED

- FOUND: .planning/phases/87-engine-wine-and-tools/87-RERUN-1-HUMAN-UAT.md (7 scored results, 0 pending, `## Closing inventory`)
- FOUND: .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md `## Re-run 1 (87-69)`; `git diff b74b86393^..HEAD` on it has 0 removed lines
- FOUND: b74b86393, f13eaf114 (ancestors of HEAD)
- `pnpm planning-gates`: 12/12 passed; gsd-core `audit-uat` parse_gap_files 0
