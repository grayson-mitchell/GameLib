---
created: 2026-10-05T00:00:00.000Z
title: "Phase 34.5 minors: stale keyring token after sign-out, incomplete DXVK/VKD3D restore, vacuous SEND_CHANNELS tests"
area: wine
severity: minor
platform: any
ready: code
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src/backend/sidecar/keyringTokenStore.ts:346-352
  - src/backend/sidecar/keyringTokenStore.ts:528-536
  - src/backend/tools/index.ts:293
  - src/backend/tools/index.ts:311
  - src/backend/tools/index.ts:337
  - src/backend/tools/index.ts:421
  - src/backend/tools/index.ts:442
  - src/backend/sidecar/__tests__/wineToolsFlows.test.ts:122
  - src/backend/sidecar/__tests__/eosOverlayFlows.test.ts:103
---

## Problem

1. **Stale token after sign-out** (`keyringTokenStore.ts`): `invalidateCache()` bumps the epoch but
   keeps `pendingToken`, so a `readToken()` after `clearToken()`/`setToken()` joins a read that began
   before it. A sign-out during a boot read waiting on a Keychain prompt makes the next read return
   the old token.
2. **DXVK/VKD3D restore incomplete** (`tools/index.ts`): `dllsToRemove.concat(...)` result is
   discarded (`:337`), so syswow64 DLLs are never removed on 64-bit prefixes; `reg add/delete` run
   in `forEach(async)` unawaited, so the toggle resolves before overrides are written and
   `wineboot -u` races the deletes.
3. **Vacuous tests**: `wineToolsFlows.test.ts:122,132-134` (and `eosOverlayFlows.test.ts:103,114`)
   assert a local empty `SEND_CHANNELS` literal has length 0; `winetricksInstall` was later added as
   `ipcMain.on` and the test stayed green.

## Failure scenario

See each item.

## Suggested fix

1. Store the epoch with the pending promise and only join when it matches.
2. `dllsToRemove = dllsToRemove.concat(...)`; `for...of` with `await` for the `reg` calls.
3. Assert the module's `listenerRegistry` keys equal `['winetricksInstall']`.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
