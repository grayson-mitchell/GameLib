---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 20
subsystem: steam-adoption-live-gate
status: halted
tags: [steam, live-gate, uat, restart-on-play, macos]
requires: [81-19]
provides:
  - Mac results for items 1-9 and 12 of 81-HUMAN-UAT.md (7 pass, 1 issue, 1 blocked)
  - six pending todos for the issues the gate found
affects: [81 verifier, /gsd-verify-work]
tech-stack:
  added: []
  patterns: [per-item result lines open with a status word and name the launch ordinal]
key-files:
  created:
    - .planning/todos/pending/2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md
    - .planning/todos/pending/2026-11-18-adoption-note-restart-steam-now-button-placement.md
    - .planning/todos/pending/2026-11-18-adoption-note-restart-flash-at-install-end.md
    - .planning/todos/pending/2026-11-18-depot-install-misses-exec-bit-on-shell-script-launchers.md
    - .planning/todos/pending/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md
    - .planning/todos/pending/2026-11-18-mac-uninstall-notification-not-seen-dev-build.md
  modified:
    - .planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-HUMAN-UAT.md
    - .planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/deferred-items.md
decisions:
  - "Plan status is halted, not complete: the operator ran only the Mac part; items 10 (Windows 11) and 11 (Linux) stay pending and the UAT file is status partial. Re-summarize as complete after those two items are recorded."
  - "Item 5 is an issue (D-05 refusal unreachable on Mac): Mac registry.vdf carries no RunningAppID, so the restart refusal never fires and Steam is quit under a running game"
  - "Item 12 recorded blocked (1026 edge not reproduced); the gap stays in deferred-items.md (orchestrator note after 81-08) and no duplicate todo was filed"
  - "The uninstall notification miss (item 9) is filed as a minor macOS investigation todo rather than left in prose, because the contract's expected text names the notification"
