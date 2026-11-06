---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 20
subsystem: steam-bridge
tags: [shimCoverage, gap-closure, CR-01, CR-03]
requires: []
provides:
  - arch-scoped isScanVerdictNowCovered
  - bare-accessor-aware x64 null-object fallback
affects: [bridgeRoute row 5, games.ts clearStaleBridgeVerdict]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
key-decisions:
  - "CR-03 fixed by failing closed (record a miss) rather than patching resolve_bare_iface to return a null object (WR-03: sret slots)"
requirements-completed: [D-51-07, D-51-13, D-51-02]
duration: 15min
completed: 2026-10-22
---

# Phase 51 Plan 20: Arch-scoped verdict clearing and runtime-lookup-only fallback Summary

`isScanVerdictNowCovered` now tests a stored miss only against the scanned arch's exports and served versions, and the x64 null-object fallback applies only to families reached by runtime lookup, not bare accessor imports.

## Commits
- e56b66d7e: both tasks (CR-01 and CR-03), one commit because they edit the same two files and the test updates overlap.

51-REVIEW.md CR-01 and CR-03 are resolved by commit e56b66d7e.

## Changes
- CR-01: `isScanVerdictNowCovered` takes `{ arch, missingSymbols }`; callers already pass a verdict with `arch` and were not edited. IN-01 doc about `shimExportSetVersion` corrected.
- CR-03: unserved x64 version becomes a stub only if fallback enabled, `usesRuntimeInterfaceLookup(symbols)` is true, and no bare accessor import maps to that family; otherwise it is pushed to `missingSymbols`. ELEX still yields zero missing.

## Deviations from Plan
**[Rule 1 - Test fixture] Two pre-existing tests encoded the old behavior** (bare `SteamUser`/`SteamUtils` import with unserved x64 version expected stubbed). Changed their symbols to `SteamInternal_CreateInterface` so they exercise the runtime-lookup path. Existing isScanVerdictNowCovered tests gained `arch: 'x86'`.

## Verification
- Bridge test dir and meta/__tests__/bridgeCensus.test.ts: 259 passed. codecheck clean. prettier clean.
- A wider run of src/backend/storeManagers/steam showed 19 failures in depot/manifest, lzmaNativeBinding, readBoundedTail and SEA sidecar tests. These are unrelated to this plan's files and were not investigated (out of scope).

## Self-Check: PASSED
