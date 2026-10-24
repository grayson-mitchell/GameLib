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
