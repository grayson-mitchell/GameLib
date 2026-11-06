---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 38
subsystem: steam-engine
tags: [G22, offline, launch, preflight]
requires: [59-36]
provides:
  - readBottleEngineMarkerKind and restoreNeedsAbsentPin read-only marker accessors
  - offline early refusal in selectLaunchEngine ahead of the demo-status probe
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/engineSwitch.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineSwitch.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "Early refusal reuses gamelib:steam.engine.downloadFailed with reason offline; no new string."
  - "Refusal is gated on restoreNeedsAbsentPin (not the marker kind alone) because a healthy CrossOver restores from the marker's own DXVK copy without the pin."
metrics:
  completed: 2026-11-03
requirements: [G22]
---

# Phase 59 Plan 38: offline launch-blocked dialog without the probe wait Summary

An offline launch that cannot start on any branch is now refused before the CrossOver `--demo-status` probe runs.

## G22 diagnosis

**1. Order of awaits before the dialog** (state: override automatic, marker non-CrossOver, pin absent, offline):
`decideLaunchEngine` -> `preflightCrossover`: `resolveCrossoverBinDir`, then `readBuild` and `probe` in parallel (cap `DEMO_STATUS_CAP_MS` 15 s); a timeout is inconclusive, so `stopWineserver` then a second probe (`PROBE_TIMEOUT_ATTEMPTS = 2`). Then back in `selectLaunchEngine`: `prepareBottleForEngine` -> `resolveRestoreSource` -> `deps.ensurePinEngine`, which fails immediately offline. Only after all of that does the dialog show.

**2. Where the ~9.7 s goes:** entirely in the probe (restore failing offline is instant). A scratch jest reproduction (not committed, deleted) injecting a probe that resolves after 700 ms measured 701 ms to the decision for one probe and 1403 ms when the first probe times out and is retried, so elapsed time to the dialog tracks the probe time one-for-one. The UAT 25 elapsedMs=9671 is one slow `--demo-status` run (or a shorter first attempt plus the retry).

**3. Per preflight outcome, from this state (automatic):**

| Outcome | Path | Needs absent pin? |
|---|---|---|
| healthy | crossover; restore if a DXVK marker/`prev.dxvk` exists | Yes, unless the marker's own DXVK copy (`prev.dxvk.dir/x64`) survives or no restore is needed |
| expired / broken / missing / inconclusive | pinned fallback, `needsDownload` -> `ensureBuiltInEngineForInstall` | Yes, always (current pin) |

**4. Override crossover:** healthy behaves as above; expired restores via the built-in engine (`needWine`) so it needs the pin; broken/missing returns `unavailable` (a dialog, still no launch).

**5. Required pin:** the restore needs `pinById(marker.id)` for a `pinned` marker, else `ENGINE_PINS.current`; the unhealthy fallback needs `ENGINE_PINS.current`. The early refusal therefore requires `!isPinnedEngineInstalled(ENGINE_PINS.current)` and `restoreNeedsAbsentPin` (which checks the marker's pin and the DXVK copy).

CONFIRMED: every branch needs the pin, provided the restore is actually needed and the marker's DXVK copy is gone; the refusal is gated on exactly that, so branches that can still launch (no restore, or surviving DXVK copy) keep probing.

## What was built
- `readBottleEngineMarkerKind(bottleName)` and `restoreNeedsAbsentPin(bottleName)` in engineSwitch.ts: read-only, sanitized, never throw or write.
- `selectLaunchEngine`: before `decideLaunchEngine`, offline + override automatic|crossover + non-CrossOver marker + current pin absent + restore needs absent pin -> log "launch blocked before pre-flight", show `engine-download-failed` dialog (reason offline), return `{ ok: false }`. No engine is registered.

## Commits
- Task 2 code and tests: see git log (`fix(59-38)`); Task 1 diagnosis lives in this file.

## Verification
steam suites 4295 passed (2 skipped); 7 new G22 tests (3 accessor, 1 refusal + 1 crossover override + 6-case pass-through table in games.test.ts); eslint 0 errors; `pnpm codecheck` and `pnpm smoke:sidecar` pass; prettier clean.

## Deviations from Plan
- [Rule 3] games.test.ts engineSwitch/fallbackEngine module mocks gained `readBottleEngineMarkerKind`, `restoreNeedsAbsentPin`, `isPinnedEngineInstalled` entries so the new calls resolve; no existing test changed.
- Added `restoreNeedsAbsentPin` (not in the plan) because the marker kind alone would wrongly refuse a launch whose healthy-CrossOver restore needs no pin; this is the diagnosis point 3 refinement.

## Known Stubs
None.

## Self-Check: PASSED
