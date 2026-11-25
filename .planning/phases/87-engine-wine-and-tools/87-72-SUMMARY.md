---
phase: 87-engine-wine-and-tools
plan: 72
subsystem: gap-closure-rf1-diagnosis
tags: [gap-closure, svc-02, rf1, crossover, wineserver, diagnosis, live-gate]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-RERUN-1-HUMAN-UAT.md finding RF1; 87-71's re-run 2 contract"
provides:
  - "the RF1 debug record with the desk side-by-side, the live capture and a named root cause with Fix scope"
  - "two invariant test files for the two CrossOver branches (Rust and TS), all passing at HEAD"
  - "a dated root-cause line on the RF1 todo"
affects: [87-77, 87-79]

actuals:
  tokens: 10700
  tasks: 3
  commits: 2

plan_head_before: a22e593ec90901ee8a256e703efc3eeb1dcc2489
commits: 2
plan_head_after: see the docs(87-72) commit

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/debug/rf1-crossover-launches-exit-within-two-seconds.md
    - src-tauri/crates/gamelib-engine/tests/crossover_launch_shape.rs
    - src/backend/__tests__/launcher.crossoverEnv.test.ts
    - .planning/phases/87-engine-wine-and-tools/87-72-SUMMARY.md
  modified:
    - .planning/todos/pending/2026-11-24-bottled-games-exit-about-one-second-after-the-wine-command.md

key-decisions:
  - "87-72: RF1 is named at the bottle's state at spawn, not at a teardown: the plain cx-healthy branch leaves the wineserver its own demo-status probe started running, the restore branch's switch kills it; confidence medium"
  - "87-72: the fix is recommended in launch/step.rs (inside 87-77's files); the alternatives in decision/preflight.rs and crossover/demo_status.rs are outside them and 87-77 stops before editing either"

requirements-completed: []

duration: about 3h (mostly the operator checkpoint)
completed: 2026-11-25
---

# Phase 87 Plan 72: RF1 diagnosis Summary

RF1 (CrossOver launches started by GameLib exit within 1 to 2 s) is reproduced live on the signed 0.13.1 build and its cause is
named at the bottle's state at spawn: the plain branch hands the launch a wineserver that the launch step's own demo-status
probe started, the restore branch's switch kills it first. Nothing was fixed; no production file changed.

## What was done

1. **Task 1 (commit 392923b0a).** Desk side-by-side of the two branches as invariant tests: 6 Rust cases and 12 TS cases, all
   green at HEAD, so nothing is committed in expected-to-fail form. H1 ruled out at the desk.
2. **Task 2 (operator checkpoint, no commit).** D0 clean with `ditto` copies, D1 GameLib launch reproduced RF1 (no window), D3
   shell replay of the logged command started the game, D4 not approved and not run.
3. **Task 3 (this commit).** `## Live capture`, `## Root cause` and `## Fix scope` in the debug record (status
   `root-cause-named`), and one dated line on the RF1 todo.

## The finding

- Under GameLib the demo-status probe boots the game's bottle (wineboot, wineserver and two winedevice hosts, parent the Rust
  shell, 3.1 s). Nothing stops it on a healthy probe. legendary then spawns its wine child against that warm server, exits in
  under a second, and no wine child, winewrapper or game process ever appears; the server dies 3 s later by its own idle timeout.
- From a shell on a cold bottle the same command starts the game (winewrapper and the game exe up, alive at 29.5 s).
- The restore branch kills the server in `bottles/switch.rs` (`kill_previous`, line 633), which is why the one launch after the
  restore ran normally.
- Refuted by the code: the `launcher-exited` line is `end_engine_launch`'s normal log (`launch/step.rs` line 985); it kills
  nothing, and no code path kills a process group or the bottle when the launcher exits. H2 and H4 are ruled out as causes by
  the re-run 1 launch after the restore, which ran from the same sidecar spawn with the same environment and stdio.

## Confidence and what stays open

Medium. The isolating run was not made (D4 not approved). 87-77's first step is a 2-minute shell run: warm the bottle with
`--demo-status`, replay the D3 command (expected: no window), then `wineserver -k` and replay (expected: window). If the warm
run starts the game the cause is wrong and the status returns to `unresolved`. Also open: whether the warm server fails
because of a sync-mode mismatch (the probe has no `WINEESYNC` / `WINEMSYNC`, the launch sets both; only the reverse direction's
refusal text was found in CrossOver's `ntdll.so`) or because of the DXVK files the restore also rewrites; and the nile line
(`--wine-prefix`, exit code 1) was not replayed.

## Fix scope (for 87-77)

Recommended layer `launch/step.rs` (in 87-77's files): after a healthy preflight on a no-switch branch, stop the bottle's
wineserver through `kill_bottle_wineserver` when `ctx.ledger.other_games_running` is empty. The alternatives
(`decision/preflight.rs`, `crossover/demo_status.rs`) are outside 87-77's `files_modified`. The red-first test is a plain-branch
case in `crossover_launch_shape.rs` asserting an `engine-wineserver-kill` spawn for the game's bottle.

## Deviations from Plan

None - plan executed as written. The verdict is `root-cause-named` with medium confidence rather than a proven cause because
D4 was not approved; the record states what would falsify it.

## Notes

- `commits: 2` counts the commits of this plan by message (Task 1 and this docs commit). The shared working tree also carries
  the concurrent Phase 88.1 session's commits between `plan_head_before` and HEAD, so the `rev-list` count over that range is
  not this plan's.
- No secrets in the committed files: the launch-line and `ps` captures stayed in the runner's scratchpad (they carry an Epic
  exchange code and full args); the record has names, pids, timings and `~` paths only.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Debug record, both test files and this summary exist; `392923b0a` is an ancestor of HEAD; `pnpm planning-gates` 12/12;
the paths written here are prettier-ignored (`.planning`), so no formatter check applies.
