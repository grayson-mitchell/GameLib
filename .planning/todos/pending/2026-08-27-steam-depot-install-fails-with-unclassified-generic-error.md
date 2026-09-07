---
created: 2026-08-27
title: "Steam depot install fails at the download stage with the UNCLASSIFIED generic error and no diagnostic detail"
area: steam-depot
status: OPEN
debug_session: .planning/debug/steam-depot-unclassified-generic-error.md
last_actioned: 2026-09-07
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

## DISCRIMINATOR RUN 2026-08-27 — depot install is NOT generally broken

Same session, same runtime, ~11 minutes later: **`All Will Fall` (2706020) installed successfully
end to end** — a genuine ~4.2 GB first install, nothing to resume from.
`appmanifest_2706020.acf` written 18:25 with `StateFlags "4"` and
`BytesDownloaded` == `BytesToDownload` == `SizeOnDisk` == 4222299944, a complete manifest.

That title was **unmodified and fully captured**; Fallout 2's fixture had its metadata entry
deleted and `steamPlatformsCaptured` forced false.

**So this is NOT a general depot-download regression.** The remaining candidates, in the order
worth testing:

1. **The degraded fixture** — deleting the metadata entry and/or clearing `steamPlatformsCaptured`
   puts the install down a path a normal title never takes. Cheapest to test: restore 38410 fully
   (it is now back to `steamPlatformsCaptured: true`), delete nothing, and retry the install.
2. **Title-specific depot content** — 38410 is a 1998 title with 2 depots (38414, 38415) and only
   65 files. `All Will Fall` is a modern title. Old depots are exactly where the retired
   `Z_DATA_ERROR` cluster lived, and `NATIVE_LZMA_DECODE_ENABLED=false` means the pure-JS decoder
   is handling them.
3. **Steam's 403 rate limiting** during that window (self-inflicted by the gate's cache wipe).

**The diagnostic gap stands regardless of cause and is arguably the more valuable finding:** the
failure reached the generic bucket with NO `fetchChunk`/`reason=` line logged, and
`steam-flags-census stage=download-complete` fired on all 65 files immediately before the error.
Whatever the root cause, an operator gets "The Steam download failed." and nothing to work from.


---

# UPDATE 2026-09-07 (debug session `steam-depot-unclassified-generic-error`)

## ROOT CAUSE IDENTIFIED — `master.dat` is a DIRECTORY on disk

The Aug 27 log did not survive, but the install did. On disk right now:

```
drwxr-xr-x@ 2 graysonmitchell staff 64 Aug 27 18:09 master.dat
```

Fallout 2's `master.dat` is a ~333 MB game archive. It exists as an **empty
directory**. Its absence is byte-exactly the shortfall:

| quantity | bytes |
| --- | --- |
| ACF `SizeOnDisk` | 591,399,306 |
| real bytes on disk (49 files) | 258,221,501 |
| **shortfall** | **333,177,805** |

Entry counts corroborate: 49 files + 15 subdirs = 64 present against the plan's
65. The single missing entry is `master.dat`-as-a-file.

Writing a file over a directory fails `EISDIR`, which matches **no signature** in
`depotErrors.ts`'s alternation — so it fell through to `genericV2`
("The Steam download failed."). That is the whole reported symptom.

## THE TODO'S THREE RANKED CANDIDATES ARE ALL WRONG

1. **degraded fixture** — restored now (`steamPlatformsCaptured: true`, metadata
   present) and could never explain a directory on disk.
2. **title-specific depot content / pure-JS lzma** — a decode failure rethrows via
   `isDecodeStageError` and IS logged; no decode line was ever emitted, because
   this was never a decode failure.
3. **Steam 403 rate limiting** — would have matched a network signature, not the
   generic bucket.

## THE TODO'S CENTRAL PREMISE WAS FALSE

> "`stage=download-complete` fires on all 65 files, and THEN the install errors."

Both census lines are computed from the **plan**, not from download results
(`summarizeDepotFlags(plan)` at `depot.ts:1999` and `:2475`; the doc comment says
emitting the identical census at both points "is the point"). `totalFiles=65` is
identical at both ends **by construction**, and the line is emitted regardless of
`failures.length`. It never evidenced that 65 files downloaded — so the reasoning
that the failure must be downstream of the download walk does not hold.

## FIXED IN THIS PASS — the diagnostic gap (the todo's own "more valuable finding")

`depot.ts:2438`'s per-file catch recorded failures into `failures` and **logged
nothing**; the throw site classified only `failures[0]` and logged neither the raw
text, the filename, nor the count. Now:

- every per-file failure logs `appId`, `depotId`, filename and
  `describeDepotFailure(err)` — which carries `code` (EISDIR/ENOSPC/ECONNRESET)
  and `eresult`, the exact two fields `classifyDepotError` reads and
  `(err as Error).message` drops — capped at `FAILURE_LOG_CAP = 10` with an
  explicit suppression line;
- the throw site logs the **failure count**, the **classification key** (the only
  log-visible way to tell the UNCLASSIFIED generic bucket from a real signature
  match) and the first raw failure.

Tests T-D1..T-D4 + 8 `describeDepotFailure` cases, all RED-proved at HEAD
(T-D1/T-D2/T-D4 with genuine assertion failures; T-D3 reds on the missing export
only — import-shape, recorded as the weaker proof it is). T-D2 reproduces the real
defect: it `mkdir`s `master.dat` and lets the real fs raise EISDIR.

## STILL OPEN — why is `master.dat` a directory?

`downloadSingleFile` (`depot.ts:1394`) mkdirs when `file.flags & DIRECTORY_FLAG (64)`.

**Inference supporting flag-64 (not proof):** `reconcile.ts`'s `regularFileVerified`
is fail-closed (`if (!st.isFile()) return false`), so had `master.dat` been a
regular-file entry, the 19:03 retry would have re-queued it, hit EISDIR, recorded a
failure and written `StateFlags=1026`. The ACF says `4`. That is consistent with
flag 64 being set: mkdir "succeeds", `directoryVerified` passes on retry, no failure
is recorded, and the gate legitimately writes 4 over a game missing its largest file.

**Decisive test, NOT run:** fetch depot 38415's manifest and read `master.dat`'s
`flags`. Needs a live authenticated Steam CM connection on the user's real account —
deliberately not taken without authorisation. The alternative mechanism
(`mkdir(dirname(dest))` at `:1389` creating `master.dat` for a child entry) is not
excluded.

A re-drive now has the instrumentation it lacked on Aug 27.
