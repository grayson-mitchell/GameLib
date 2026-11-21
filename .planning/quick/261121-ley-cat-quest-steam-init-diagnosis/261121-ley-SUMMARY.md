---
phase: quick-261121-ley
plan: 01
status: complete
subsystem: steam-bridge
tags: [x86, shim, withhold, cat-quest, steamworks-net, D-53-09]
key-files:
  modified:
    - .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
---

# Quick 261121-ley summary

**Verdict: hypothesis 1, but deliberate.** `placeShimForGame` **withheld** the shim for Cat Quest. The x86 classifier marks 26 of its interface versions as blocking, `SteamClient020` (a core start-up family) among them. The game therefore ran Valve's own `Plugins/steam_api.dll`, whose `SteamAPI_Init` fails with no Steam client in the bottle. That gives `SteamAPI_Init() failed` and no HELLO.

Evidence:
- The Plugins DLL is Valve's original (sha1 23ba5c92…, 2026-11-07), with no `.gamelib-orig`. Amnesia's bottle holds the current shim (sha1 107cda0b…) plus a backup.
- The persisted verdict has the `withhold()` shape: `miss` with no `managedScan`, scanned at the baseline launch.
- Re-running the classifier on the stored inputs gives 26 blocking and 0 non-core.

Hypotheses 2 and 3 are ruled out as this failure's cause. Hypothesis 3 is exactly what would fail next if placement were forced: the x86 shim lacks the flat `SteamAPI_ISteamClient_*`, `SteamAPI_ManualDispatch_*` and bare `SteamClient`.

Outcome:
- No cheaper fix exists. The flat tier is confirmed as the blocker.
- The todo's scope gained the x86 ManualDispatch family (now required) and the bare `SteamClient` export.
- No placement-guard change is needed: placement flips on its own once those versions are served.
- A diagnostics gap was noted in the todo: the withheld warning rotated out of `gamelib.log`, and the UI never shows "withheld".
