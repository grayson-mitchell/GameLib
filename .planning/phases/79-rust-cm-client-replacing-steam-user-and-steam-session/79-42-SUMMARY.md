---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 42
subsystem: build / dependencies
tags: [cleanup, supply-chain, sea, steam-cm]
requires: [79-41]
provides: [CF-01 final package deletion]
key-files:
  modified:
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - knip.jsonc
    - meta/buildSidecarSea.ts
    - meta/esbuildWorkerBundleShared.ts
    - meta/steamcmCaptureFixtures.ts
    - meta/gamelibSteamcmCli.ts
    - src/backend/storeManagers/steam/userRedeem.ts
    - src/backend/storeManagers/steam/cm/{SteamCmClient,RustCmClient,steamCmTypes}.ts
  deleted:
    - patches/lzma.patch, patches/steam-user.patch
    - meta/sidecarSeaFsShim.ts
    - meta/steamcmParitySweep.ts, meta/steamcmRefreshParitySweep.ts (+ tests)
    - src/common/typedefs/{lzma,steam-user-cdn-auth-schema,steam-user-content-manifest}.d.ts
    - scripts/steam-appinfo-dump.cjs
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 42: Remove the CM npm clients Summary

steam-user, steam-session, @types/steam-user, lzma and zstddec are gone from package.json and the lockfile (337 deletions, zero additions), with both pnpm patches, the SEA fs shim and the TS-vs-Rust sweeps deleted.

## Commits
- 34d54dd49 remove packages, patches, SEA shim, sweeps, mocks
- 5252f9191 drop the appinfo dump script and dead NDJSON sweep runners
- da6998576 lower the jestMock ratchet for the removed mocks

## Deviations from Plan

**1. [Rule 3 - Blocking] Leftover type-level and runtime references.** `userRedeem.ts` imported `steam-user` at runtime for `EPurchaseResult`, and `cm/SteamCmClient.ts` / `RustCmClient.ts` used its `ProductInfo` / `UserOwnedApps` types. Replaced with a local `EPurchaseResult` const (same 8 values) and `SteamCmProductInfo` / `SteamCmUserOwnedApps` in `steamCmTypes.ts`. Without this the SEA bundle crashed at smoke.

**2. [Rule 3] Test mocks of removed modules.** `jest.mock('steam-user' | 'steam-session')` in six steam test files would throw on a missing module; removed them (and the dead constructor mock). The backend-di jestMock ratchet was lowered to match.

**3. [Rule 3] Dead tooling.** `scripts/steam-appinfo-dump.cjs` (steam-user/steam-session operator script) deleted; `runSteamcmNdjson` / `openSteamcmNdjsonSession` in `meta/gamelibSteamcmCli.ts` had only the sweeps as callers and were knip-dead, so removed. `meta/sidecarSeaFsShim.ts` existed only for steam-crypto (a steam-user dependency); deleted with its `--inject` flag. knip `ignoreDependencies` for lzma/zstddec dropped.

**4.** `GAMELIB_WRITE_STEAMCM_RUST` does not exist in the tree; the capture script keeps its raw Rust capture and says expected.json is now the committed reference.

## Verification
- `pnpm tsc`, `pnpm build:sidecar`, `pnpm build:sidecar-sea` (arm64) and `pnpm smoke:sidecar` pass.
- Jest steam/meta/depotPortComplete suites: 106 suites, 2709 passed.
- Full pre-push chain (codecheck, lint, prettier, i18n --fail-on-update, find-deadcode, boundaries, steam-line-ceiling, backend-di-ceilings, gameinfo-narrowing-ceiling) exits 0 on a `git archive HEAD` export.
- `genI18nGateScope` and `x86CallbackWineHarness` pass on the export: the working-tree failures were not caused by this phase.
- `macowned.rs` `SDK_TEST_APPS` untouched.

## Self-Check: PASSED