metrics:
  duration: 2h28m (preflight 19:30 NZDT to results 21:59 NZDT, mostly the operator's live run)
  tasks: 3 (Task 2 partly: Mac done, Windows and Linux deferred)
  files: 8
  completed: 2026-11-18
commits: 6
plan_head_before: 904faf710d28f3f6b528372e85aafc53855585e2
plan_head_after: e19c93725e8b817cfb265cf8a74d0d877b08e03e
actuals:
  tokens: 11600
  tasks: 3
  commits: 6
---

# Phase 81 Plan 20: The live gate (Mac part) Summary

**On real Mac Steam, restart-on-Play, the 112100 sign-in case, Restart Steam now, the hold migration, InstallApp and the unadopted uninstall all passed. The D-05 refusal cannot be reached on Mac, because Mac Steam's registry.vdf carries no RunningAppID. Windows and Linux are not run yet.**

## Results (81-HUMAN-UAT.md)

| Item | Result | Launch | Note |
| ---- | ------ | ------ | ---- |
| 1 helper in three states | pass | none | loggedOn 1/state 4, loggedOn 0, `unavailable`/`steam-not-running`; no SteamID in any capture |
| 2 restart-on-Play | pass | L1 | 112100; Steam pid changed once; `fired steam://exit` + `Steam exited after 2605 ms` |
| 3 112100 case (sign-in, same pid) | pass | L2 | played with Bastion 107100; note cleared 1-2 s after sign-in, `adopted (helper)`, same pid, no InstallApp line |
| 4 Restart Steam now | pass | L2 | 203830; Steam alone relaunched, state 4, record gone |
| 5 refused restart + Launch without Steam | **issue** | L1 | Steam restarted under running 112100; no refusal line |
| 6 boot migration | pass | L2 | `migrated` + `acf-gone`, hold file deleted |
| 7 InstallApp ON + sign-in fallback | pass | L2 | 763890 via InstallApp; 40700 `library-lookup-unverified`, then adopted (helper) |
| 8 three themes | pass | L1 | midnightMirage, gruvbox_dark, dracula |
| 9 unadopted uninstall | pass | L2 | about 3 s, no hang, record gone; notification not seen |
| 10 Windows 11 | pending | none | operator deferred to a later session |
| 11 Linux | pending | none | operator deferred to a later session |
| 12 1026 edge (known gap) | blocked | none | edge not reproduced; gap stays in deferred-items.md |

The closing inventory of the session directory (`/tmp/gamelib-gate-20261118T063108Z`, 11 files, none zero-length) is in item 12's result. `terminal.log` begins at `=== GATE LAUNCH 2`: L1's terminal transcript was not captured. No L1 item scores a terminal line, so no verdict depends on it.

## Todos filed

| Todo | severity / platform / ready | From |
| ---- | --------------------------- | ---- |
| `2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md` | major / macos / live-gate | item 5 |
| `2026-11-18-adoption-note-restart-steam-now-button-placement.md` | minor / any / human | items 2, 4 (review D-02) |
| `2026-11-18-adoption-note-restart-flash-at-install-end.md` | minor / macos / live-gate | item 7a, 7b |
| `2026-11-18-depot-install-misses-exec-bit-on-shell-script-launchers.md` | major / macos / code | item 3 (outside phase 81) |
| `2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md` | minor / macos / live-gate | item 3 |
| `2026-11-18-mac-uninstall-notification-not-seen-dev-build.md` | minor / macos / live-gate | item 9 |

The log points to a narrower cause for the launch-watch todo than the brief described. The 21:28:04 Play hit `already-watching` on the 21:26:50 watch, and `noteRelaunch()` extended that watch's start window. The watch then ended at 21:29:36 with `no process within start window` while Bastion was running. So the watch existed, but it never matched the script-launched processes.

## Task commits

- Task 1 (preflight, item 1a): `fc8deb410`
- Task 2 (operator live run, Mac part): no commit (evidence stays in /tmp)
- Task 3 (results and todos): `e19c93725`

`commits: 6` is measured with `git rev-list --count 904faf710..HEAD`. Four of the six are phase 47 commits that another session made on main during the run (`3bdcd2dc7`, `71dae5aa3`, `a9756cb70`, `145a16d5b`). This plan made 2 of them, plus the metadata commit that comes after this file.

## Deviations from Plan

- **Task 2 partly run (operator choice).** The plan expects Windows 11 (item 10) and Linux (item 11) in this plan. The operator ran the Mac part and deferred the other two. Because of that, Task 3's automated verify cannot pass as written: `^result: pending` counts 2 (expected 0), and the status-word results count 10 (expected at least 11). Its other checks pass: audit-uat parses `81-HUMAN-UAT.md` with no parse gap (`parse_gap_files: 0`) and the todo-frontmatter gate passes. Plan status is `halted` and UAT status is `partial` until items 10 and 11 are recorded.
- **`pnpm planning-gates` is 11/12, and this plan did not cause the failure.** `34.5-.../preload-surface-gate.py` fails on four preload channels that are missing from `IPC-PORT-INVENTORY.md`: `steamLaunchWithoutSteamOnce` (added by 81-07, `acbc27eb8`), and `steamAdoptionStatus`, `steamAdoptionRestartNow` and `steamAdoptionOpenSteam` (added by 81-08, `a1fb01883`). This plan wrote only planning files, so the failure is not in a file it wrote. It is recorded in `deferred-items.md` for the verifier. The fix is one bucket line per channel in the inventory.
- **Item 1(c)**: the operator observed the `unavailable`/`steam-not-running` line, but it was not appended to `helper.log`. The result says so.

## Not filed as a todo

- Item 12's 1026-edge gap already lives in `deferred-items.md` and is routed to the verifier, so it is linked there rather than duplicated.

## Threat model

T-81-46 holds. No SteamID, account name or user path appears in any committed file: a grep for `7656119[0-9]{10}` and `/Users/` over the UAT file and the new todos returns 0 matches. Captures stay in `/tmp`.

## Self-Check: PASSED

- FOUND: the six todo files, `81-HUMAN-UAT.md`, `deferred-items.md`
- FOUND: commits `fc8deb410`, `e19c93725` on HEAD
- `.planning` is prettier-ignored (`--file-info` reports `"ignored": true`), so no prettier check applies to these files
