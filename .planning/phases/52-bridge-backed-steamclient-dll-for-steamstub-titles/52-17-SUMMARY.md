---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 17
subsystem: steam-bridge
tags: [steamstub, regate, uat, grim-dawn, gap-closure]
requires: [52-13, 52-14, 52-15, 52-16]
provides:
  - "52-UAT.md re-gate items 9-13; items 9-11 scored (9 issue, 10 issue, 11 pass)"
affects: [52-18]
key-files:
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
decisions:
  - "Item 9 scored issue: product path did everything right but Grim Dawn ends in Application Load Error 3"
  - "Item 10 scored issue: IsSteamRunning warning present (count 1), so not bridge-verified"
metrics:
  tasks: 3
  completed: 2026-10-24
---

# Phase 52 Plan 17: Re-gate of Grim Dawn after 52-13..16 Summary

The re-gate did NOT pass. GameLib's product path is clean end to end (not withheld, forwarder placed, registry set, helper HELLO, SteamClient017/014 forwarded natively) and Grim Dawn still fails with Application Load Error 3 and never reaches its main menu. The strict Steam-init check also fails: the IsSteamRunning warning is present.

## Results

- Item 9: issue. All log checks hold (see 52-UAT.md for line numbers). Operator: Load Error 3 on two attempts, no main menu. Operator correction recorded: no "Steam DRM check may fail" notice was shown (earlier "yes" was a misread); this matches the log (no `steamstub-unforwarded` line). Commits 7c0b979fb, 33ed3a56b, 48f6e5da9.
- Item 10: issue. Clone state was product-written (shim 251392 B == SHIM64 and identical to product, forwarder identical, SteamClientDll64 value identical), so the evidence is not harness-flow. 0 `steam://run`, steamclient64.dll loaded, 2 `[S_API]` lines: one `IsSteamRunning() did not locate a running instance of Steam` (count 1) and one `Loaded ... steamclient64.dll OK`. Two `pid` reads precede the warning. Commit dac44b1ed.
- Item 11: pass. User.reg has SteamClientDll64, no pid; 0 HKLM Valve keys; no Steam client files; forwarder identical to the built one; exe sha256 unchanged.
- Items 12 and 13 stay pending for 52-18.

## Handoff for 52-18 Task 3

IsSteamRunning warning FOUND in item 10 (count 1). Item 13 should therefore not be `skipped`; the pid decision is live.

## Caveats and unknowns

- The harness reported alive=yes at 90 s, but that is a pgrep on the process name. The game process's last cxlog line is 7 s into the run (user32 resource loads after winemac.drv loaded), and no operator view of the trace run exists. Whether the trace-run game sat at a dialog is not established. A modal Load Error 3 box would fit, but that is inference.
- The cause of Load Error 3 is unknown. The trace shows SteamStub reaching steamclient64.dll, the helper answering both CreateInterface calls, `Steam_ReleaseThreadLocalMemory` not found in Grim Dawn.exe (cxlog 186295.671), and nothing failing visibly afterwards. The only Steam-state gap visible is the absent ActiveProcess `pid` value.
- Bridge-verified: NOT verified for Grim Dawn (warning present, no game log, In-Game never counts). Never routed to bottled Steam.

## Deviations from Plan

- Item 9 amended after the operator corrected the notice answer (commit 48f6e5da9).
- Task 2 was resolved through the orchestrator; no ELEX or pid work done here.

## Evidence

Session dir /tmp/gamelib-gate-52r-20261024T033525Z (gamelib-relaunch-1.log, round-regate.cxlog, round-regate.helper.log, terminal.log). The helper log contains a SteamID64; it was not pasted anywhere in the repo.

## Self-Check: PASSED
