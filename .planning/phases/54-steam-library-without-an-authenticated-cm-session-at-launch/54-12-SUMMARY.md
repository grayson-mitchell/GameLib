---
phase: 54-steam-library-without-an-authenticated-cm-session-at-launch
plan: 12
subsystem: steam
tags: [mac-steam, go-offline-wrap, gap-closure]
requires: [54-01, 54-03]
provides:
  - owed-goonline marker (mac-steam-offline-owed.json) lifecycle in the wrap
  - restoreMacSteamOnlineIfOwed(trigger) for boot and shutdown (consumed by 54-13)
  - spawnOpenDetached, readMacSteamCmStateSince
affects: [54-13, 54-14]
tech-stack:
  added: []
  patterns: [persistent debt marker with owner pid, per-trigger single-flight]
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/macSteamOnlineDebt.test.ts
  modified:
    - src/backend/storeManagers/steam/macSteamOffline.ts
    - src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts
decisions:
  - "DD-1..DD-9 implemented as specified in the plan"
metrics:
  tasks: 2
  completed: 2026-10-27
---

# Phase 54 Plan 12: Owed-goonline marker and restore Summary

The go-offline wrap now writes an on-disk marker (`{since, by, pid}`, mode 0o600) before firing gooffline and removes it only after goonline. `restoreMacSteamOnlineIfOwed('boot'|'shutdown')` pays a goonline left owed by a dead wrap. It never rejects, is single-flight per trigger, and fires through a detached `/usr/bin/open -g`.

## Commits
- c3d9408c0 test(54-12): failing tests (RED)
- 253c37487 feat(54-12): implementation (GREEN)

## Verification
- steam `__tests__` (57 suites, 2188 tests), steamAuthSessionPolicy and fakeHomeIsolation all pass; `pnpm codecheck` and prettier are clean.
- No steam:// URL was fired, nothing spawned, no real Steam or GameLib directory touched (deps injected, `child_process` mocked).

## Deviations from Plan

**1. [Rule 1 - Bug] Existing "the flag expires after 10 minutes" test**
- **Issue:** `checkGuidedOfflineReady` now records the marker (DD-2), and a present marker independently arms the owed restore (DD-3), so the TTL-expiry assertion saw `guided-restore`.
- **Fix:** the test removes `owed.json` after the check to isolate the TTL flag. The assertions are unchanged.
- **File:** macSteamOfflineWrap.test.ts (in 253c37487)

**2. [Rule 3 - Blocking] findDeadcode used-in-module**
- `MAC_STEAM_OFFLINE_OWED_FILE`, `MacSteamRestoreTrigger` and `MacSteamRestoreOutcome` are exported per the plan but only used in-module until 54-13, so they carry `// ts-prune-ignore-next` (as the plan does for spawnOpenDetached). `spawnOpenDetached` and `readMacSteamCmStateSince` are used by the tests/module and passed the gate.

## Deferred / pre-existing
- `eslint` on macSteamOffline.ts still reports the pre-existing `prefer-promise-reject-errors` (line ~148, already in deferred-items.md).
- meta suites genI18nGateScope, machineFillGamelib, isIntelMacRemoved and findDeadcode (WINE_DRIVERS_KEY) fail as before; all are listed in deferred-items.md.

## Known Stubs
None.

## Threat Flags
None. The new surface (marker file, `/usr/bin/open` spawn) is covered by T-54-47 to T-54-51 and T-54-58.

## Self-Check: PASSED
