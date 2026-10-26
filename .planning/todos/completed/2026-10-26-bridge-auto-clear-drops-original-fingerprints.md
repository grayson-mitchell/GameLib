---
created: 2026-10-26T07:55:17.273Z
title: "Bridge scan auto-clear drops scan.originalFingerprints, so the next launch does one extra rescan and shim re-place"
source: 51-UAT item 21 (2026-10-26)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts:180
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts:288
severity: minor
platform: any
ready: code
---

## Problem

`clearBridgeScanVerdict` (bridgeVerdict.ts ~180) removes the whole `bridge.scan`. Since WR-01 (f96369577) it keeps `interfaceVersions` at top level, but `scan.originalFingerprints` is dropped with the rest of the scan. On the next launch, quick 261026-lif's `backupFingerprintChanged` (shimGenerate.ts ~288) finds no persisted fingerprint for a shim with a restorable `.gamelib-orig`. It logs `new .gamelib-orig -- discarding the persisted verdict and rescanning (quick 261026-lif)` and rescans and re-places the shim, although the backup did not change.

Observed in 51-UAT item 21 on The Age of Decadence (230070): launch 1 auto-cleared; launch 2 logged the line above, and `steam_api64.dll` was rewritten (mtime 20:04). The rescan re-persists the fingerprints, so this costs one rescan and does not loop.

## Solution

TBD. Either retain `originalFingerprints` alongside the retained `interfaceVersions` when clearing, or have `backupFingerprintChanged` treat a missing persisted fingerprint as "unknown" rather than "changed" when there is no scan at all. Add a test that an auto-clear followed by a launch with an unchanged `.gamelib-orig` does not log the lif rescan.
