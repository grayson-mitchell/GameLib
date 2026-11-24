---
phase: 88-launch-pipeline
plan: 01
subsystem: planning-artifacts
tags: [live-gate-contract, state-ownership, utils-inventory, validation-map, svc-03, macos]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the signed Phase 87 gap build (87-68) that the 88.3 gate installs over, and the 87-HUMAN-UAT.md contract shape
provides:
  - 88-HUMAN-UAT.md, the SVC-03 live macOS gate contract (four D-17 items, authored before any 88 code, run only by the 88.3 live-gate plan)
  - the 2026-11-25 amendment in 82-STATE-OWNERSHIP.md (per-row target sub-phase, overlay-install-flight flip 97 -> 88, known-fix-trees row, three deferral rows)
  - the same-dated amendment in 82-UTILS-BOOTSTRAP-INVENTORY.md (D-28 wine rows moved 87 -> 88, per-row 88.x targets for utils and boot steps)
  - a Sub-phase column and the D-30 gate model in 88-VALIDATION.md
affects: [88-02, 88.1, 88.2, 88.3, 89, 91]

actuals:
  tokens: 16000
  tasks: 3
  commits: 3
plan_head_before: b74b8639311f73f367882bd5a39c58f8c9b76a34
plan_head_after: 46332271e2114ec96a9d98b00743f020604a7694

tech-stack:
  added: []
  patterns:
    - "live-gate contract with CONDITIONAL required-literal rows and a seven-test Structural Reachability Review (the 87-HUMAN-UAT shape)"
    - "ownership amendment keeps integer phase columns and records the sub-phase in the amendment's own column"

key-files:
  created:
    - .planning/phases/88-launch-pipeline/88-HUMAN-UAT.md
  modified:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UTILS-BOOTSTRAP-INVENTORY.md
    - .planning/phases/88-launch-pipeline/88-VALIDATION.md

key-decisions:
  - "Item 2's second Play is a gamelib://launch link from the shell, because the game page's Play control latches (playClickedLatch.ts) and a UI double Play is unperformable (Test 7)"
  - "Item 3 uses a CrossOver title on purpose: the Wine loader exits about a second after launch, so only a group or session match proves re-adoption (D-31, Pitfall 10)"
  - "Item 2's after-script half is scored from the next launch (D-31: the after-script runs at the next boot, not at quit)"
  - "Every 'TS mirror deleted' cell stays an integer; the 88.x sub-phase lives only in the amendment's own column so storeMirrorSchedule.test.ts keeps parsing"
  - "The info-caches:systemInfo Rust owner moves from gamelib-engine to gamelib-info, matching the 88-RESEARCH recommendation and the D-30 split"
  - "online_monitor.ts, connectivityNow.ts and gamedetails/ are recorded as not ported by 88 (the funnel reads EngineCtx.online)"

patterns-established:
  - "P2 is amended for a crash-survival item: the GameLib processes must be gone while the game and its wineserver are expected alive"
  - "Scripts for a gate are the runner's own (pre.sh, post.sh, after.sh), attached through the game's Settings screen, never the operator's"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "88-HUMAN-UAT.md exists as a parseable contract with exactly four pending D-17 items, the behaviour-change list, preflight, run order, evidence capture, CONDITIONAL required literals and the Structural Reachability Review"
    requirement: SVC-03
    verification:
      - kind: other
        ref: "node uat.cjs parseUatItemsWithStats over 88-HUMAN-UAT.md: headingsSeen 0, items 4, plus the four grep checks of the task verify"
        status: pass
    human_judgment: true
    rationale: "The contract's soundness is only proven when the 88.3 live-gate plan runs it on real hardware; parsing and section presence are automated, adequacy is not"
  - id: D2
    description: "Both 82 documents carry the 2026-11-25 Phase 88 amendment with a target sub-phase per row, the overlay-install-flight owner flip to 88 (gamelib-knownfix), the known-fix-trees row and the D-28 wine-row move"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/storeMirrorSchedule.test.ts (13 passed, unchanged)"
        status: pass
      - kind: other
        ref: "pnpm planning-gates (12/12 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "88-VALIDATION.md has a Sub-phase column on every per-task row, the D-30 gate model under Sampling Rate, and names 88-HUMAN-UAT.md as authored by 88-01 and run by the 88.3 live-gate plan"
    requirement: SVC-03
    verification:
      - kind: other
        ref: "grep -q '| Sub-phase |' and grep -q '88-HUMAN-UAT.md' over 88-VALIDATION.md, and the ROADMAP 88.3 'CI plus Phase 99' awk-grep"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 01: Launch scaffolding and known fixes Summary

