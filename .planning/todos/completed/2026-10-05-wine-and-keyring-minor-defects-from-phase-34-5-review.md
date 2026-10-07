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

## Resolution (2026-10-05)

All three items reproduced and are fixed.

**1. Stale keyring token after sign-out.** `pendingToken` now holds `{ epoch, promise }`.
`readToken()` joins an in-flight fetch only when its epoch matches the current `cacheEpoch`, and
the `finally` clears `pendingToken` only when the entry is still its own. Without that second
check, a superseded read could clear a newer read's entry. `pendingAvailable` was left alone: it is
not in this todo, and a stale `isAvailable()` answer exposes no secret.
- RED: a new test in `keyringTokenStore.test.ts` runs an in-flight `getToken()`, then a failed
  `clearToken()`, then a second `getToken()` before the first settles. On the unchanged code it got
  `"pre-signout-token"` where `"post-signout-token"` was expected.
- GREEN: the suite passes 80/80.

**2. DXVK/VKD3D restore.** `dllsToRemove = dllsToRemove.concat(...)` now keeps the syswow64 paths.
Both the `reg delete` loops (restore) and the `reg add` loops (backup) are now sequential awaited
`for...of` loops, so `wineboot -u` starts after every delete and `installRemove` resolves after
every add. The 32-bit and 64-bit loops were merged into one list each.
- RED: new suite `tools/__tests__/dxvkInstallRemove.test.ts`. `runWineCommand` is mocked, and the
  prefix and tools tree are real `mkdtemp` directories. No wine or reg runs. Against the unchanged
  code all 3 tests failed: the syswow64 DLL still existed, `wineboot -u` started (event index 4)
  before the last `reg delete` finished (index 5), and 0 `reg add` had finished when the call
  resolved.
- GREEN: 3/3 pass.
- `dxvkEvidenceLines.test.ts` fact 7 pinned the old un-awaited `forEach(async ...)` shape. Its own
  comment asked to revisit it if the loops were ever awaited, and it went red as intended. It now
  pins the awaited loop shape, using positive assertions only, as that file's header requires.

**3. Vacuous SEND_CHANNELS tests.** `wineToolsFlows.test.ts` and `eosOverlayFlows.test.ts` now count
`listenerRegistry` entries before and after their `register*Flows()` call. The wine test asserts
the channels added equal `['winetricksInstall']`, and the EOS test asserts they equal `[]`.
- RED, by mutating the product code: a temporary `ipcMain.on('mutantSend', ...)` in
  `registerWineToolsFlows()` failed the new assertion and nothing else (1 failed, 25 passed). The
  file was then restored byte-for-byte.
- GREEN: both suites pass, 50/50.

**Checks.** `pnpm codecheck` exits 0. `npx eslint` on the touched files: 0 errors. Its warnings are
all on lines this change did not touch. `npx prettier --check` passes on every touched `.ts` file.

**Not verified.** There was no live app run: no real Keychain prompt during sign-out, and no real
DXVK toggle on a Wine prefix.
