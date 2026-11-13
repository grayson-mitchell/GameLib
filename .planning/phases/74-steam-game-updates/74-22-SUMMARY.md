---
phase: 74-steam-game-updates
plan: 22
subsystem: uat
tags: [uat, steam, updates, live-gate]
requires: [74-21]
provides:
  - Live results for UAT items 16-18 recorded in 74-UAT.md
  - Three new UAT gaps and five pending todos
affects: [REQUIREMENTS.md]
key-files:
  modified:
    - .planning/phases/74-steam-game-updates/74-UAT.md
  created:
    - .planning/todos/pending/2026-11-13-launch-prompt-esc-does-not-dismiss.md
    - .planning/todos/pending/2026-11-13-depot-job-event-ipc-invalid-union.md
    - .planning/todos/pending/2026-11-13-update-button-flash-before-badge-clears.md
    - .planning/todos/pending/2026-11-13-bridge-shim-steaminventory-v003-export-missing.md
    - .planning/todos/pending/2026-11-13-bridge-shim-remotestorage-v008-unservable.md
decisions:
  - STEAM-02 left Pending; /gsd-verify-work owns closing it
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Phase 74 Plan 22: Live re-run of UAT 7, 12 and WR-01 Summary

Live re-run recorded: item 16 issue (partial, Esc gap), item 17 pass, item 18 pass for DLC retention with the launch bridge-unverified. UAT is complete at 13 pass, 3 issue, 2 skipped, 0 pending.

## Commits

- 6d80d0fde: docs(74-22): append live re-run items 16-18 to 74-UAT (Task 1)
- Task 2 results and this summary are in the closing docs commit.

## Results

- Item 16 (Core Keeper): single native box, Don't ask again, Update now pass. Esc on the native box fails (beep, box stays; no cancel key equivalent on the 74-14 box). Play anyway launched but the game crashed at Steam init (`SteamAPI_SteamInventory_v003`, pre-existing shim gap). Step 6 skipped (0-byte induced update).
- Item 17 (ADOM, InstallApp): pass; badge cleared within about 2 s. Update button flash noted as polish.
- Item 18 (Dungeons of Dredmor): pass, 2 depots, `retired=[] kept=[]`, file list identical (9262 files). Launch bridge-unverified (shim withheld, RemoteStorage v008 gap).

Context: quick 261113-n39 fixed the Nov 10 Mac Steam SteamUser_v023 removal first (helper probes newest-first, live v024).

## Deviations from Plan

None. No code was changed.

## Known Stubs

None.

## Next

STEAM-02 stays Pending for /gsd-verify-work. Open gaps are in 74-UAT.md Gaps and the five new 2026-11-13 todos.
