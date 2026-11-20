---
quick: 261104-uas
status: complete
note: Task 1 committed (bbc3d00d5); Task 2 live check skipped, superseded by 261104-unp (Run/Advanced regroup removes the Other tab)
---

# Quick 261104-uas Summary

Added `isMacNativeStatsOverlayTitle` gate in GamesSettings/index.tsx so native macOS legendary/gog/nile/sideload games get an Other tab with only the Show Stats Overlay toggle. Steam, Windows, Linux, browser games and the Default page are unchanged.

Commit: bbc3d00d5. Files: GamesSettings/index.tsx, GamesSettings/__tests__/nativeMacStatsOverlay.test.ts.

Verify: new test failed before the change (3 of 4), then passed; with steamEnginePlacement 8/8; tsc, eslint and prettier --check clean.

## isNative finding
- legendary: true on Mac when install.platform === 'Mac'.
- gog: true on Mac when install.platform === 'osx'.
- sideload: true on Mac when platform === 'Mac'.
- nile: `isNative()` returns `isWindows` only, so it is never true on macOS. The nile entry in the allow-list is therefore inert today (no native Mac Amazon toggle). Out of scope; not changed.

## Pending
Task 2 live check on macOS.

## Outcome
Superseded by quick task 261104-unp before the live check ran. The user chose to regroup the Other and Advanced tabs into Run and Advanced, which removes the Other tab this gate exposed. The exclusions (Windows, native Linux, native macOS Steam, Default page) carry into 261104-unp. The live check was not performed.
