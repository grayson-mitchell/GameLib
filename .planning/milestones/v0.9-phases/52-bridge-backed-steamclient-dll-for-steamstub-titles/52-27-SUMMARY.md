---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 27
subsystem: steam-bridge
tags: [gap-closure, live-gate, steamstub, regate3, strict-bridge-verified]
requires: [52-26]
provides:
  - "52-UAT items 23-25 scored (23 issue, 24 issue, 25 pass); item 26 pending for 52-28"
affects: [52-28]
key-files:
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
requirements-completed: []
completed: 2026-10-24
---

# Phase 52 Plan 27: Re-gate 3 Summary

The 52-26 VS_VERSIONINFO forwarder did not clear the SteamStub failure: Grim Dawn still shows an Application Load Error from the packaged build, so the done-when is NOT met and bridge-verified is NOT achieved.

## Results

- Item 23 `issue`: every log check passed (`drmWrapper=steamstub`, `forwarder placed`, HELLO, FWD SteamClient017/014 native=present, no withheld, no steamstub-unforwarded; product forwarder `cmp` identical to the 187392 B build with the GameLib resource directory), but the game ended after 37 s and the operator saw an Application Load Error and no launch. Operator words recorded verbatim in the item. Dialog full text is not recoverable (no +relay, so no MessageBoxA line in the trace); main menu "no" is operator-reported; In-Game and cleared are not reported by the operator (game never launched; stated as inference).
- Item 24 `issue` (product-state, clone assertions all passed): HELLO 1, `Loaded ... steamclient64.dll OK.` present, failing `[S_API]` lines 0, but IsSteamRunning 1, MSGBOX 1, alive at 90 s no, `steam://run` 0. Not unverified, not verified.
- Item 25 `pass`: HKCU only, no pid, 0 HKLM Valve keys, no steam.exe or steamclient*.dll in the Steam root, forwarder identical to the build and unlike the genuine DLL, exe sha256 equals the preflight.
- Item 26 left `pending`. 52-26 touched only the forwarder .rc and meta build files, so 52-28 should record it `skipped — change limited to the forwarder`.

Session dir: /tmp/gamelib-gate-52t-20261024T070522Z (gamelib-regate3-1.log, round-regate3.cxlog, terminal.log).

## For 52-28

- Item 24 was not clean (IsSteamRunning 1, MSGBOX 1, dead before 90 s).
- Friends: operator said "logged out of friends", then "was able to login to friends and be online". Log line 58 shows `LogonSessionReplaced` from steam-user at Play. The pending todo `.planning/todos/pending/2026-10-24-friends-sign-out-steam-user-logon.md` already exists; this is a recovered sign-out. No todo was created or edited here.
- The wineserver note: the operator did not confirm quitting GameLib; the executor stopped the gate's own gamelib-shell pid 80846 (SIGTERM) and ran `wineserver -k`.

## Deviations from Plan

None in code. Task 2 answers arrived in two operator messages (a follow-up added main menu "no" and the dialog text "application load error"); both recorded verbatim.

## Self-Check: PASSED

UAT edit committed (af513901b); Task 1 commit 76e1dfb55 exists; no gamelib-shell, helper or wineserver left running.
