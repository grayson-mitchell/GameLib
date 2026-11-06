---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 30
subsystem: steam-bridge
tags: [uat, census, d-51-15, verdict]
requires: [51-29]
provides:
  - 51-UAT items 19 and 20 recorded; closing census on the strict criterion
  - operator verdict on the "most" goal: unmet, follow-up phase
key-files:
  modified:
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-UAT.md
    - .planning/STATE.md
    - .planning/todos/completed/2026-10-22-bridge-prescreen-always-returns-none.md
key-decisions:
  - '"most" verdict 2026-10-24: unmet-follow-up, operator answer "Unmet, follow-up phase (Recommended)"'
metrics:
  completed: 2026-10-24
  tasks: 3
requirements-completed: []
---

# Phase 51 Plan 30: Closing census and "most" verdict Summary

The closing census reads `18 of 19 routed to the bridge; 0 of 19 verified running through the bridge (HELLO + clean game log; 1 init-failed, 18 unverified)`, and the operator recorded the ROADMAP goal as NOT met.

## Verdict

N=18, K=0, M=19 on the strict criterion (HELLO plus a clean game-side Steam init; no game log is unverified; In-Game never counts). Operator, verbatim: "Unmet, follow-up phase (Recommended)". Follow-up phase name: Steam bridge coverage: modern-SDK exports, flat API, engine-layout scan, SteamStub forwarder, bottle runtime components. The operator should run `/gsd-add-phase` with that name; this plan did not add it. Dominant miss classes by sample reach: (1) modern-SDK SteamInternal exports, (2) flat API for Unity Steamworks.NET, (3) Unreal bootstrap-exe scan miss, (4) SteamStub forwarding steamclient, (5) bottle Windows runtime components. D-51-15 is not marked complete.

## What was done

- Item 19 result: pass, with a 12-row table; item 20 added with the census verbatim and the static-class blind spot noted (not fixed).
- Seed: no additions (no title meets the strict criterion). AoD 230070 and Avernum 6 stay, evidence recorded as "played with shim attached but unverified", counted separately from K.
- knownBad: no additions. Unclaimed World 284100 fits no existing reason honestly (bottle runtime component gap, fixable, pending todo); enum not widened.
- Prescreen todo closed (moved to completed/): Rogue Waters 1691190, subfolder DLL, logged `result=x64`. No `none` regression.
- 51-UAT Summary updated (total 20) with the verdict; STATE.md decision appended.

## Deviations from Plan

- Plan's key_link "seed[].playVerified drives the census verified count" was stale after quick 261024-f0w; K comes from the Evidence column.
- Commit 49b17de5e held only the todo rename (a bad pathspec in my first `git add`); 6d1847580 carries the rest.
- No allowlist or allowlist.test.ts change was needed.
- REQUIREMENTS.md does not exist in the tree, and D-51-15 stays open by operator decision, so no requirements step was run.

## Self-Check: PASSED
