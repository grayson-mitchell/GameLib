---
created: 2026-08-27
title: "Steam depot install fails at the download stage with the UNCLASSIFIED generic error and no diagnostic detail"
area: steam-depot
status: OPEN
severity: major
files:
  - src/backend/storeManagers/steam/depotErrors.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/decompress.ts
  - src/backend/storeManagers/steam/lzmaLoader.ts
---

## Symptom

Installing **Fallout 2** (38410) on macOS under Tauri fails ~5s after the click:

```
SteamGame: depot install failed for appId 38410: The Steam download failed.
[DownloadManager]: Installation of 38410 failed with: The Steam download failed.
```

`"The Steam download failed."` is the **generic fallback** at `depotErrors.ts:277`
(`steam.download.error.genericV2`), reached only when the error text matches NONE of the
classified signatures. Phase 37's D-06 alternation deliberately routes unmatched text here
rather than misattributing it to the network — so this is the classifier behaving correctly
over a cause nobody has identified.

## What makes this hard to diagnose

**The pipeline reports success right up to the failure.** From the log:

```
Steam depot selection: selectAllDepots union across base + DLC apps -> 2 depot(s)
buildDepotPlan/fetchDepotPlanEntry:38414: attempt 1 succeeded in 611ms
buildDepotPlan/fetchDepotPlanEntry:38415: attempt 1 succeeded in 305ms
buildDepotPlan: total 1731ms for appId 38410 (2 depot(s))
getContentServerHosts: hosts=6, weightedLoads=6
steam-flags-census stage=download-entry    appId=38410 totalFiles=65
steam-flags-census stage=download-complete appId=38410 totalFiles=65
runNativeDepotDownload: downloadSteamDepots took 4851ms (status=error); total since click 5062ms
```

`stage=download-complete` fires on all 65 files, and THEN the install errors. Whatever fails
does so after the census believes the download walk finished.

**No chunk-level detail is emitted.** Unlike the closed Z_DATA_ERROR defect
(`2026-08-21-steam-depot-chunks-fail-to-decode-z-data-error.md`, resolved by 37-01), there is
no `fetchChunk: decode-stage failure reason=...` line anywhere. So the generic bucket is reached
with nothing recorded to classify it by — that gap is arguably the real defect here.

**Possibly relevant:** `lzmaLoader: native lzma-native decode is explicitly DISABLED by this
build (NATIVE_LZMA_DECODE_ENABLED=false, lzmaLoader.ts) -- running the pure-JS lzma package`
fired repeatedly during the attempt.

## MUST RULE OUT FIRST — the fixture was deliberately degraded

This was hit during the 34.13 UAT gate on a title whose state had been hand-modified to arm a
cold-cache test: its `steam_metadata.json` entry was DELETED and `steamPlatformsCaptured` was
set to `false` in `steam_library.json`. `selectAllDepots` is the normal base+DLC union and is
not a missing-platform fallback, so the fixture is not an obvious cause — but it has NOT been
excluded.

**Reproduce on an UNMODIFIED, fully-captured title before treating this as confirmed.** If it
does not reproduce there, the finding is about the fixture path, not the install path.

## Also worth noting

Steam was rate-limiting metadata fetches with `403` around the same window (a burst caused by
the gate deleting the whole metadata cache and forcing 224 refetches). That is known to be
self-inflicted and cleared on its own, but it means the run was not against a quiet network.

## Not a 34.13 defect

34.13 covers the install-time wine/bottle FORM. `G-QUICK-NOPROBE`/tauri PASSED on its own
criterion (stall timing at click) in the same run — the install pipeline was entered within the
first second and did real network work. This failure is downstream of everything 34.13 owns.
