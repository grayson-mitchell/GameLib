---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 04
subsystem: sidecar
tags: [known-fixes, relay, privacy, abort-contract, tdd]
requires: [57-01, 57-02]
provides:
  - "reportDetectedFix / runKnownFixReport (never-throwing, void-returning report client)"
  - "steamKnownFixReportStore (steam_known_fix_reports sent records)"
affects: [57-08, 57-12]
key-files:
  created:
    - src/backend/knownFixReport.ts
    - src/backend/__tests__/knownFixReport.test.ts
  modified:
    - src/backend/storeManagers/steam/electronStores.ts
decisions:
  - "Relay URL constant carries OPERATOR-DEPLOY-PENDING sentinel; nothing is sent until 57-12 replaces it"
  - "Default deps load config, platform and electron-store lazily per call, after gates pass"
metrics:
  completed: 2026-11-02
---

# Phase 57 Plan 04: Known-fix report client Summary

Gated, bounded, abortable report client: sends only on macOS with the setting on, skips fixes already known (D-12), records sent keys per D-16/D-17, and registers each send with the abort handler so stdin EOF aborts it.

## Commits
- 733045675 test(57-04): failing known-fix report client tests (RED)
- 4ea5ffb33 feat(57-04): known-fix report client (GREEN)

## Verification
22 jest tests pass (url, gate, skip, sent, abort); tsc, eslint and prettier clean; no timers in the module; no static electron/ipc/utils imports.

## Deviations from Plan
- sentStore in default deps is wrapped lazily (get/set resolve the store per call) so electron-store never loads before gates pass.
- Extra test added for local invalid appId ('invalid' outcome).
- `pnpm smoke:sidecar` and `graphify update .` not run in this plan.

## Known Stubs
GAMELIB_FIX_RELAY_URL holds the operator-pending sentinel by design; plan 57-12 resolves it.

## Self-Check: PASSED
