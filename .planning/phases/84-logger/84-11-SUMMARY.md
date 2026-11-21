---
phase: 84-logger
plan: 11
subsystem: infra
tags: [logger, live-gate, macos, uat, checkpoint]
status: partial

requires:
  - phase: 84-logger
    provides: "the live macOS gate contract (84-01) and the code under test (84-02..84-09)"
provides:
  - "84-HUMAN-UAT.md scored on the operator's Mac: pre-run re-check, eight results (7 pass, 1 issue), capture notes, run-time Test 5 count, capture inventory"
  - "two contract defects found by the run, routed to gap closure: item 4's runner-header premise and item 7's crate-origin grep rule"
affects: [84-gaps]

actuals:
  tokens: 40000
  tasks: 3
  commits: 6
plan_head_before: 390eefcadb132b4f527a79911419b400eea2d688
plan_head_after: d72ac7b858c219c5cafe57eff8f54d7f20da9898

key-files:
  created: []
  modified:
    - .planning/phases/84-logger/84-HUMAN-UAT.md

decisions:
  - "Item 4 is scored issue, not pass: its `launch.log starts with the runner's header line (Wine Command:)` clause is unmet on a GOG launch, though the writer behaviour it exists to prove is verified"
  - "Item 7 is scored pass on the contract's stated purpose (not a TS logDebug); its literal grep rule is recorded as a defect to amend"
  - "Launch 2 is scored although no up-time instance count was recorded: every count taken was 1, so the contract's abort rule does not fire; the weakness is recorded in the UAT"
---

# Phase 84 Plan 11: Live macOS gate for the logger Summary

The Phase 84 live gate was run on the operator's Mac and scored: 7 of 8 items pass, and item 4 is an `issue` on one
contract clause (the runner header), with the native writer's own behaviour on that item verified.

`commits` above is measured from the ledger (`plan_head_before..HEAD`) and includes four commits by other sessions that
landed on main during this plan (`f6dd52154`, `baf9062c7`, `02edda1d9`, `bbba3183d`); this plan's own task commits are
`f93e87579` (Task 1) and `d72ac7b85` (Task 3), and the final docs commit follows this SUMMARY. Task 2 was the operator's
run and has no commit.

## What was done

- **Task 1 (tracer), commit `f93e87579`:** every Required literal re-grepped against source with its emitter file:line
  and sink; none IMPOSSIBLE. Preflight P1-P3 and P7 recorded. Recorded, not fixed: the item 8 order note (the code logs
  `exit finished in` before `still running at exit deadline:`; never triggered, see below).
- **Task 2 (checkpoint):** the operator drove four launches while the executor captured. Operator observations:
  Finder selected `gamelib.log` (item 5), the upload dialog showed a dpaste.com URL and "Show uploaded log files" listed
  the Balrum entry (item 6).
- **Task 3, commit `d72ac7b85`:** scored all eight items from the captures into `84-HUMAN-UAT.md`, added the
  Capture-procedure notes, the run-time Test 5 count and the closing inventory, set the Summary counters, then deleted the
  session dir's log copies.

## Results

| Item | Result | Evidence in one line |
|---|---|---|
| 1 shell lines in `gamelib.log`, `gamelib-shell.log` untouched | pass | `[Shell]` reaper line pid 51705 equals `reaper-pid-1.txt` and the transcript; shell log `1795246522 1348615` equals baseline |
| 2 TS lines keep the format | pass | `System facts:` line in all four archives; `lines dropped` and `log frame rejected` 0 everywhere |
| 3 rotation once per launch, mode 600 | pass | launch 1 archive byte-equal to launch 2's `.old`; mode 600 |
| 4 game transcript by the native writer | **issue** | two `Logging to file(s)` lines, End of log, `launch.log.old` byte-equal, no drops; but no runner header and no `Wine Command:` |
| 5 show in folder | pass | operator observation only |
| 6 upload and uploaded list | pass | dpaste.com, entry `Game log of Balrum`, 1 entry (baseline 0) in 2-space JSON, `[LogUploader]` line |
| 7 crate diagnostics | pass | 120 steam-vent DEBUG lines plus http-stack `[Backend]` lines in launch 3, 0 in launch 4, with the Refresh run in both |
| 8 exit lines | pass | `exit finished in 51 ms` in all four archives, no deadline line anywhere |

