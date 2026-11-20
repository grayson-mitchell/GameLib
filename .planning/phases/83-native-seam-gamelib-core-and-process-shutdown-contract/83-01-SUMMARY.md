---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 01
subsystem: testing
tags: [live-gate, macos, process-lifetime, reaper, uat, structural-reachability-review]
status: complete

requires:
  - phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
    provides: the T-80-16 nettop orphan and the Force Quit item shape in 80-HUMAN-UAT.md
provides:
  - 83-HUMAN-UAT.md, the live macOS gate contract for FND-04 and the live native-channel check for FND-03, authored before any Phase 83 code
  - the fixed log-literal and sink table that plans 83-03, 83-06, 83-07, 83-08 and 83-09 must satisfy
affects: [83-03, 83-06, 83-07, 83-08, 83-09, 83-11]

actuals:
  tokens: 8400
  tasks: 2
  commits: 2

plan_head_before: c939280e55dd86cbfa66b600c3778b69c3df0e5a
plan_head_after: ec3bdddf2edf1c3efb68706c0d823a182d06fd13

tech-stack:
  added: []
  patterns:
    - "Gate contract authored by one plan and run by another (D-E); each item names its launch ordinal and evidence file"
    - "Shell-log lines are scored by pid because gamelib-shell.log is append-only"

key-files:
  created:
    - .planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-HUMAN-UAT.md
  modified: []

key-decisions:
  - "The external-link gesture for item 3 is Settings, General, Language (non-English), then the report link, because the About dialog's project URL is a plain paragraph and the Donate row calls openKofiPage, not openExternalUrl"
  - "Item 4 does not require the pending-operations confirm to appear: quitHandler only shows it when isLocked, isRunning or isBridgeHosting, which a Rust depot install may not set"
  - "The single-instance count excludes --gamelib-reaper lines, since the reaper is the same executable and a bare pgrep reads 2"
  - "P5 requires an uninstalled depot target: a cancel over an installed manifest writes no 1026 record"

patterns-established:
  - "A helper absent from the before snapshot is recorded 'not exercised', never 'passed'"
  - "Nettop/watchdog absence after a SIGKILL is a pre-existing guarantee (the watchdog exits when its parent pid dies) and is recorded as such, so it is not misread as a reaper result"

requirements-completed: [FND-03, FND-04]

coverage:
  - id: D1
    description: "83-HUMAN-UAT.md exists with five pending UAT-shaped items that the gsd-core parser reads in full"
    requirement: "FND-04"
    verification:
      - kind: unit
        ref: "node parseUatItemsWithStats over 83-HUMAN-UAT.md (5 items, headingsSeen 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The contract's live run proves no orphaned helper survives a SIGKILL or graceful quit on macOS and that the native channels behave as before"
    requirement: "FND-04"
    verification: []
    human_judgment: true
    rationale: "A live macOS run by plan 83-11; this plan only authors the contract and never runs it"
---

# Phase 83 Plan 01: Live macOS gate contract Summary

**83-HUMAN-UAT.md: a five-item live macOS gate contract (Force Quit with a Steam-launched game surviving, reaper visibility, native channels, graceful quit with the 1026 finalize, the 5 s exit deadline), with a dual-sink capture recipe, a literal/sink table and a seven-test Structural Reachability Review whose pairing pass considered 136 pairs and flagged 14.**

## Performance

- **Started:** 2026-11-20T08:55:25Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- Task 1 (tracer, `edcfa5f35`): preflight P1-P6, the dual-sink evidence capture (one UTC session dir, `tee -a`, the `=== GATE LAUNCH ${N} ===` delimiter, per-launch archives of both `gamelib.log` and `gamelib-shell.log`, a one-instance assertion, closing inventory), the eight-row required-literal table with plan, file and sink, item 1 (D-13 Force Quit with `steam://rungameid` game), and the review rows for item 1, P1-P6 and the capture instruction. The tracer `<verify>` was re-run before expansion and passed.
- Task 2 (`ec3bdddf2`): items 2-5, review rows for them, the Test 5 pairing pass (reduction stated: 8 state-mutating x 17 evidence-bearing requirements = 136 pairs, 14 flagged, each with a resolution), and the run order (items 2 and 3 before item 1's SIGKILL; item 5 after item 4).
- The review found and removed two structural impossibilities before the contract was published, both Test 7: the About dialog's project URL is not a link, and the Donate row uses `openKofiPage`, so neither could exercise `openExternalUrl`.

## Task Commits

1. **Task 1: tracer, Force Quit item, preflight, capture, literal table** - `edcfa5f35` (docs)
2. **Task 2: items 2-5 and the Test 5 pairing pass** - `ec3bdddf2` (docs)

## Files Created/Modified

- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-HUMAN-UAT.md` - the live macOS gate contract.

## Decisions Made

See `key-decisions` above. Findings worth carrying to later plans: `gamelib-shell.log` is not rotated (`shell_diag` opens it with `append(true)`), the reaper's stderr lines reach the transcript only, and today's `[shell] depot jobs still running at exit deadline: ` line at `main.rs:763` is `shell_eprintln!` and is not the literal plan 83-09 must emit.

## Deviations from Plan

None - plan executed exactly as written. Two small wording repairs were made inside the plan's own text: item 5's `expected:` line in the plan was garbled ("at most 5000 plus the time ... is NOT counted") and was written as "at most 5000, with the confirm-dialog time not counted"; and the item 3 external-link subject was chosen from the Test 7 trace, which the plan left to the author.

## Issues Encountered

None.

## Known Stubs

None. Every required-literal row is CONDITIONAL by design (no emitter exists yet); plan 83-11 Task 1 owns the re-check.

## Threat Flags

None. The contract records pids, process names, literals and counts only; captures stay under `/tmp` and are not committed (T-83-02).

## Next Phase Readiness

Plans 83-03, 83-06, 83-07, 83-08 and 83-09 can read the literal/sink table for the exact strings to emit. Plan 83-11 runs this contract; it was not run here.

## Self-Check: PASSED

- 83-HUMAN-UAT.md exists; parseUatItemsWithStats returns 5 items, all `pending`, headingsSeen 0.
- Commits `edcfa5f35` and `ec3bdddf2` exist; `git rev-list --count c939280e5..HEAD` measured 2 before this SUMMARY.
- Acceptance greps: `## Structural Reachability Review` 1; `gamelib-shell.log` 12 (>= 2); `steam://rungameid` 4; `pairs considered` 1; `1026` 6; `exit finished in ` 8; REACHABLE/IMPOSSIBLE/CONDITIONAL table rows 59 (>= 12); items 2 and 3 precede item 1's SIGKILL in the run order.
- `.planning` is prettier-ignored (`--file-info` reports `ignored: true`), so no prettier check applies (convention 5).
