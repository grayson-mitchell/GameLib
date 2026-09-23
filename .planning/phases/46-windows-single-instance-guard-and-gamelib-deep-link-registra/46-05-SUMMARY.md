---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 05
subsystem: infra
tags: [tauri, windows, nsis, live-gate, single-instance, focus-sentinel]

# Dependency graph
requires:
  - phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra plan 46-04
    provides: "The un-suppressed Windows gamelib:// registration and a debug NSIS setup .exe built from HEAD sha 607089433, ready for the live gate"
provides:
  - "46-LIVE-GATE.md: a real-machine, real-process record of P0 and Checks 1-5 against the 46-04 build. P0 and Checks 1-2 PASSED. Check 3 FAILED. Checks 4-5 were NOT RUN"
  - "The Task 3 FAIL branch: no closure file was touched. The todo stays in pending/, ledger row U-34.5-18 stays OPEN, and REQUIREMENTS.md traceability rows stay Pending"
  - "outcome: live-gate FAIL (Check 3) -- the minimized primary window was not restored or focused by the Windows focus sentinel"
affects: ["46-06", "46-07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A live gate's FAIL branch is itself a recorded, committed artefact (not a silent stop): 46-LIVE-GATE.md's own 'If any check FAILS' section, followed here to the letter -- record the failing check's console output, stop running remaining checks, let the operator choose fix-forward vs. revert, and leave every closure file untouched until a PASS exists"

key-files:
  modified:
    - .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-LIVE-GATE.md

key-decisions:
  - "Operator chose fix-forward via /gsd-plan-phase 46 --gaps over reverting the 46-04 override-removal commit (607089433). The guard mechanism itself (mutex + named pipe + owner-SID check) worked -- P0 and Checks 1-2 passed cleanly, including a real gamelib://launch?appName=...&runner=... open with no second window -- so the fix scope is narrowly the Windows raise call (unminimize), not the whole registration decision. Reverting would have re-suppressed gamelib:// on Windows entirely, discarding working delivery machinery to fix a window-focus bug."
  - "Root cause diagnosis (orchestrator, pre-46-06) pointed at tao-0.35.3's Windows show()/set_focus() not restoring a minimized window, plus a secondary candidate (the Windows foreground lock, since the secondary process is foreground when it exits). Both were carried into 46-06's scope rather than guessed at and fixed inline in this plan, because 46-05 itself makes no code changes -- it is gate-and-record only."

requirements-completed: []

# Metrics
duration: ~15min (live gate execution + recording, operator-driven)
completed: 2026-09-24
---

# Phase 46 Plan 05: Live gate on the 46-04 build Summary

**Ran the blocking live gate (`46-LIVE-GATE.md`) against the 46-04 debug NSIS build on this Windows 11 machine: P0 and Checks 1-2 PASSED (including a real external `gamelib://launch` deep link reaching the running instance with no second window and no redundant process), but Check 3 FAILED -- minimizing the GameLib window and running a bare second launch delivered the focus sentinel and exited 0, yet the existing window was never restored or focused. Checks 4-5 were not run per the gate's own failure branch. No closure artefact was touched: the todo stays in `pending/`, ledger row `U-34.5-18` stays OPEN, and `REQUIREMENTS.md` traceability stays `Pending`. The operator chose fix-forward; the fix is plan 46-06.**

## What happened

`46-LIVE-GATE.md` (built at HEAD sha `607089433`, the 46-04 Task 1 commit; setup .exe `GameLib_0.7.0_x64-setup.exe`, 114,775,426 bytes, mtime 2026-09-23 23:48:15 +1200) was run top to bottom by the operator on this machine, and its results were recorded by commits `9aaece168` (the FAIL record) and `d390c6998` (the STATE.md fix-forward decision).

- **P0 (precondition, install):** PASSED. The registered protocol handler pointed at the new install path (`"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"`), not the stale Electron-era key, and zero processes were running before launch.
- **Check 1 (external open reaches the running instance):** PASSED. A side-effect-free `gamelib://ping?phase=46&check=1` open (containing `&`) delivered with `[shell] delivered single-instance deep link to sidecar: ok` and no new window. A real `gamelib://launch?appName=2706020&runner=steam` open launched the game through the running instance, again with no second window.
- **Check 2 (process counts, 5s settle):** PASSED. `gamelib-sidecar` and `GameLib` (installed as `gamelib-shell`) each held steady at 1, with the sidecar's `ParentProcessId` matching the single shell's `ProcessId`.
- **Check 3 (bare second launch focuses):** **FAILED.** The second launch's console correctly printed `[shell] another GameLib instance is already running -- sending focus sentinel to it and exiting` and exited 0, and process counts stayed 1/1 -- but the operator reported the minimized primary window was **not** restored. The primary's own console showed nothing about receiving the sentinel, because at that point in the code the sentinel arm had no `eprintln!` of its own, so the record could not distinguish "sentinel never arrived" from "sentinel arrived but did nothing."
- **Checks 4-5:** NOT RUN, per `46-LIVE-GATE.md`'s own instruction to stop running remaining checks after the first failure.

**Suspected cause**, recorded in `46-LIVE-GATE.md` at gate time and carried forward into 46-06's scope: the Windows sentinel arm called `show()` + `set_focus()` with no `unminimize()`. tao-0.35.3's Windows `show()` only diffs the VISIBLE flag (no-op on an already-visible, minimized window), and `set_focus()` is gated on `!is_minimized`. A secondary candidate -- the Windows foreground lock, since the secondary process holds the foreground when it exits -- was also named for investigation.

**Task 3's FAIL branch** ran exactly as `46-05-PLAN.md` specifies: `Verdict: FAIL (first failing: Check 3 -- the minimized primary window was not restored or focused by the focus sentinel)` was recorded in `46-LIVE-GATE.md`, and none of the closure files were touched --
`.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` is still in `pending/`, `34.5-UNTESTED-ITEMS.md`'s `U-34.5-18` row is still **OPEN**, and `REQUIREMENTS.md`'s `REQ-46-*` rows are still `Pending`.

## Operator decision

The operator chose **fix-forward via `/gsd-plan-phase 46 --gaps`** over reverting the 46-04 override-removal commit. The re-gate and ALL closure duties 46-05's Task 3 would have performed on a PASS -- the todo move, the `U-34.5-18` ledger row, and `REQ-46-*` traceability -- move to **plan 46-07**, which records its own result in `46-LIVE-GATE-RERUN.md` and leaves this `46-LIVE-GATE.md` intact as the historical record of this FAIL.

## The fix

Plan **46-06** (this repository's next plan) closes the Check 3 gap: it adds `unminimize()` before `show()`/`set_focus()` in the Windows sentinel arm and the two tray raise sites, adds receipt/result logging to the sentinel arm so a re-run of the gate can tell whether the sentinel arrived, and adds a defensive `AllowSetForegroundWindow` grant from the secondary to the owner-verified primary.

## Operational corrections learned during this gate

Two corrections to keep in mind for future Windows live-gate work on this project, recorded here as they were not previously written down:

- The installed executable is `%LOCALAPPDATA%\GameLib\gamelib-shell.exe`, and its process name is `gamelib-shell` -- not `GameLib.exe` / `GameLib`. `Get-Process GameLib` commands must be run as `Get-Process gamelib-shell`.
- The debug build's sidecar is spawned as `node <repo>\build\main\sidecar.js`, not a bundled `gamelib-sidecar.exe`. Sidecar process identification during a debug-build gate must match on `node.exe` processes whose command line contains `sidecar.js`, not on an image name.

## Task Commits

This plan's work was recorded across the following commits (live-gate execution is orchestrator/operator-driven, not task-atomic in the usual sense):

1. `9aaece168` -- docs(46-05): record live gate FAIL at Check 3 (minimized window not restored)
2. `d390c6998` -- docs(46-05): record live gate FAIL and fix-forward decision in STATE.md

## Files Created/Modified

- `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-LIVE-GATE.md` -- filled with the operator's observed values for P0 and Checks 1-3, `Verdict: FAIL (first failing: Check 3 ...)`, and a `## Recorded failure` section

## Deviations from Plan

None -- the live-gate FAIL branch is a documented, expected outcome of `46-05-PLAN.md`'s own Task 3, not a deviation. No closure file was touched, matching the plan's explicit ON FAIL instructions.

## Issues Encountered

No authentication gates. No architectural questions. The gate itself surfaced the real defect it exists to catch: a code path (`show()` + `set_focus()` with no `unminimize()`) that every automated check in this project's history could not exercise, because neither the pipe FFI nor the OS window-raise behavior is reachable from `cargo test` on a non-Windows CI runner.

## User Setup Required

None beyond what 46-05-PLAN.md's Task 2 already asked of the operator (running the gate). The 46-06 fix and 46-07 re-gate are separate, later plans.