**Four-item SVC-03 live macOS gate contract (88-HUMAN-UAT.md) authored before any Phase 88 code, plus the 82 ownership and utils/boot-step amendments that name the acting sub-phase (88, 88.1, 88.2, 88.3) for every row scheduled for 88**

## Performance

- **Duration:** about 25 min (estimated; the start time was not captured at the first tool call)
- **Started:** 2026-11-24T19:05:00Z (approximate)
- **Completed:** 2026-11-24T19:32:00Z
- **Tasks:** 3
- **Files modified:** 4 (one created, three amended)

## Accomplishments

- 88-HUMAN-UAT.md: four D-17 items (Launches; Single flight and quit; Force Quit survival and re-adopt; Known fix and scripts) that parse as four pending rows with no unread heading, the D-30 build rule (signed Phase 88 build over the signed Phase 87 gap build, a dev build scores everything `blocked`), the six deliberate behaviour changes (D-05, D-27, D-08/D-09, D-31, D-29, the EngineLog exe-override rule), a nine-step preflight (P1 to P9), the run order 1, 4, 2, 3, the dual-sink evidence capture, eight CONDITIONAL required literals, and a seven-test Structural Reachability Review with a 48-pair interaction pass.
- The review found and amended two things before any run: a UI double Play cannot be performed (the Play control latches), so item 2 uses a `gamelib://launch` link; and P2's "nothing left running" would fail on the state item 3 needs, so P2 is amended for item 3's reopen.
- 82-STATE-OWNERSHIP.md: `app-runtime:overlay-install-flight` flips 97 -> 88 with Rust owner `gamelib-knownfix` (still one `*`), a new `known-fix-trees` row, a corrected `info-caches:systemInfo` Rust owner, a target sub-phase for every 88-scheduled row, and three deferral rows (`online_monitor.ts`, `connectivityNow.ts`, `gamedetails/`).
- 82-UTILS-BOOTSTRAP-INVENTORY.md: `checkWineBeforeLaunch` and `downloadDefaultWine` move 87 -> 88 (88.1); `shutdownWine` and `getWineFromProton` are recorded as scheduled TS that stays; every utils and boot-step row destined for 88 carries its sub-phase.
- 88-VALIDATION.md: a Sub-phase column on all twelve per-task rows (one 88, three 88.1, three 88.2, four 88.3, one `all`), the D-30 gate-model sentence, and the author and runner named in Manual-Only Verifications.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer, author 88-HUMAN-UAT.md** - `b8886860c` (docs)
2. **Task 2: The 82 ownership and utils/boot-step amendments** - `dc75e08b1` (docs)
3. **Task 3: Sub-phase column and D-30 gate model in 88-VALIDATION.md** - `46332271e` (docs)

**Plan metadata:** the final docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## Files Created/Modified

- `.planning/phases/88-launch-pipeline/88-HUMAN-UAT.md` - the SVC-03 live macOS gate contract
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` - overlay flight flip, known-fix-trees row, systemInfo owner cell, the 2026-11-25 amendment
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UTILS-BOOTSTRAP-INVENTORY.md` - a new `## Amendments` section with the utils and boot-step rows
- `.planning/phases/88-launch-pipeline/88-VALIDATION.md` - Sub-phase column, gate model, manual-only author and runner, Wave 0 line ticked

