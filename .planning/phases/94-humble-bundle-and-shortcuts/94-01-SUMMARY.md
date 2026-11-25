---
phase: 94-humble-bundle-and-shortcuts
plan: 01
subsystem: testing
tags: [live-gate, uat, macos, humble, shortcuts, keychain, state-ownership, store-mirror-schedule]

requires:
  - phase: 86-pure-leaf-services
    provides: the signed-over-signed Keychain gate shape and the 86-HUMAN-UAT.md contract pattern
  - phase: 87-engine-wine-and-tools
    provides: the 87-HUMAN-UAT.md contract shape (seven-test review, CONDITIONAL literals, evidence capture)
provides:
  - 94-HUMAN-UAT.md, the Phase 94 live macOS gate contract (five D-09 items, D-10 signed upgrade, seven-test review)
  - the 82 state-ownership amendment for Phase 94 (D-03, D-24) with the storeMirrorSchedule SCHEDULE moved in the same commit
  - 94-VALIDATION.md per-task map naming the three gate tests and the plan that carries each row
  - ROADMAP Phase 94 success criterion 4 naming the scheduled survivors
affects: [94-32, 94-31, 94-03, 88-launch, 92-gog-amazon-sideload]

actuals:
  tokens: 16000
  tasks: 3
  commits: 3

plan_head_before: b4ed940a47afa6401a653d1156233aa85270eaa2
plan_head_after: 647748bf7fd6eebeaf6404cdc45f194a547d82eb

tech-stack:
  added: []
  patterns:
    - "live gate authored before code and run by a different plan (D-E); every row CONDITIONAL until 94-32 Task 1 re-greps the Rust emitters"
    - "a removal or toggle gesture is traced to the component that renders it, and the setting that gates its effect is named as a precondition"

key-files:
  created:
    - .planning/phases/94-humble-bundle-and-shortcuts/94-HUMAN-UAT.md
  modified:
    - .planning/phases/94-humble-bundle-and-shortcuts/94-VALIDATION.md
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
    - src/backend/__tests__/storeMirrorSchedule.test.ts
    - .planning/ROADMAP.md

key-decisions:
  - "Item 3 turns the Desktop-shortcut setting on first: the macOS arm writes the Desktop symlink only when addDesktopShortcuts is set, and the Install tab switch writes the Applications .app alone"
  - "Item 4 adds and removes with Mac Steam closed, because Steam rewrites shortcuts.vdf from memory on exit and could overwrite a GameLib write made while it runs"
  - "Item 1's reconnect is sign-in after disconnect; the expired-state Reconnect wording is scored only if a session expires naturally"
  - "humbleConfigStore TS mirror deletion moves 94 -> 92 and timestampStore 94 -> 88 (D-24)"

patterns-established:
  - "Item 5's iconless premise names a positive observable: no cached icon in the icons folder and no GOG goggame ico, since getIcon finds those before artwork"

requirements-completed: [SVC-04, SVC-05]

duration: 15min
completed: 2026-11-24
status: complete
---

# Phase 94 Plan 01: Live gate contract and ownership amendment Summary

**The SVC-04/SVC-05 live macOS gate (94-HUMAN-UAT.md, five items on a signed 94 build installed over a signed base build) is authored with a seven-test Structural Reachability Review before any port code, and the 82 state-ownership table, its mirror-schedule test and ROADMAP SC4 now say what Phase 94 actually moves.**

## Performance

