---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 16
subsystem: steam-bridge
tags: [steamstub, forwarder, wine, reg-add, gap-closure]
requires: [52-15]
provides:
  - "bounded, exit-code-strict reg add in setupSteamClientForwarder"
  - "withheld SteamStub notice; exeArch-first forwarder arch; fresh drmWrapper precedence"
affects: [52-17]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/steamClientSetup.ts
    - src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/deferred-items.md
decisions:
  - "reg.exe exit code 0 is the only proof of a registry write; wait:false avoids wineserver --wait"
  - "No literal x64 arch default; unknown arch skips setup and fires the setup-error notice"
metrics:
  tasks: 3
  completed: 2026-10-24
---

# Phase 52 Plan 16: Forwarder setup hardening and withheld notice Summary

The forwarder path now reports "placed" only when both reg.exe children exited 0, cannot hang Play (15 s unref'd bound, `wait: false`), reads the arch from the exe, and every SteamStub outcome, including withheld, carries an honest notice.

## Tasks

1. `098314e3e` steamClientSetup: `REG_ADD_TIMEOUT_MS`, `wait: false`, race with unref'd/cleared timer, strict `code !== 0` (WR-01, WR-02). 4 new tests (Invalid wine, null code, timeout, no leftover timer).
2. `dccb9f6a1` games.ts: `withheld` notice cause, `exeArch ?? verdict.arch ?? persisted arch` with no x64 default (unknown skips setup and fires setup-error), fresh `drmWrapper` wins over stale persisted and the scan is rewritten without it (WR-03, WR-04). 5 new tests.
3. deferred-items.md: WR-05..08, IN-01..04, orphaned reg-add child, 52-13 version risk; stale withheld bullet marked resolved.

## Verification

Bridge suites plus games.test.ts: 16 suites, 807 tests pass. `pnpm codecheck` clean. Prettier clean on the code paths (deferred-items.md is prettier-ignored).

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED
