---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 21
subsystem: steam-bridge
tags: [gen_vtables, gap-closure, CR-02]
requires: []
provides:
  - cfgFamilyName() for g_iface_table and resolve_bare_iface
  - cross-source family spelling pin test
affects: [steam_api_shim.c bare SteamMatchmaking()/SteamMatchmakingServers()]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
key-decisions:
  - "Manifest family stays SteamMatchmaking (Proton fetch key); cfg spelling SteamMatchMaking is derived via cfgFamilyName; bareAccessorName returns the manifest spelling unchanged"
requirements-completed: [D-51-07, D-51-02]
duration: 15min
completed: 2026-10-22
---

# Phase 51 Plan 21: Matchmaking cfg family spelling (CR-02) Summary

The shim's bare `SteamMatchmaking()` / `SteamMatchmakingServers()` accessors now look up `SteamMatchMaking` / `SteamMatchMakingServers`, the spelling the backend writes into `gamelib_bridge.cfg`, so they no longer return NULL.

## Commits
- a3e2cc099: generator fix, regenerated shim, tests (both tasks; the pin test lives in the same test file).

51-REVIEW.md CR-02 is resolved by commit a3e2cc099.

## Changes
- `cfgFamilyName` plus `CFG_FAMILY_OVERRIDES` are exported from `gen_vtables.ts`. Every g_iface_table family column and `resolve_bare_iface` argument goes through it. `bareAccessorName` returns the manifest spelling, so export names are unchanged. The dead `BARE_ACCESSOR_FAMILY_OVERRIDES` was removed.
- The generated diff is exactly 4 lines in `steam_api_shim.c` (two table rows, two resolve_bare_iface args). No .h or .def changes. `pnpm build-steam-bridge` exits 0 for x86 and x64.
- No other `.family` comparisons in the generator needed routing: the remaining uses are the SteamClient/UserStats/RemoteStorage/Utils policy checks and comments, all on manifest spelling.
- Pin test: for each of the 21 `*.manifest.json` files in meta/sdk (all schemaVersion 2, all with a bare accessor), `bareAccessorName(family)` must be a key of BARE_ACCESSOR_FAMILY, `cfgFamilyName(family)` must equal its value, and any served-map entry must carry the same family. A negative control (family `SteamMatchMakingX`) is reported.
- Revert check: with `cfgFamilyName` reduced to identity, 4 tests fail (generated-C assertions plus the cfg mapping); restored, 107/107 pass.

## Deviations from Plan
- The earlier test expecting `bareAccessorName('SteamMatchMaking') === 'SteamMatchmaking'` encoded the old keyed override; replaced by the new spelling tests.
- I briefly ran `git stash` on gen_vtables.ts for the revert check, then immediately popped it. It was my own entry, nothing was lost, and the stash list is empty. I used an in-place edit for the actual check.

## Verification
- gen_vtables suite 107 passed; prettier clean on both .ts files; build-steam-bridge OK.

## Self-Check: PASSED
