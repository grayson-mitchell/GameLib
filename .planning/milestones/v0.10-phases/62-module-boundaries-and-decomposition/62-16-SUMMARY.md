---
phase: 62-module-boundaries-and-decomposition
plan: 16
subsystem: backend
tags: [capabilities, sidecar, boundaries, ratchet]
requires: [62-13, 62-15]
provides:
  - BACKEND_CEILING = 0, no raw runner literal in src/backend outside storeManagers/ and tests
affects: [62-17]
key-files:
  modified:
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/sidecar/oauthLoginCapture.ts
    - src/backend/sidecar/runnerMiscFlowRegistration.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/backend/signInProbe/verdict.ts
    - src/backend/crossover_index/index.ts
    - src/backend/protocol.ts
    - src/backend/shortcuts/shortcuts/shortcuts.ts
    - src/backend/shortcuts/utils.ts
    - src/backend/wiki_game_info/wiki_game_info.ts
    - src/backend/wiki_game_info/gamesdb/utils.ts
    - src/backend/wiki_game_info/howlongtobeat/utils.ts
    - src/backend/wiki_game_info/umu/utils.ts
    - meta/boundaryRatchet.cjs
    - meta/__tests__/boundaryRatchet.test.ts
key-decisions:
  - "oauthLoginCapture switch became Record<OAuthRunner, matcher>; lookup keeps `?.() ?? null` so an out-of-type runner still returns null like the old default"
  - "redeemSteamKey validates with isStore (boolean, no narrowing) and passes the literal 'steam' to redeemKey"
  - "boundaryRatchet.test asserted BACKEND_CEILING > 0; retargeted to >= 0 (zero is the goal), other assertions unchanged"
requirements-completed: [D-02, D-04, D-14, D-15]
completed: 2026-11-07
---

# Phase 62 Plan 16: rest of backend Summary

**All 24 table rows converted; BACKEND_CEILING 24 to 16 to 0 in two commits; no new flag needed.**

## Tasks
1. sidecar registrations + oauthLoginCapture, 24 -> 16: `27bb22c82`
2. remaining backend sites, 16 -> 0: `3ca7df222`

## Notes
- `appShellFlowRegistration.ts` and `settingsFlowRegistration.ts` were in the plan's file list but had no ratchet sites; untouched.
- The `--list` output matched the 24-row table exactly; no out-of-scope backend site.
- Flags used: appNameIsSteamAppId (crossover, gamesdb, wiki steamID), launchHandedToClient (protocol, steamFlowRegistration), canAddSteamShortcut, hasStoreCatalog (umu; false only for sideload). Identity sites use isStore.

## Deviations from Plan
**[Rule 1 - test] boundaryRatchet.test.ts** required BACKEND_CEILING > 0, which the plan's own goal falsifies. Relaxed to >= 0 with a comment.

## Verification
codecheck, lint (0 errors), boundaries (backend 0/0, frontend 136/136, depcruise `[]`), find-deadcode, prettier, build:sidecar-sea + smoke:sidecar pass. Full jest: only the 6 baseline failures remain.

## Self-Check: PASSED
