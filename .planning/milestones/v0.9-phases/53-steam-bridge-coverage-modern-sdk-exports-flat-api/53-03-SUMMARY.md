---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 03
subsystem: steam-bridge
tags: [census, evidence, engine-detection, d-53-13, d-53-14]
requires: []
provides:
  - "classifyBridgeEvidence with optional engine (default unity, f0w unchanged)"
  - "detectEngine, steamworksUsing/verifiedSteamworksUsing/majority in summarizeCensus"
  - "findAppLogs (rotated gamelib.log*), findUnrealSavedLogs, findGodotLogs, Logs read line"
affects: [53-06, 53-07]
tech-stack:
  added: []
  patterns: ["bounded tail read of app logs", "bracket-anchored appid CALL match after HELLO"]
key-files:
  created: []
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
decisions:
  - "Unity keeps the f0w rule verbatim; a CALL line neither substitutes for nor adds to Player.log"
  - "CALL is read only from GameLib app logs, never engine logs (T-53-09)"
metrics:
  completed: 2026-10-25
---

# Phase 53 Plan 03: Engine-aware census evidence and Steamworks-using majority Summary

The census now classifies bridge evidence per engine (Unity unchanged; Unreal via Saved logs or a game CALL; Godot, GameMaker and unknown via a game-originated CALL after HELLO), reports verified-of-Steamworks-using with a majority flag, and reads gamelib.log plus rotated siblings with bounds.

## Commits

- 5d93c830f feat(53-03): engine-aware bridge evidence and Steamworks-using majority
- f7e940bb5 feat(53-03): engine log discovery and rotated gamelib.log reading

## Verification

- bridgeCensus.test.ts: 67 passed (D-53-13 and D-53-14 describes added; f0w cases untouched).
- prettier clean on both files.
- `pnpm bridge-census` exit 0: `0 of 15 Steamworks-using rows verified (majority: no)` and `Logs read:` naming 6 files (gamelib.log plus rotated siblings). 0 of 15 is expected: the helper emits no CALL lines until 53-06.

## Deviations from Plan

None - plan executed as written. The `Logs read:` line is printed by `main()` after the markdown rather than inside `formatCensusMarkdown`, keeping that function pure.

## Self-Check: PASSED
