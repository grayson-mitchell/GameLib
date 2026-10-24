---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 11
subsystem: live-gate
tags: [steamstub, bridge, live-gate, discovery]
requires: [52-10]
provides: ["52-UAT items 1-5 results", "pass candidate on round 1"]
affects: [52-12]
key-files:
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
decisions:
  - "Item 5 recorded as skipped: pid was read but no fallback followed (judgement call, flagged for 52-12)"
metrics:
  tasks: 3
  completed: 2026-10-24
---

# Phase 52 Plan 11: Discovery rounds Summary

Round 0 proved the cx-log channel shows the SteamStub fallback, and round 1 (first real forwarded run in a scratch clone) was already a pass candidate with no code change.

## Results

- Session: `/tmp/gamelib-gate-52-20261024T015232Z/` (terminal.log has two `=== GATE ROUND` delimiters; full captures stay there).
- Preflight: SHIM64 = 242688, steamclient64.dll = 186368; product bottle x64 steam_api64.dll = 223744 (stale, as expected); Grim Dawn.exe sha256 `d3915e2599317b6670cc088ba958afb2b2f4fa8141cfd1d777ee02f9ea1fc4c4`; ActiveProcess count in user.reg 0; Valve keys in system.reg 0; no steam.exe in the bottle. No gamelib-shell or 219990 helper running; build artifacts (14:42) current for HEAD (only docs commits since).
- Round 0 (REG=0): LISTEN + SteamAPI ready; cxlog `steam://run/219990` x4; game exited. Item 1 pass.
- Round 1 (REG=1, WATCH=60): HELLO, `FWD CreateInterface SteamClient017` and `SteamClient014` both `native=present`; `steam://run` 0; steamclient64.dll loaded; no `No implementation for` lines; alive at 60 s. Item 2 pass (pass candidate). No protocol (a)-(f) change fired. Items 3-4 skipped.
- Item 5: the stub queried ActiveProcess `pid` twice (value absent) but did not exit or fall back; it proceeded to SteamClientDll64. Recorded as skipped; no pid writer built.

## Deviations from Plan

None to code: no source files changed, no rounds 2-3, no todo needed. Native dylib `nm` check was not needed (no unresolved FWD).

## Judgement call to review

Task 3's skip condition says to skip when no round shows a pid read "before its exit or steam://run". Round 1 does show pid reads, but with no exit or fallback after them. I treated that as not triggering the decision. If the operator reads the condition literally, item 5 needs a decision; the evidence argues no writer is needed.

## Not yet established

Main menu and Mac Steam In-Game were not observed (headless scratch round; In-Game never counts from helper logs alone). Those are items 6-8 in 52-12 on the product bottle.

52-12 may run (pass candidate reached), subject to the item 5 review above.

## Self-Check: PASSED
52-UAT.md updated (commit 9f1fece63); session captures present.
