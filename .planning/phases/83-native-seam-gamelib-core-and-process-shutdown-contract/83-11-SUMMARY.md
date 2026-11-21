---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 11
subsystem: testing
tags: [live-gate, macos, reaper, force-quit, graceful-quit, uat, fnd-03, fnd-04]

requires:
  - phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
    provides: the 83-01 live gate contract and the reaper (83-07/83-08), exit deadline (83-09) and native channels (83-03/83-06) it exercises
provides:
  - the live macOS gate scored on real hardware with per-item evidence (3 pass, 2 issues)
  - the pre-run re-check of every required literal, which found and withdrew an unobservable one
  - a recorded capture-deviation list, the Test 5 run-time count and the closing inventory
affects: [83-gap-closure, 88-launch-port, 95-bridge-slices]

actuals:
  tokens: 8257
  tasks: 3
  commits: 4
plan_head_before: 33b4b5e02126d37daf13e49dd4ec4d34afcfdc63
plan_head_after: b7ef2855ba3f76365d6c4662d8aba6eeeb2a329f

tech-stack:
  added: []
  patterns:
    - "an absence check is scored only against a literal whose emitter and sink were re-grepped REACHABLE; an IMPOSSIBLE literal stops the run"

key-files:
  created:
    - .planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-11-SUMMARY.md
  modified:
    - .planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-HUMAN-UAT.md

key-decisions:
  - "Scored strictly: an item whose expected text is not fully met is `issue`, even where the behaviour under test was observed working (items 1 and 3)"
  - "Item 4 passes on a mid-run ACF copy rather than the before copy, because the operator's manual pause had already written StateFlags 1026"

patterns-established: []

requirements-completed: []

duration: not measured (the live run was operator-driven, UTC 03:17-03:44, plus scoring)
completed: 2026-11-21
status: complete
---

# Phase 83 Plan 11: Live macOS gate run Summary

**The live macOS gate was run and scored: Force Quit leaves no helper and the steam:// game survives (reaper signalled the group), the reaper is invisible, graceful quit finalizes the depot ACF and exits in 51 ms; two items are issues (item 1 did not exercise the watchdog/nettop monitor and its after snapshot was about 6 s, not 5 s; item 3 lacks two recorded observations).**

## Performance

- **Live run:** operator-driven, UTC 03:17-03:44 on 2026-11-21 (session dir `/tmp/gamelib-gate-2026-11-21T03:17:11Z`)
- **Tasks:** 3 (Task 1 pre-run re-check, Task 2 operator live run, Task 3 scoring)
- **Files modified:** 1 (`83-HUMAN-UAT.md`) plus this summary

## Accomplishments

- Task 1 re-checked all nine required literals against source; `[GAMELIB_IPC_INVALID_CHANNEL]` was IMPOSSIBLE (only ever returned to the renderer), the run stopped, and the operator-approved amendment replaced it with `[sidecarRpc] IPC_INVALID_ARGS` and `[shell] relay rejected send:` (both REACHABLE).
- Scored the five items in convention-4 shape: items 2, 4, 5 `pass`; items 1 and 3 `issue`. Summary counters 5 / 3 / 2 / 0 / 0 / 0; frontmatter `status: partial`.
- Recorded the capture deviations, the Test 5 run-time count (2: one pre-run, one during the run), the D-15 note and the closing `ls -la` / `wc -l` inventory in a new "Live run record" section; wrote gaps G-83-11-1 and G-83-11-2.

## Per-item verdicts

| Item | Verdict | Basis |
|---|---|---|
| 1 Force Quit with a game running | issue | Reaper line `[reaper] parent gone: signalled 1 group(s)`, sidecar group gone, steam:// WazHack (pid 29900, ppid 1) alive. Not met: no `gamelib-watchdog`/nettop existed (GameLib Install took the native depot path), and the after snapshot was about 6 s after the kill, not within 5 s |
| 2 Reaper runs, own pgroup, invisible | pass | One reaper 14537, ppid = shell 14491, pgid differs; `reaper started` in transcript and shell log, `reaper unavailable:` 0 in both; Dock / Cmd-Tab / Force Quit one entry each (A3 settled) |
| 3 Native channels | issue | About 0.8.0 = package.json, MT notice shown, link opened the browser (GitHub sign-in redirect), language restored, absence counts 0/0/0; not recorded: nav shell version comparison and the pre-redirect URL |
| 4 Graceful quit during depot download | pass | Cmd+Q with a running native depot install, confirm accepted, nothing left; `[reaper] disarmed`, `exit finished in 51 ms`; ACF rewritten at quit (LastUpdated 03:43:05Z to 03:43:55Z, SizeOnDisk grew) discriminates despite the manual pause's earlier 1026 |
| 5 One exit deadline | pass | `exit finished in 51 ms` (at most 5000), `still running at exit deadline:` absent with the positive line in the same section |

