---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 08
subsystem: steam-bridge
tags: [steamstub, registry, hkcu, pe-sections, shim]
requires: [52-03, 52-04]
provides:
  - steamClientSetup (buildSteamClientRegistryCommands, toBottleWindowsPath, setupSteamClientForwarder)
  - detectDrmWrapper and drmWrapper on placeShimForGame results and verdicts
affects: [52-09]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/steamClientSetup.ts
    - src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
key-decisions:
  - "HKCU-only registry writes (SteamClientDll64, Universe=Public); no pid, no x86 SteamClientDll (decisions 1 and 6)"
  - "drmWrapper stamped by a wrapper step in placeShimForGame rather than at each return site"
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 52 Plan 08: SteamStub bottle setup and .bind detection Summary

HKCU-only, containment-checked SteamStub forwarder setup module plus `.bind` section detection that flags SteamStub titles at install time.

## What was built

- `steamClientSetup.ts`: argv builder for the two `reg add` commands (validated Windows path), `toBottleWindowsPath` (drive_c containment), and `setupSteamClientForwarder` (appId guard, x86 deferred, forwarder-not-built, target-dir choice, bottle containment, byte-identical copy skip, typed errors for non-zero or thrown `runWineCommand`). 24 tests.
- `shimGenerate.ts`: exported `detectDrmWrapper` (bounded 8 KiB read, fd closed in finally, never throws) and `drmWrapper?: 'steamstub'` on placed / already-placed / placed-miss results and on placed / placed-miss / no-steam-api verdicts. The key is absent when not detected. 5 new tests.

## Task commits

1. Task 1: 5a7924740
2. Task 2: 89b3e4338

## Deviations from Plan

- The plan's acceptance count (`grep -c drmWrapper` at least 8) assumed stamping at each return site. Stamping is centralised in one `withDrmWrapper` step run after the inner function, so the count is 6. Behaviour is the same and it only runs on non-error results, so detection never opens an out-of-bottle exe. The `withheld` status is not stamped (not listed in the plan).
- Rule 2/3 fixes: none needed.

## Verification

- `npx jest` for steamClientSetup, shimGenerate, peSections: green (115 tests across them).
- `pnpm codecheck`: green. `prettier --check` on all four paths: green.
- No non-comment HKLM reference in steamClientSetup.ts.

## Known Stubs

None.

## Self-Check: PASSED