- **Duration:** about 15 min of wall clock (first task commit 20:31Z, last 20:36Z, plus reading)
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `94-HUMAN-UAT.md` parses as exactly five items (`parseUatItemsWithStats`: 5 items, `headingsSeen` 0) and carries builds-under-test with the D-10 rule (a dev or unsigned build scores item 1 blocked), deliberate behaviour changes, named inputs (N1 the throwaway key, N2 the shortcut game, N3 the artwork-less game), preflight P1-P8 (ditto copies, hashes, Keychain slot inventory without reading a secret) and a run order that puts the first 94 launch under a Keychain capture and screen recording.
- The seven-test review applied 96 pairs (12 state-mutating steps x 8 evidence-bearing ones) and flagged 11, each with a resolution. It changed the contract itself: the Desktop item needs a setting on, Steam must be closed for the shortcuts.vdf writes, the badges are read before the disconnect wipes the library, the revealed value is a one-shot that never enters a capture, and the `.app` double-click is a second process the instance count must account for.
- Required literals (11 rows) are all CONDITIONAL with "re-check: 94-32 Task 1"; Windows `.lnk` and Linux `.desktop` are withdrawn from live scoring (D-11, Phase 99); the evidence-capture section adapts the dual-sink standard to a signed build (no terminal sink, `gamelib.log` per launch, `tee -a` transcript, GATE LAUNCH delimiter, closing inventory).
- `82-STATE-OWNERSHIP.md` has the `### 2026-11-24 (Phase 94 planning, D-03, D-24)` amendment: `humbleConfigStore` 94 to 92, `timestampStore` 94 to 88, and the `humble-services` row notes the login-window seam slot leaving with the relocated seam (survivor deleted by 92). No owner token moved. `storeMirrorSchedule.test.ts` SCHEDULE moved in the same commit (13 tests pass, prettier clean).
- ROADMAP Phase 94 SC4 reads "...except scheduled survivors listed in the schedule test (D-03, D-04, D-24, D-27)", and `94-VALIDATION.md`'s map now names `humbleShortcutsShimSchedule.test.ts`, `humblePortComplete.test.ts` and `shortcutsPortComplete.test.ts` with a Plan column (94-03 to 94-31).

## Task Commits

1. **Task 1: Tracer, the contract end to end** - `4d3bbdcf6` (docs)
2. **Task 2: Structural Reachability Review, required literals, coverage, evidence capture** - `251758608` (docs)
3. **Task 3: 82 ownership amendment, mirror schedule, ROADMAP SC4** - `647748bf7` (docs)

**Plan metadata:** committed separately (docs: complete plan).

## Files Created/Modified

