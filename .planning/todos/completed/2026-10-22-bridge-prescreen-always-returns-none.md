---
created: 2026-10-22
title: "Bridge pre-install prescreen misses every steam_api*.dll in a subfolder — POSIX basename() on backslash depot paths"
source: phase 51-19 live gate item 6 (ELEX 411300), also seen for Hoard 63000 and XCOM 200510
area: steam-bridge
files:
  - src/backend/storeManagers/steam/depot.ts
severity: medium
platform: any
ready: code
---

`screenDepotPlanForSteamApi()` (`depot.ts`, D-51-06) matches
`basename(file.filename).toLowerCase()` against `steam_api.dll` / `steam_api64.dll`. Depot manifest
filenames use Windows separators (`system\steam_api64.dll`). Node's POSIX `basename()` does not
split on `\`, so the "basename" is the whole relative path and never matches. Every title whose
steam_api DLL is in a subfolder screens as `none`:

- ELEX 411300 (`system\steam_api64.dll`): `prescreenBridgeDepots: appId 411300 result=none`
  (21:13:17)
- Hoard 63000 (`win32\`) and XCOM 200510 (`Binaries\Win32\`): `none`, with `steamApi: "none"`
  persisted in their bridge verdicts.

Only root-level DLLs (the Avernums) screen correctly. The unit tests evidently only use
forward-slash or root-level fixtures.

Impact: the D-51-06/17 x64 pre-install signal never fires for real titles. A 64-bit-only title
without a usable Win64 shim would download into a bridge bottle it cannot run in, which is the
case the prescreen exists to prevent. The persisted `steamApi` field is also wrong for these
titles.

Fix: normalise first, e.g. `basename(file.filename.replace(/\\/g, '/'))`, matching
`pathCollisions.ts`'s `normalizePath`. Add a test fixture with `system\steam_api64.dll` and
`Binaries\Win32\steam_api.dll`. This is the same backslash family as `c1a641a21`
(`resolveBridgeLaunchExe`). Sweep the bridge code for other `basename`/`join` calls on PICS or
depot paths while there.

## Status 2026-10-24: code fixed, close waits on the live check

- **Fix landed** in `2ba070588` (51-22). `depot.ts:955` now reads
  `basename(file.filename.replace(/\\/g, '/')).toLowerCase()`. Fixtures in
  `src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts` cover ELEX
  `system\steam_api64.dll` (x64), XCOM `Binaries\Win32\steam_api.dll` (x86), Hoard `win32\` +
  `win64\` (both), and a `backup\steam_api.dll.bak` negative case (none).
- **Sweep:** 51-22 checked `depot.ts` and `bridge/*`. A later pass (quick 261024-bia, not
  executed) checked the rest of `steam/` and found nothing else to fix. `resolveContainedPath`
  and the `linktarget` path already normalise `\`, `games.ts` gets `exePath` from
  `bridge/launchTarget.ts`, which splits on `\`, and the other files only join local filesystem
  paths.
- **Do not close by hand.** 51-22 keeps this todo pending until a live install shows a
  non-`none` prescreen. 51-30 item 19 moves it to `completed/` if a title with its steam_api DLL
  in a subfolder logs `result=x86|x64|both`. If that title logs `none`, 51-30 records a 51-UAT
  gap instead. `51-30-PLAN.md` refers to this file at its `pending/` path.

## Closed

Closed 2026-10-24, plan 51-30 (51-UAT item 19). Live check: Rogue Waters (appId 1691190) ships `RogueWaters_Data/Plugins/x86_64/steam_api64.dll` in a subfolder and logged `prescreenBridgeDepots: appId 1691190 result=x64 in 5062ms` (08:45:53, 2026-10-24) instead of `none`. Vampire's Fall: Origins (1167950, `..._Data/Plugins/x86_64/steam_api64.dll`) logged `result=x64` (21:45:48, 2026-10-23); Raft, Hell Clock, Ranch Simulator and Abiotic Factor also logged `result=x64` for subfolder DLLs. No subfolder-DLL title logged `none`.
