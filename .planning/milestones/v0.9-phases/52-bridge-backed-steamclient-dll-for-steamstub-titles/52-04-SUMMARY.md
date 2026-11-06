---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 04
subsystem: steam-bridge
tags: [pe-parser, steamstub, bridge-verdict, zod]
requires: []
provides:
  - "parsePeSectionNames / hasSteamStubSection: bounds-checked, zero-import PE section reader"
  - "drmWrapper?: 'steamstub' on SteamBridgeScanVerdict, persisted through readBridgeVerdict"
affects: [52-08, 52-09]
tech-stack:
  added: []
  patterns:
    - "zero-import pure parser (like importParse.ts); overflow-safe bounds checks on untrusted exe bytes"
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/peSections.ts
    - src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
    - src/backend/storeManagers/steam/electronStores.ts
key-decisions:
  - "Unknown drmWrapper value fails the whole bridge verdict parse (readBridgeVerdict returns undefined with a warning), matching existing invalid-scan behaviour"
  - "No KNOWN_BAD_REASONS entry and no routing change; the field only gates forwarder setup"
requirements-completed: [P52-SCOPE-4]
duration: 10min
completed: 2026-10-24
---

# Phase 52 Plan 04: PE section detection and drmWrapper verdict field Summary

Pure bounds-checked PE section-name parser (`.bind` => SteamStub) plus an optional `drmWrapper` field on the persisted scan verdict that survives zod's non-strict stripping.

## Tasks

1. PE parser, commit bb98a963a. 10 hostile-header tests (short buffer, bad magic/signature, huge e_lfanew, lying section count, 96 cap, truncated table, unterminated 8-char name, exact `.bind` match). Zero `import` lines.
2. drmWrapper, commit 6c71ce0da. Type field, zod enum, 3 round-trip tests. allowlist.ts untouched.

## Verification

`npx jest src/backend/storeManagers/steam/bridge` 14 suites / 396 tests pass; `pnpm codecheck` clean; prettier applied to all written paths.

## Deviations from Plan

None - plan executed as written.

## Self-Check: PASSED
