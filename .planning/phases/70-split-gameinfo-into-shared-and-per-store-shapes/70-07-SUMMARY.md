---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 07
subsystem: types
tags: [gameinfo, narrowing, asStoreGame]
requires: [70-01, 70-03]
provides: [shared backend readers and hooks narrowed via asStoreGame]
key-files:
  modified:
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/launcher.ts
    - src/backend/macArch/recovery.ts
    - src/backend/macArch/__tests__/recovery.test.ts
    - src/backend/storeManagers/steam/library/index.ts
    - src/frontend/hooks/hasStatus.ts
    - src/frontend/hooks/hasAnticheatInfo.ts
metrics:
  completed: 2026-11-14
---

# Phase 70 Plan 07: Shared readers narrowed Summary

Backend readers outside storeManagers/ and the two frontend hooks now read store-only fields through `asStoreGame`, and the Steam library manager's `getGameInfo`/`getListOfGames` return `SteamGameInfo`.

## Commits
- bc08732c9: backend readers (downloadqueue isEAManaged/isUbisoftManaged via legendary, launcher namespace via legendary, recovery installedDLCs via gog) and Steam library manager narrowing
- 1393e4b5e: hasStatus (no store-key destructure from the spread; steamResumePending via steam guard) and hasAnticheatInfo (namespace via legendary)

## Results
- `npx tsc --noEmit`: only the 70-11-owned `legendaryRuntime.test.ts:28` error remains.
- Flip probe: zero errors for these files; no UNOWNED files to absorb (per 70-03).
- `pnpm lint`: 0 errors. Jest: downloadmanager, macArch, steam/library, and all Frontend suites pass.

## Deviations from Plan
- **[Rule 1 - Bug] recovery.test.ts fixture** lacked `runner`, so the new gog guard returned undefined for installedDLCs; added `runner: 'gog'` to the mock (real objects always carry runner).
- `save_sync.ts` needed no change: its reads already compile (legendary-typed manager) and the probe reports 0 there.
- Steam library manager narrowing done per the 70-04 handoff; tsc stayed clean.

## Self-Check: PASSED
