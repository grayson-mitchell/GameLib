---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 26
subsystem: steam-bridge
tags: [win64, shim, wire, gap-closure, elex]
requires: [51-15, 51-20, 51-21]
provides:
  - SteamUser019, SteamFriends015, SteamUtils008, STEAMAPPS_INTERFACE_VERSION008 served as wire on the Win64 shim
  - live probe evidence (AppID 411300) before and after wiring
affects: [51-27]
key-files:
  modified:
    - meta/sdk/isteamuser019.manifest.json
    - meta/sdk/isteamfriends015.manifest.json
    - meta/sdk/isteamutils008.manifest.json
    - meta/sdk/isteamapps008.manifest.json
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - meta/__tests__/gen_vtables.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
decisions:
  - "Wired despite BLoggedOn=false through the Mac accessor: operator accepted it as the existing x86 behaviour; 51-27's live ELEX re-gate tests the real outcome"
metrics:
  tasks: 3
  completed: 2026-10-23
---

# Phase 51 Plan 26: Win64 core-interface wiring Summary

ELEX's four core Win64 interfaces (SteamUser019, SteamFriends015, SteamUtils008, STEAMAPPS_INTERFACE_VERSION008) are now `wire` and dispatch to the same helper accessors as their x86 siblings, backed by a live probe against the signed-in Mac Steam.

PRE_PLAN_SHA: `6c63a94e382e21c38243b332eb2bedce4919fe55`. Task 3 commit: `547055ad6`.

## Operator approval (Task 2, verbatim)

Question: "51-26 probe: 6/7 accessor checks match, but BLoggedOn returns false through the Mac accessor. How should the Win64 core-interface wiring proceed?"

Answer: "Approved (Recommended)" -- "Wire the four x64 interfaces (SteamUser019, SteamFriends015, SteamUtils008, SteamApps008) anyway. BLoggedOn=false is accepted as matching the existing x86 behaviour; 51-27's live ELEX re-gate tests the real outcome."

## Probe 1: pre-wiring (Task 1, x86 sibling ordinals, AppID 411300, SteamID64 last 4 digits only)

| # | Call (ordinal, slot) | status | observed | expected | match |
| - | -------------------- | ------ | -------- | -------- | ----- |
| 1 | WHOAMI (control) | OK | SteamID64 ...7096 | real SteamID | yes |
| 2 | BIsSubscribed (9, 0) | OK | 1 | true | yes |
| 3 | BIsSubscribedApp(411300) (9, 6) | OK | 1 | true | yes |
| 4 | BLoggedOn (3, 1) | OK | 0 (false) | true | NO |
| 5 | GetSteamID (3, 2) | OK | ...7096 | == WHOAMI | yes |
| 6 | GetAppID (5, 9) | OK | 411300 | 411300 | yes |
| 7 | GetPersonaName (8, 0) | OK | 11-byte non-empty | non-empty | yes |

## Probe 2: post-wire (new x64 ordinals 17/19/18/20, same slots, freshly built helper)

| # | Call (ordinal, slot) | status | observed | expected | match |
| - | -------------------- | ------ | -------- | -------- | ----- |
| 1 | WHOAMI (control) | OK | ...7096 | real SteamID | yes |
| 2 | BIsSubscribed (20, 0) | OK | 1 | true | yes |
| 3 | BIsSubscribedApp(411300) (20, 6) | OK | 1 | true | yes |
| 4 | BLoggedOn (17, 1) | OK | 0 (false) | same as probe 1 (operator-accepted) | yes (identical to probe 1) |
| 5 | GetSteamID (17, 2) | OK | ...7096 | == WHOAMI | yes |
| 6 | GetAppID (19, 9) | OK | 411300 | 411300 | yes |
| 7 | GetPersonaName (18, 0) | OK | 11-byte non-empty | non-empty | yes |

Every value is identical to probe 1, so no rollback. No frame errors. The probe's helper was SIGTERMed; no `--appid 411300` process remains. Raw captures and the scratch `probe/` directory were deleted. (A separate helper for AppID 200510 was already running and is not from this plan; left untouched.)

## Results

- Extractor (`extract-proton-inventory --versions ...`) changed only `mode`/`helperFlat` on wire-policy methods; ordinals, slots and method lists unchanged. Wired counts: User019 3, Friends015 2, Utils008 11, Apps008 14.
- `helperInterface` copied verbatim from the x86 siblings and equal for all four pairs (User v023, Friends v018, Utils v011, Apps v009).
- `grep -c "mode: 'wire'"` in shimCoverage.ts: 12 before, 16 after (+4).
- `bridge_dispatch.h` has dlsym lines for steamuser019, steamfriends015, steamutils008 and steamapps_interface_version008.
- SHIM_EXPORT_SET_VERSION: it changes, because `computeExportSetVersion` hashes `version:family:mode` for every served entry, so the four stub-to-wire flips alter the digest. The function was not touched. Previously stored scan verdicts are re-evaluated on that change.
- SteamClient017 stays `stub` (factory object, no helper accessor); the comment in shimCoverage.ts cites this probe.
- Verification: shimCoverage, gen_vtables and bridgeCensus suites pass (170 tests); `pnpm build-steam-bridge` compile gates passed for x86 and x64; `pnpm codecheck` clean; prettier check clean.

## Deviations from Plan

None in scope. Plan note vs reality: the helper's ordinal 8 is the friends013/v018 accessor; the plan's x86 sibling `isteamfriends011` carries helperInterface `SteamAPI_SteamFriends_v018`, which is what was copied, so there was no impact.

One self-inflicted slip, fixed before commit: my first scripted edit of shimCoverage.ts anchored on the wrong occurrence of a comment and deleted too much; it was reverted with `git checkout` of that file and redone.

## Known Stubs

None added. BLoggedOn returns false through the Mac accessor (accepted by the operator); 51-27 owns the live check.

## Self-Check: PASSED
