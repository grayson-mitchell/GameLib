---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 12
subsystem: steam-bridge
tags: [live-gate, uat, steamstub, grim-dawn]
requires: [52-11]
provides:
  - "52-UAT items 6-8 scored: all issue; UAT status diagnosed with 4 gaps"
affects: [52-UAT.md, forwarding todo]
key-files:
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
    - .planning/todos/pending/2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md
decisions:
  - "Both Phase 52 todos stay in pending/ because items 6-8 did not pass"
metrics:
  completed: 2026-10-24
---

# Phase 52 Plan 12: Done-when gate Summary

The done-when gate FAILED: Grim Dawn launched from the packaged GameLib never reaches the forwarding
path, because the quick 261024-j4l withhold guard direct-launches it and it exits after 2 s.

## Outcome

- Item 6: issue. Operator: "grim dawn not launching, failing silently" (main menu NO, In-Game NO).
  Three Play attempts in `gamelib-launch-1.log` each logged `withheld the shim` (unservable
  SteamUser023, SteamNetworking006, STEAMREMOTESTORAGE_INTERFACE_VERSION016), a direct bottle launch,
  and `gone after 2s of play`. No `drmWrapper=steamstub`, forwarder, HELLO/FWD or notice.
- Item 7: issue. `MODE=trace WATCH=90` on a fresh clone: `steam://run` count 4, game not alive at 90 s.
  The scratch harness bypasses `placeShimForGame`'s withhold guard, so even a pass would not have
  covered the product launch path.
- Item 8: issue. Hygiene is clean (no Valve keys in system.reg, no Steam client, exe sha256 unchanged
  `d3915e25...c4`) but `ActiveProcess` has no `SteamClientDll64` (setup never ran) and the product
  `x64/steam_api64.dll` is still the stale 223744-byte shim (SHIM64 242688).
- UAT frontmatter `status: diagnosed`; four Gaps recorded (withhold preempts SteamStub forwarding;
  silent failure with no drmWrapper/notice; misleading "game's own steam_api" log; stale shim not
  refreshed on the withheld path). The forwarding todo got the evidence appended; both todos remain
  in pending/. Suggested next step: `/gsd-plan-phase 52 --gaps`.

## Deviations from Plan

None to code. Notes:
- `pnpm tauri:dev:packaged` exited 1 on updater signing (no `TAURI_SIGNING_PRIVATE_KEY`); the binary
  was launched directly. Not a product defect.
- The x64 todo was left untouched; it is not claimed that 52-07 shipped the five `SteamInternal_*`
  exports (they pre-existed from quick 261024-i94; 52-07 added `GameLibBridge_CreateInterface`).
- Task 2 (checkpoint) was answered by the operator; GameLib quit verified with pgrep (no
  gamelib-shell, no 219990 helper) before item 7.

## Closing inventory

Session `/tmp/gamelib-gate-52-20261024T015232Z` (58808 lines total): terminal.log 421, gamelib-launch-1.log
246, round-0/1/trace cxlog 23750/10416/23747, helper logs 5/8/5, archives of the pre-launch
gamelib.log. Full listing appended to terminal.log under `=== 52-12 CLOSING INVENTORY ===`.

## Known Stubs

None. `pnpm planning-gates`: 12/12 passed.

## Self-Check: PASSED