## Task Commits

1. **Task 1: pre-run re-check** - `bd11d55a7` (test)
2. **Amendment (operator-approved): item 3 absence literals** - `4f7d54a22` (docs)
3. **Task 2: operator live run** - no commit (captures stay in `/tmp`)
4. **Task 3: score the items, close the inventory** - `b7ef2855b` (test)

**Plan metadata:** the commit that adds this summary.

`commits: 4` counts this plan's own commits by subject (`bd11d55a7`, `4f7d54a22`, `b7ef2855b`, and the summary commit). The ledger range `plan_head_before..HEAD` is larger (10 at scoring time) because unrelated commits from other work landed on `main` during the run; `plan_head_after` is the last task commit.

## Deviations from Plan

### Capture deviations (T-83-38, recorded in `83-HUMAN-UAT.md` "Live run record")

1. **D1** The `=== GATE LAUNCH 1` delimiter was written after the window appeared (labelled late).
2. **D2** Launch 2 was not tee'd into `terminal.log`. Its output was tee'd into a misnamed file `terminal.log.` (trailing dot). I found it while verifying the orchestrator's account; it holds `reaper started (pid 32173)`, `[reaper] disarmed` and `exit finished in 51 ms`. The orchestrator's brief said `[reaper] disarmed` was only operator-relayed; it is in a captured sink, in a file whose name breaks the dual-sink standard.
3. **D3** Launch 2's single-instance check was a `pgrep` during the run, not a recorded post-window assertion; teardown pid records are ps snapshots, not transcript echoes.
4. **D4** Item 1's after snapshot is about 6 s after the SIGKILL (`kill -9; sleep 6; snap`), against the contract's 5 s.
5. **D5** A first P2 FAIL (stale instance 32369/32543) was closed by the operator quitting it.

### Auto-fixed issues

None. No fixes were in scope for this plan.

### Findings the orchestrator should know

- The orchestrator's brief said the nettop/watchdog were "never present" and I verified it: the only text matches in the snapshots are the operator's own shell command line, not processes.
- The orchestrator's brief asked to judge item 5 against `[reaper] disarmed`; that literal belongs to item 4. Item 5's expected text is only `exit finished in` and the absence of `still running at exit deadline:`, both in the archived shell log, so item 5 is scored from the shell log alone.
- Operator feedback, out of scope and not actioned: the "Report a translation problem" link should go to GameLib's own issue form, not GitHub (the orchestrator will file a todo).

## Test 5 run-time count

Structural impossibilities met: 2 (1 pre-run, `[GAMELIB_IPC_INVALID_CHANNEL]`, amended; 1 during the run, item 1's watchdog/nettop sub-check was unreachable as the P4 recipe is written on this build). Unresolved requirement interactions found during the run: 0 beyond that one.

## D-15 note

Observed behaviour matches it for the half that was exercised (the steam:// game survived the SIGKILL while the reaper signalled the sidecar's group). The TS-launched-game-dies half was not exercised.

## Issues Encountered

Two items scored `issue` (G-83-11-1, G-83-11-2 in `83-HUMAN-UAT.md` Gaps); both are recipe or recording gaps, not observed defects in the reaper or the native channels.

## Known Stubs

None.

## Threat Flags

None. T-83-37: results record counts, pids, process names, literals and app ids only; the ps snapshots and logs hold user paths and stay at `/tmp/gamelib-gate-2026-11-21T03:17:11Z` until reboot (gap closure may need them), uncommitted.

## Next Phase Readiness

FND-04's live leg holds for the reaper, the exit deadline and the graceful-quit ACF, but item 1 is an issue, so the plan does not mark FND-03/FND-04 complete; `requirements-completed` is empty and STATE.md/ROADMAP.md are left to the orchestrator. Gap closure for items 1 and 3 is a short re-observation, not a code fix.

## Self-Check: PASSED

- FOUND: `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-HUMAN-UAT.md`
- FOUND commits `bd11d55a7`, `4f7d54a22`, `b7ef2855b` (ancestors of HEAD)
- Task 3 verify block exits 0: `headingsSeen` 0, no `result: pending`, `total: 5`