## Deviations from Plan

None to the plan's tasks. The findings below are plan-external and are reported, not fixed (the plan forbids fixes).

### Findings routed to `/gsd-plan-phase 84 --gaps`

1. **Item 4 header premise.** `Wine Command:` is written only by `runWineCommand` callers that pass `logWriters`
   (`src/backend/commandRunner.ts:342`). A GOG launch goes through `runRunnerCommand`
   (`src/backend/storeManagers/gog/games.ts:938`) and never writes it; `Wine Command:` is in no log under
   `~/Library/Logs/GameLib` on this Mac, including pre-84 launch logs, so this is not a Phase 84 regression. The contract
   (and P4) assumed a Wine launch writes it. Fix is a contract amendment: name the header the runner really writes, or
   choose a path that writes `Wine Command:`.
2. **Item 7 crate-origin rule.** "Message text found by no `grep -rnF` over `src/backend`" misclassifies TS `logDebug`
   lines built from a template literal (`[steampoll|steamfiles|steamcm] rust ${channel}`,
   `rustSteamPoll.ts:24`, `rustSteamFiles.ts:19`, `rustSteamCm.ts:24`) as crate-origin; read literally, launch 4 (39 such
   lines) would fail the absence clause. Scored pass on the clause's stated purpose ("not a TS logDebug"), with the
   literal-rule hits recorded. The amendment should exclude those three templates or compare against an emitter list.
3. **Item 8 order note (latent, not triggered).** The code logs `exit finished in` before the deadline line, the reverse
   of item 8's wording. No launch had a deadline line, so nothing was scored on it. It remains a contradiction if a drain
   ever overruns.

### Capture-procedure notes (recorded in the UAT; no score changed)

- Launch 1 needed three attempts (`pre 1` ran three times; the first attempt's `up 1` failed because `$G` was unset in the
  second tab). The scored launch 1 is the last one (shell 51625, reaper 51705).
- Launch 2 has no up-time instance count (`$G up 2` was not run; there is no `shell-pid-2.txt` or `reaper-pid-2.txt`). The
  contract's abort rule fires only if a count is not 1; none was. Items 3, 5, 6 and the writer half of item 4 rest on that
  plus indirect evidence (one `reaper started` and one `System facts:` line in the launch 2 archive, no second rotation).
  This is a weakness in the capture, not a clean assertion.
- The `Verbose logs` setting for P4 was assumed ON and confirmed from the captured content, not from the UI.

## Not done / owed

- Live-mode `pnpm smoke:exit-check` is recorded by 84-10 as owed to 84-11, but 84-11's tasks do not include it and it was
  not run. It stays open.
- Nothing was pushed (the 84-10 push hold stands).
- FND-05 was not marked complete: `requirements.ready-ids` returned no ready ids for it and item 4 is an issue.

## Known Stubs

None (no code was written; this plan edits one planning artifact).

## Threat Flags

None. T-84-33: the upload recorded only the URL host and entry name, never content. T-84-34: the session dir's log copies
(which hold user paths) were deleted after the counts were copied; `notes.txt` and the pid files remain in the scratchpad
session dir (pids, literals and counts only).

## Self-Check: PASSED

- `.planning/phases/84-logger/84-HUMAN-UAT.md` modified; `parseUatItemsWithStats` reports `headingsSeen: 0`, no
  `result: pending`, `total: 8` with 7 passed and 1 issue, `pnpm planning-gates` 12/12 passed.
- Commits `f93e87579` and `d72ac7b85` are ancestors of HEAD.
