---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 03
subsystem: steam-bridge-drm
tags: [crossover, codesign, runner-clone, overlay]
requires: []
provides:
  - exported clone / re-sign / xattr-scrub / version primitives for plan 05
  - DRM runner clone with best-effort re-signed bin/wineloader (marker schema 2)
affects: [60-05]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/drm/runnerClone.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts
decisions:
  - "bin/wineloader re-sign is best-effort: failure restores the stock binary from .gamelib-orig, records wineloaderResigned=false, and DRM still launches"
  - "xattr scrub stays targeted (-d quarantine/provenance), never xattr -c"
  - "resignLoader has strict (5/6 stock keys) and derived (dumped keys + dyld) modes"
metrics:
  tasks: 2
  files: 2
  completed: 2026-11-02
requirements: [D-05]
---

# Phase 60 Plan 03: DRM clone re-signs bin/wineloader Summary

The DRM runner clone now re-signs `bin/wineloader` (best effort) alongside the fail-closed `lib/wine/x86_64-unix/wine`, and the clone, re-sign, scrub and version-read steps are exported helpers for plan 05.

## Tasks

1. Refactor (29f1c4f0c): exported `cloneCrossoverTree`, `resignLoader(strict|derived)`, `scrubCloneXattrs`, `readCrossoverBundleVersion`, `WINELOADER_REL`, `CROSSOVER_BUILD_RE`, `RUNNER_TIMEOUTS` and the low-level helpers. Existing tests passed unmodified.
2. Feature (72a172623): wineloader re-sign after the strict loader re-sign; on failure a warning is logged, the stock binary is restored (restore failure is a `runner-patch` error), and `wineloaderResigned=false`. Marker schema 2 adds `wineloaderSha256` and `wineloaderResigned`; `verifyRunnerClone` requires schema 2, re-hashes bin/wineloader every launch, and checks the six entitlements on it only when it was re-signed. `RunnerReady.wineloaderResigned` is populated on both clone and cache paths.

## Deviations from Plan

- `readCrossoverBundleVersion` returns a tagged result (`ok`/`invalid`/`unreadable`) instead of `string | null`, so `detectAllowedCrossover` keeps its two distinct error messages unchanged.
- The test fake's entitlement state is now per loader (keyed by path under `CrossOver/`), and the "verify spawns one dump" test now expects two dumps. Plan-expected consequence of the second loader.

Added 8 test cases covering the behaviour list plus a cache-hit case.

## Verification

Bridge test suites pass (1402 passed), `pnpm codecheck` clean, prettier clean, eslint reports only two pre-existing warnings in the test file.

## Self-Check: PASSED
