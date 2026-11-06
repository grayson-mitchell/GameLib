---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 25
subsystem: steam-bridge
tags: [allowlist, census, gap-closure]
requires: [51-20, 51-22]
provides:
  - Hoard (63000) on knownBad as does-not-run, citing 51-UAT item 4
  - optional zod-validated playVerified { evidence, date } on seed entries
  - census with separate routed and verified-running counts
affects: [51-28, 51-30]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
    - src/backend/storeManagers/steam/bridge/allowlist.ts
    - src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
decisions:
  - "playVerified lives on seed entries only; knownBad schema is strict so a stray playVerified is rejected"
  - "Census 'routed' = bridge + no-steam-api; 'verified' requires routed AND playVerified"
metrics:
  tasks: 2
  completed: 2026-10-22
---

# Phase 51 Plan 25: Acceptance re-baseline (Hoard known-bad, honest census) Summary

Hoard is recorded known-bad from UAT evidence, and the D-51-15 census now reports "routed" and "verified running" as separate numbers.

## Tasks

1. Hoard to knownBad; playVerified on seed entries - commit 172365a4c. The `does-not-run` enum is unchanged. Avernum 6 (206060) carries playVerified; Avernum 5 (206040) does not.
2. Census: routed vs verified, no-steam-api and runtime-loaded rows - commit 431bbd69b. An exe with no steam_api import is `no-steam-api` when no non-shim steam_api*.dll ships in the tree. When one ships, it is `missing-symbols` with the `<dll>@runtime-loaded` marker from `runtimeLoadedSteamApiMarker`, the same string the live path records.

## Census desk re-run (verbatim)

`3 of 6 routed to the bridge; 1 of 6 verified running through the bridge (bridge=3, known-bad=2, missing-symbols=1)`

This is a desk re-run, not the closing census; 51-30 owns that.

## Verification

- allowlist, bridgeRoute and bridgeCensus suites pass
- `pnpm codecheck` passes
- prettier check passes on all written paths

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None.

## Threat Flags

None. T-51-52: the new row field is a boolean, and the row-keys test is extended to include `verified`. T-51-53: the schema requires non-empty evidence and an ISO date, and a test asserts each evidence string cites a UAT item.

## Self-Check: PASSED
