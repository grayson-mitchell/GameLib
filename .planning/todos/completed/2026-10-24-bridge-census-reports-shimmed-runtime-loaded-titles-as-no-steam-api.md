---
created: 2026-10-24
title: "bridge-census reports shim-placed runtime-loaded titles as no-steam-api, inflating the covered count"
source: pnpm bridge-census run, 2026-10-24 (284100 hand test follow-up)
area: steam-bridge
files:
  - meta/bridgeCensus.ts
severity: major
platform: any
ready: code
---

`pnpm bridge-census` (2026-10-24) classified Unclaimed World (284100) as `no-steam-api`, with the
detail "launch exe imports no steam_api and none ships in the install tree". That is false. The
install ships `steam_api.dll` and `steam_api64.dll`, loaded at runtime through `CSteamworks*.dll`,
and the live launch log for the same title records a runtime-loaded miss. Twelve other bridge
titles carry the identical detail: 1119730, 1167950, 1284190, 1363080, 1603180, 1691190, 1782460,
219990, 3410180, 427410, 648800 and 284100 itself.

Cause, read from the code: `findRuntimeSteamApiDll` (`meta/bridgeCensus.ts:762`) adds a
`steam_api*.dll` only if `!isGameLibShimBytes(...)`. Once the live path has placed the shim over
the game's own DLL, nothing non-shim is left to find. The census reads neither the
`<dll>.gamelib-orig` backup nor the persisted `steam_metadata.json` scan verdict. So
`runtimeLoadedDll` is unset, and the row falls through to `no-steam-api` instead of
`missing-symbols` (the `arch === 'none'` branch at ~300).

This contaminates the headline. `no-steam-api` counts as **covered** (see the covered definition
near line 373), so the run's "15 of 18 symbols covered by the shim" includes titles the shim does
not cover, such as 284100 (12 missing exports) and 1167950 (flat API). That is the D-51-15
closing measurement.

Fix:
1. When an install-tree `steam_api*.dll` is the GameLib shim, treat its presence as "a steam_api
   ships". Prefer the `.gamelib-orig` backup for anything read from the original. Where no backup
   exists (284100's originals were overwritten before backups existed), fall back to the persisted
   `<appId>.bridge.scan` verdict, or mark the row unconfirmed. Never let it read as `no-steam-api`.
2. Add a classifier fixture: a shim-only install tree with a runtime-loaded verdict must not
   classify as `no-steam-api`.
3. Re-run the census and record the corrected covered count.

## Closed 2026-10-24: census no longer reports shim-placed runtime-loaded titles as no-steam-api

Cause: `findRuntimeSteamApiDll` skipped every steam_api*.dll whose bytes were the GameLib shim, so a tree holding only the placed shim looked like "no steam_api ships" and classified `no-steam-api`, a class the census counts as covered. The walk now keeps shim entries with a provenance, mirroring the live `findRuntimeLoadedSteamApiDlls`.

Three shim sub-cases: a valid non-shim `.gamelib-orig` backup classifies exactly as the original would; no backup but a persisted `bridge.scan` verdict classifies `missing-symbols` with the runtime-loaded marker and the persisted missing symbols; neither classifies as the new `unconfirmed` class (routed, never covered, never play-recorded). Static-import titles whose dll beside the exe is the shim read interface versions from the backup, else the persisted verdict.

Corrected live measurement: symbols covered 15 of 18 before, 6 of 18 after (nine titles moved no-steam-api to missing-symbols; none landed unconfirmed).

Not done here: the census still does not run the importer-PE walk, so a runtime-loaded title whose importers the shim fully covers still reads as a marker miss. Also, three titles (1119730, 1363080, 427410) keep `no-steam-api` because their steam_api64.dll sits at depth 6 under Engine/Binaries/ThirdParty/Steamworks, beyond the depth-4 walk the live path also uses; the "none ships" detail is inaccurate for them.
