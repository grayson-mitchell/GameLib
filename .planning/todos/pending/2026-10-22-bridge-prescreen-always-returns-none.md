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
