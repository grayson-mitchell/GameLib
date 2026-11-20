---
phase: quick-261118-uma
plan: 01
subsystem: steam
tags: [macos, steam, restart-on-play, running-game, process-table]
requires: []
provides:
  - Mac running-game signal for the Steam restart refusal, read from the process table
affects: [phase-81 UAT item 5, Restart Steam now, uninstall refusal on macOS]
key-files:
  modified:
    - src-tauri/crates/gamelib-steampoll/src/running_scan.rs
    - src-tauri/crates/gamelib-steampoll/src/running.rs
    - src-tauri/crates/gamelib-steampoll/src/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/tests/running_scan.rs
    - src/backend/storeManagers/steam/library/runningPoll.ts
    - src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts
decisions:
  - On darwin the running game is read from the process table, since Mac registry.vdf carries no RunningAppID; Windows/Linux keep RunningAppID.
status: complete
actuals:
  tokens: 110000
  tasks: 3
  commits: 3
plan_head_before: dfee3ad417251729d9da408c06b8db0a5d3d15bb
plan_head_after: e70d022f38408ca22ac50ac6aacaa62e10a59cbe
completed: 2026-11-18
---

# Phase quick-261118-uma Plan 01: Mac running-game signal for restart-on-Play Summary

The Mac restart refusal now sees a game running in Steam by scanning the process table, so Play on a pending game no longer restarts Steam under a running game (phase 81 item 5).

## Commits

- `41f68fc03` fix: read the running Mac Steam game from the process table
- `e70d022f3` test: pin the Mac running-game scan contract and the restart refusal seam
- `commits: 3` is the measured range count. It includes `baa7ebce8` (docs todo), made by a concurrent session in the same range; the plan itself made 2.

## Tasks

1. Rust scan and dispatch (red-first: the dispatch test answered 0 against an expected 4242 before the implementation). Clippy ratchet PASS after fixing two `cloned_ref_to_slice_refs`; cargo fmt clean.
2. Tests: 14 Rust cases and 2 jest cases green on first run; jest macSteamAdoption 65 passed.
3. Live check on the Mac: APPROVED by the operator on 2026-11-18.

## Live check evidence (Claude-read)

- Avadon 112100 running from Steam; pending game 211820 freshly installed.
- Play on 211820: in-app notice "Quit the game running in Steam..." shown; steam_osx pid 34894 unchanged throughout; gamelib.log 22:32:58 `[Steam] not restarting Steam for 211820: game 112100 is running` and `SteamGame: Play for 211820 not launched (game-running); pending adoption kept`; no `fired steam://exit` for 211820.
- "Restart Steam now": refused (log 22:33:54, same not-restarting line), pid unchanged.
- Notice's "Launch without Steam" pressed twice quickly: game started once (log 22:34:15 `launch without Steam for appId 211820 carries warning steam-api`); 211820 still pending afterwards.
- The Bastion relative-argv case was not run live; the dispatch test covers it with a relative argv0.

## Deviations from Plan

None - plan executed as written (clippy fix noted above was within Task 1).

## Known Stubs

None.

## Self-Check: PASSED

Both task commits are ancestors of HEAD; the SUMMARY was written from measured range data.