- `.planning/phases/94-humble-bundle-and-shortcuts/94-HUMAN-UAT.md` - the Phase 94 live macOS gate contract, run by 94-32
- `.planning/phases/94-humble-bundle-and-shortcuts/94-VALIDATION.md` - map repointed to the three gate tests, Plan column added
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` - cell edits plus the Phase 94 amendment
- `src/backend/__tests__/storeMirrorSchedule.test.ts` - `humbleConfigStore: 92`, `timestampStore: 88`, header note
- `.planning/ROADMAP.md` - Phase 94 SC4 wording

## Decisions Made

- Item 3 flips the operator's Desktop-shortcut setting on for the item and restores it from the P3 copy, because `shortcuts.ts:177-196` writes the Desktop symlink only when `addDesktopShortcuts` is set, while the Install tab's "Applications shortcut" switch passes `fromMenu` and writes the Applications `.app` alone. As planned from CONTEXT D-09 ("create both") the Desktop half could not pass from the switch alone.
- Item 4 runs with Mac Steam closed for both the add and the remove, and the shortcuts.vdf is read before Steam starts and after it quits (Test 5 F7).
- Item 1's "reconnect" is sign-in after disconnect (Login screen Humble tile); the expired-state "Session expired — Reconnect" text renders only for an expired session, which the gate does not force.
- Flagged assumption (spec-less edge probe), carried from the plan: the SVC-04 and SVC-05 edge-coverage rows are unclassified and unresolved. They are covered by the explicit edge truths in 94-08 (session expired mid-sync, 401/403/429/5xx), 94-18 (refuse on unknown), 94-19 (corrupt file copied aside), 94-20 (existing-title skip, missing userdata) and by this gate, and are not claimed as verified edges.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Item 3 as written (D-09 "create both") could not produce the Desktop item from the shipped UI**
- **Found during:** Task 2 (Test 7, reading `IntegrationRows.tsx` and `shortcuts.ts`)
- **Issue:** the Install tab switch calls `addShortcut(appName, runner, true)`, whose macOS arm writes the Desktop symlink only when the `addDesktopShortcuts` setting is on. With the setting at its default the gate could never see a Desktop item.
- **Fix:** item 3's `expected:` and the run order make the setting a recorded, restored precondition (Settings, Shortcuts), and Test 6 gives its positive observable (`ls -la ~/Desktop/<title>.app` is a symlink into `~/Applications`).
- **Files modified:** `94-HUMAN-UAT.md`
- **Committed in:** `4d3bbdcf6`, `251758608`

**2. [Rule 1 - Bug] Item 5's iconless premise could be silently invalidated by a cached or on-disk icon**
- **Found during:** Task 2 (Test 6, reading `getIcon` in `shortcuts/utils.ts`)
- **Issue:** `getIcon` returns a cached `icons/<appName>.jpg` or a GOG install's `goggame-*.ico` before it looks at artwork, so a game with no artwork can still get an icon.
- **Fix:** N3 excludes GOG games with an installed ico, and Test 6 requires the icons-folder listing as the positive observable (a cached file scores the half blocked or changes the game).
- **Files modified:** `94-HUMAN-UAT.md`
- **Committed in:** `4d3bbdcf6`, `251758608`

**3. [Rule 1 - Bug] Item 4's write could be overwritten by a running Mac Steam**
- **Found during:** Task 2 (Test 5)
- **Issue:** Steam rewrites shortcuts.vdf from its own memory when it exits, so a GameLib add or remove made while Steam runs can be lost, and a read taken then is not what GameLib wrote.
- **Fix:** both writes run with Steam closed (`pgrep -x steam_osx` empty) and the file is hashed before Steam starts and after it quits.
- **Files modified:** `94-HUMAN-UAT.md`
- **Committed in:** `4d3bbdcf6`, `251758608`

### Process notes (not deviations in behaviour)

- The plan's precondition names branch `phase-94-humble-shortcuts`; the worktree branch is `gsd/phase-94-humble-bundle-and-shortcuts`, as the dispatch directed. The substance of the precondition holds: the worktree is `.claude/worktrees/phase-94` and HEAD (`b4ed940a4`) equals main's.
- The pre-commit worktree allow-list (`agent-*` branch namespace) was not applied: this sequential executor was directed onto the `gsd/phase-94-...` branch, and the protected-branch check (`git.base-branch --is-protected`) returned `false`.
- Task 1 is a tracer; interactive mode with an automated-only `<verify>` re-ran it end to end (5 items, `headingsSeen` 0) before Task 2.

**Total deviations:** 3 auto-fixed (3 bug). **Impact on plan:** each makes the contract performable; no scope creep.

## Issues Encountered

None. `pnpm planning-gates` passes (12 of 12), `storeMirrorSchedule.test.ts` passes (13 tests) and prettier is clean on the one TS file; the four planning docs are prettier-ignored (`--file-info` reports `ignored: true`).

## Known Stubs

None. The contract's `Named inputs` blanks (`________`) are for the operator to fill before the run, and the required-literals rows are deliberately CONDITIONAL until 94-32 Task 1 re-greps the Rust emitters; both are the contract's design, not stubs.

## Threat Flags

None. This plan writes planning documents and one test constant; no network endpoint, auth path or file-access pattern is added. The threat register's mitigations (T-94-01 to T-94-03) are in the contract: no revealed value in any capture, P3 copies and P4 hashes before anything runs, a closing inventory, and every changed ownership cell carrying a reason row.

## User Setup Required

None. The operator names the throwaway key and the games under `## Named inputs` when the gate runs (94-32).

## Next Phase Readiness

- 94-02 and 94-03 can start (Wave 1). 94-32 runs the gate on the signed Phase 94 build and the signed base build that 94-31 records in `94-VALIDATION.md` "## Signed builds (D-10)" (that section does not exist yet).
- The `humblePortComplete.test.ts`, `shortcutsPortComplete.test.ts` and `humbleShortcutsShimSchedule.test.ts` names in the validation map are the ones 94-03 creates.

## Self-Check: PASSED

- FOUND: `.planning/phases/94-humble-bundle-and-shortcuts/94-HUMAN-UAT.md`
- FOUND: `.planning/phases/94-humble-bundle-and-shortcuts/94-VALIDATION.md` (Plan column present)
- FOUND: commits `4d3bbdcf6`, `251758608`, `647748bf7` on `gsd/phase-94-humble-bundle-and-shortcuts`
- FOUND: `humbleConfigStore: 92` and `timestampStore: 88` in `src/backend/__tests__/storeMirrorSchedule.test.ts`; no `timestampStore: 94`