## Decisions Made

- The contract's second Play is a `gamelib://` link; the first Play is the game page's Play control (Test 7, `playClickedLatch.ts`).
- Item 3 runs on a CrossOver title so the Wine-loader exit (D-31, Pitfall 10) is exercised; "alive" means a recorded game process or the recorded session, not the leader pid alone.
- No scored step is offline; P6 carries the off, act, on, report rule for any step an operator adds.
- The gate's own scripts (`pre.sh`, `post.sh`, `after.sh`) are the runner's, attached through the game's Settings, restored from a P3 copy.
- SVC-03's edge-coverage row stays `unclassified` and unresolved: the D-14 matrix stands in for it and nothing here claims a verified edge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale Rust-owner cell on `info-caches:systemInfo`**
- **Found during:** Task 2 (82 ownership amendment)
- **Issue:** the row's "Rust owner after flip" read `gamelib-engine`, while 88-RESEARCH and the D-30 split (88.1: "system info + `pci_ids_*` into `gamelib-info`") put the system-information code in `gamelib-info`. Left alone, the table would contradict the plan that ports it.
- **Fix:** corrected the cell in place to `gamelib-info` and recorded it as a row in the amendment table. No owner token moved.
- **Files modified:** `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`
- **Verification:** `storeMirrorSchedule.test.ts` 13 passed, `pnpm planning-gates` 12/12
- **Committed in:** `dc75e08b1`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 documentation correction)
**Impact on plan:** the one cell change keeps the ownership table consistent with the sub-phase that acts on it. No scope creep.

Two small additions inside the plan's scope, not deviations: the contract carries a "Withdrawn from live scoring" section and a `## Summary` count block as 87-HUMAN-UAT.md does, and 88-VALIDATION.md's Wave 0 line for the contract and amendments is ticked.

## Issues Encountered

None. The ROADMAP check the plan asked for passed: Phase 88.3 success criterion 3 already reads "on Windows and Linux (CI plus Phase 99)", so the roadmap was not edited.

## Known Stubs

None. The eight CONDITIONAL rows of 88-HUMAN-UAT.md "Required literals" are deliberate (no Rust emitter exists yet); each is re-checked by the 88.3 live-gate plan, Task 1. They are not stubs in shipped code and are not entered in `.planning/WINDOWS.md`.

## Threat Flags

None. No source, endpoint, auth path or schema was touched; T-88-01 (evidence recorded as names, counts, hashes and `~` paths only) and T-88-02 (a `ditto` copy before item 1, restore after the item that changed a file, the operator names every title) are mitigated in the contract's Preflight and Evidence capture sections.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-02 (the next plan of sub-phase 88) can start: the contract and the ownership amendment both exist before any coding plan, as ROADMAP Phase 88 success criterion 2 requires.
- 88.1, 88.2 and 88.3 each have their rows named in the two 82 amendments and in the validation map's Sub-phase column.
- Open for the 88.3 planner: the exact wording of every CONDITIONAL literal, where the per-launch record lives, and which file the re-adopted line lands in (the contract records the question; it does not decide it).

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*

## Self-Check: PASSED

- FOUND: `.planning/phases/88-launch-pipeline/88-HUMAN-UAT.md`, `88-VALIDATION.md`, `82-STATE-OWNERSHIP.md`, `82-UTILS-BOOTSTRAP-INVENTORY.md`
- FOUND commits: `b8886860c`, `dc75e08b1`, `46332271e` (all ancestors of HEAD)
- Plan-level verification: 88-HUMAN-UAT.md parses to four items with no unread heading; both 82 documents carry the amendment and `storeMirrorSchedule.test.ts` passes unchanged (13 tests); 88-VALIDATION.md has the Sub-phase column and names the author and runner; no source file touched.
