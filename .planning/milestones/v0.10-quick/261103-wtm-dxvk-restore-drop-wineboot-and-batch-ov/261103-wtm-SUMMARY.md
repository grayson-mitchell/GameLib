---
phase: quick-261103-wtm
plan: 01
status: complete
requirements: [G30]
commits: [ff82f781f]
---

# Quick 261103-wtm: DXVK restore drops wineboot -u on an engine flip, batches the override deletes

The strict (engine-switch) DXVK restore now removes the DLLs before its first wine process, so
the automatic prefix update a Staging -> CrossOver flip forces restores the stock DLLs.
`wineboot -u` only runs when a stock DLL is still missing. The per-DLL `reg delete`s are now one
`reg import`, and one `reg query` verifies the result.

## Gate: CrossOver, throwaway bottle `GameLibGateG30` (deleted afterwards)

CrossOver wine.inf mtime 1784047440, Staging 11.20 wine.inf mtime 1793246336.

| Run | Shape | Result |
|-----|-------|--------|
| `run7-final.log` | Staging + DXVK, then CrossOver: rm DLLs, `reg import` (first CX process), `reg query` | import exit 0 in 5.26 s, all 4 stock DLLs **present at import exit**, builtin; ts -> 1784047440; query 0.27 s, 0 d3d lines; user.reg has no d3d overrides after the server stops |
| `run5-import.log` | same, no query | same; missing-file and bad-header imports exit 1 |
| `run4-prod.log` | old order: 2 `reg delete`, rm, `wineboot -u` | 6.0 + 0.36 + 4.73 s; same end state |
| `run6-forced.log` + probes | same engine (ts matches), forged ts | ts 0, 1, 999999999, 1700000000: **no** update; 1784047439/41, 1793246336: update ran |

Findings that shaped the code:

- Without `wineboot -u`, the flip's automatic update restores the stock DLLs, but only when
  they are gone before the first wine process. The old order deleted overrides first.
- Which mismatched timestamps trigger the update is opaque on CrossOver (forged small values
  did not), so the code never writes `.update-timestamp`. It checks whether the DLLs came back
  and runs `wineboot -u` only when they did not. That covers a same-engine restore, the unhealthy-CrossOver
  path through Staging, retries and `disable`.
- Measurement trap: under `CX_BOTTLE`, `wineserver -w` returned before the registry was
  saved, so `user.reg` read straight after showed the overrides still there (runs 2-4). After
  `wineserver -k` they were gone, in every order. Production stops the restore's wineserver
  with a kill (`prepareBottleForEngine`), and the in-process `reg query` reads the live server.
- An import whose names match nothing exits 0, which is the silent no-op the todo warned about.
  The verify query passes only if its output shows the key header and no remaining value, or
  if the key is absent. Empty output fails.

Net on a healthy flip: 2 wine processes (about 5.3 + 0.3 s at exit) instead of 3 (about 6.0 + 0.4
+ 4.7 s).

## Tasks

1. `ff82f781f` `restoreDxvkStrict` (tools/index.ts). The Heroic toggle restore keeps its old
   reg-delete + `wineboot -u` shape, minus the strict conditionals that moved out.
2. `ff82f781f` dxvkInstallRemove.test.ts: 7 new or reworked strict-restore cases.

## Verification

- `npx jest src/backend/tools/__tests__/ src/backend/storeManagers/steam/engine`: 24 suites, 463 tests pass.
- `npx prettier --check` on both files: clean. `tsc --noEmit`: 0 errors. eslint: no new warnings.
- Not done: an in-app engine flip (Play with CrossOver on a pinned bottle) to watch the new
  `Wine stock DLLs restored by the prefix update` log line. The gate exercised the same wine
  commands outside the app.
