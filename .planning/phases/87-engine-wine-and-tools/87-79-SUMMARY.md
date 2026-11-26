---
phase: 87-engine-wine-and-tools
plan: 79
subsystem: live-gate-rerun-2
tags: [gap-closure, svc-02, d-11, d-12, d-13, live-gate, macos, rerun-2, rf1, rf2, rf3, rf4, rf5]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-71's re-run 2 contract; 87-78's signed gap build 2 (0.13.2) with `Gate (gap build 2): pending`; the cycle 2 fixes 87-72 to 87-77 and the RF3 debug session"
provides:
  - "87-RERUN-2-HUMAN-UAT.md scored: 6 pass, 1 blocked (item 5, no title), 0 issue; pre-run re-check, run record, observations R2O1 to R2O4, closing inventory"
  - "87-RERUN-1-HUMAN-UAT.md '## Re-run 2 (87-79)' pointer; re-run 1 results unchanged (0 removed lines)"
  - "RF1 todo moved to todos/completed with the 2026-11-26 resolution; debug record status resolved with '## Live proof'"
affects: [87-verification]

actuals:
  tasks: 3
  commits: 2

key-decisions:
  - "P5 operator reply `same`: (a) Trash Goblin, (b) Caravan SandWitch, (c) Trash Goblin uninstalled with its bottle."
  - "P5 (d): the operator proposed Stellaris; it is a Steam title (Bridge or no deadline, never the Notice path), so the operator accepted `none` and item 5 scores blocked."
  - "P5 (e): no game reaches the disabled bottle toggle; the operator accepted the Settings > General > Start Minimized fallback."
  - "Item 6's sibling compare differs by three game-owned Unreal CrashReportClient session directories written by the sibling's own item 3 run (mtime 17:43Z, before the 17:56Z uninstall); scored pass with the attribution, recorded as contract observation R2O1."
  - "Restores: the operator chose `restore bottle`; Trash Goblin's bottle was restored from the P3 copy (tree hash equal). Nothing else needed restoring."

requirements-completed: []

completed: 2026-11-26
---

# Phase 87 Plan 79: Re-run 2 of the live macOS gate on the signed 0.13.2 build Summary

**Gap cycle 2's live proof passed on the signed, notarized 0.13.2 build: 6 of 7 items pass and item 5 is blocked for want of a
qualifying title, as in re-run 1. RF1 (CrossOver launches exit), RF2 (the refused launch never ended), RF3 (Cancel removed the
Steam shortcut), RF4 (is-protected-root blocked the bottle removal) and RF5 (the generic warning before the refusal) are each
proven fixed live. No new finding.**

## Scores

| Item | Result | Launch |
|---|---|---|
| 1. Offline refusal shows only the engine dialog, and the launch ends | pass | 2 (sandboxed, pin aside) |
| 2. The generic offline warning still shows when the engine would launch | pass | 1 |
| 3. CrossOver launches from GameLib keep running | pass | 1 |
| 4. Stop ends a non-Steam game on CrossOver | pass | 1 |
| 5. The 180 s no-match notice does not raise the window | blocked (no title) | — |
| 6. Cancel changes nothing; the bottle removal leaves the sibling intact | pass | 3 |
| 7. The disabled toggle is legible in three themes | pass (Start Minimized fallback) | 3 |

## SVC-02 live half on macOS

Proven for every item the operator's library can reach. The one gap is item 5's premise (a non-Steam title whose launcher stays
up while its game is unmatched), which no installed title meets; its no-raise path stays proven by unit tests and re-run 1's
amended rows. `requirements.mark-complete` was not run, per the plan's flagged assumption (only when every item passes); the
phase verifier decides SVC-02.

## Tasks

1. **Task 1 (tracer):** `## Pre-run re-check` at `06e4d2844` (`ec5a86d75`): every CONDITIONAL row resolved, the gate line copied,
   the new 87-74 provenance lines added, the old Steam-removal log literal amended to an observation (since 94-22 it is a
   notification only).
2. **Task 2 (checkpoint, blocking-human):** the operator ran launches 1 to 3 with the orchestrator, every approval given
   directly in this session (P5 `same`, `ok`, `approve pin move`, `approve pin back`, `approve`, `restore bottle`).
3. **Task 3:** scored, run record, observations, closing inventory, the re-run 1 pointer, RF1 resolved.

## Deviations from Plan

1. Trash Goblin was played three times in item 3 rather than twice; the third run was carried into item 4's Stop.
2. Item 5's 180 s hold did not run (P5 (d) `none`).
3. Item 7 read the fallback surface, not the uninstall dialog's toggle (no game reaches that state).
4. Task 2 was run by the orchestrator with the operator directly, not by a spawned executor (the executor does not accept relayed
   consent; see 87-78).

## Observations

R2O1 (the sibling snapshot predates the sibling's item 3 run, a contract-shape note for future gates), R2O2 (legendary leaves 1
file in the install directory), R2O3 (item 5 blocked by the library twice), R2O4 (the demo-status probe briefly starts a
bottle's wineserver). None is a Phase 87 defect.

## Self-Check: PASSED

The plan's Task 3 verify: 0 `result: pending`, 7 scored results, `## Closing inventory` 1, `## Re-run 2 (87-79)` 1, re-run 1 has
fewer than 8 item headings, `pnpm planning-gates` 12/12; the re-run 1 diff has 0 removed lines.
