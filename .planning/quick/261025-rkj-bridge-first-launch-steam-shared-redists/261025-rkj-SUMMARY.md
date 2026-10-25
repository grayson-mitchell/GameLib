---
phase: quick-261025-rkj
plan: 01
subsystem: steam-bridge
tags: [steam, bridge, installscript, vcredist, directx, known-fixes]
requires: [261025-mfz]
provides:
  - first-launch install of declared 228980 VC++/DirectX redists in the bridge bottle
  - trusted-only `steamSharedRedists` known-fixes key
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/sharedRedists.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/*.vdf
    - src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/knownFixes.ts
    - src/common/types.ts
    - public/fixes/284100-steam.json (evidence path now points at completed/)
    - src/backend/__tests__/knownFixesLayered.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
metrics:
  completed: 2026-10-25
---

# Quick 261025-rkj: Bridge first-launch Steam shared redists Summary

A bridge launch now downloads the 228980 VC++ and DirectX depots the game's appinfo declares into one shared cache and runs each depot's own `installscript.vdf` entries in the `GameLibSteamBridge-<appId>` bottle under the `redist` status, with HasRunKey marks and a settled ledger so later launches cost nothing.

## Commits

- a8453133f feat: pure installscript parser, classifier and argv builders (Task 1)
- 2f22e5a47 feat: `downloadSharedRedistDepots` plus trusted-only `steamSharedRedists` (Task 2)
- b5ed4a3c3 feat: bottle runner, `fireBridgeWineLaunch` wiring, todo closed (Task 3)

## What was built

- `bridge/sharedRedists.ts`: ordered KV1 tokenizer (keeps duplicate keys, decodes `\\` and `\"`), `parseInstallScript`, classification from the script's own path, HasRunKey and process shape (no depot-id table), Requirement_OS evaluation, containment-checked argv builders, `reg add/query` builders, exit-code policy (3010/1638 accepted for vcredist only), opt-in normaliser, declared-depot filter.
- `depot.ts downloadSharedRedistDepots`: declared `depotfromapp: 228980` depots only; key and manifest requested under owner app 228980 with string GIDs; installscript-only download then classify; full download only for VC++/DirectX or a trusted opt-in. Result is `{ status, depots, failed, skipped }`, every declared id in exactly one bucket. GID index shortcut with the checker's tweak (a cached script that fails to parse drops its index entry and is re-downloaded once, then skipped if still bad). Single-flight per depot.
- `bridge/sharedRedistInstall.ts`: ledger fast path, offline/failed/timeout never settle, HasRunKey query, `wait:false` runs raced against a 5 minute unref'd timer, `reg add /reg:32` mark, never rejects.
- `games.ts`: awaited after `applySteamBridgeKnownFixes`, before `applyBridgeBottleDllOverrides` and the monitor, with a `.catch` that only logs.
- `steamSharedRedists` added to `TRUSTED_ONLY_KNOWN_FIX_KEYS` and `KnowFixesInfo`; stripped from the remote layer.
- Todo `2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md` moved to `completed/` with the closure note and the 229033 (PhysX) and 284100 (declares 228990 and 229004) corrections.

## Verification

- `npx jest src/backend/storeManagers/steam` plus the known-fixes suites, run after the last change: 69 suites, 2593 tests, all passing.
- `pnpm codecheck` clean; `pnpm planning-gates` 12/12; prettier `--check` clean on every written .ts path; eslint 0 errors (remaining warnings are pre-existing in games.ts and games.test.ts).
- The .vdf fixtures are verbatim Valve data and omitted from prettier (`--file-info` reports no parser); the `.planning` todo is prettier-ignored.
- Test hygiene: both new fs-touching tests use a per-test `mkdtemp` under `os.tmpdir()` and remove only that path. Path constants (`steamSupportPath`, `getBottleDir`) are mocked before any cleanup runs. No real network or wine.

## Deviations from Plan

- Fixtures with CRLF in the source dump were committed LF-normalised by git (warning only; the tokenizer treats both as whitespace).
- The ordering test in `games.test.ts` does not assert against `applyBridgeBottleDllOverrides` because that module is not mocked in that file; ordering against the known-fixes applier, the monitor and the wine launch is asserted, and the DLL-override order is by construction in code.
- Assumption A1 (authenticated client gets 228980 keys, as the anonymous probe did) could not be exercised: no real network or credentials were used. On failure the code path files the depots under `failed`, logs, and the launch proceeds.

## Human UAT item (does not block closing the todo)

### 1. Bridge-launch 1363080 or 219990 on this Mac
expected: the Play button shows `Installing Redistributables (...)` with vcredist and DirectX labels; `msvcp140.dll` exists in the bottle's `system32` and `syswow64`; HasRunKey values exist under `HKLM\Software\Wow6432Node\Valve\Steam\Apps\CommonRedist`; a second launch shows no redist step and makes no CM or wine calls for this step.
result: pending

## Accepted risks and limits

- T-rkj-09 (accepted): `runWineCommand` exposes no kill, so a timed-out installer child keeps running in the bottle (possibly alongside the game) until it exits on its own. It is bounded to one per launch by the stop-after-timeout rule, and the child is not held by the sidecar event loop beyond the cleared unref'd timer.
- T-rkj-10 (accepted): a settled ledger does not notice newly declared 228980 depots, because no local copy of the declared list exists without a CM call. Deleting the bottle (which holds the ledger) or changing the opt-in list resets it.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model.

## Self-Check: PASSED

All created files exist and commits a8453133f, 2f22e5a47, b5ed4a3c3 are on branch quick-261002-b63.
