---
phase: 62-module-boundaries-and-decomposition
plan: 06
subsystem: backend/storeManagers/steam
tags: [refactor, mechanical-lift, decomposition, games.ts]
requires: ["62-05"]
provides:
  - steam/gameEligibility.ts (11 eligibility methods as free functions taking steamGame)
  - steam/gameInstall.ts (20 install methods as free functions taking steamGame)
affects: [62-07, 62-08]
tech-stack:
  patterns: [this->steamGame parameter lift via TS compiler API, one-line delegating stubs, type-only import of the class]
key-files:
  created:
    - src/backend/storeManagers/steam/gameEligibility.ts
    - src/backend/storeManagers/steam/gameInstall.ts
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
    - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
key-decisions:
  - "Async method stubs are NOT marked async: they return the free function's promise. An async wrapper adds microtask ticks and flipped the games.test.ts single-flight race (second install() entered after the first download settled). Non-async stubs keep the pre-lift tick count."
  - "crossoverRequiredError's lifted parameter is _steamGame (never reads the instance; lint no-unused-vars)."
metrics:
  tasks: 2
  commits: 2
  completed: 2026-11-06
---

# Phase 62 Plan 06: Eligibility and install lifts Summary

Eligibility (11 methods) and install (20 methods) left the SteamGame class via the D-06 mechanical `this` -> `steamGame` lift; each method keeps a same-signature one-line delegating stub. `games.ts` went 6,272 -> 4,666 lines (-1,606 across both commits; install alone -1,523). `gameInstall.ts` is 1,788 lines, `gameEligibility.ts` 166. `games.test.ts` is byte-unchanged and green (except its one pre-existing failure).

Note: the plan's "at least 1,700 lines" install criterion was not reachable (install cluster is ~1,520 lines net of the 20 stubs); the plan's ~1,900 estimate counted the gaps and JSDoc that stay with the stubs.

## Commits

| Commit | What |
| ------ | ---- |
| 12f52b9d2 | eligibility cluster -> gameEligibility.ts |
| 26aa21316 | install cluster -> gameInstall.ts |

## Lift script (not committed)

`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/97877ddf-16d6-4cfb-9967-acbe0e3b8e56/scratchpad/lift.cjs`

Usage: `node lift.cjs <games.ts> <target.ts> "<header comment>" name1,name2,...` (run from the steam dir). It enforces L6/L6b (stops on nested-function `this`, `arguments`, free-symbol or `SteamGame` use), rewrites `this` via ThisKeyword nodes, dedents (skipping template-literal text), builds stubs, strips `private` from reached members, builds the new module's imports and prunes games.ts imports. Caveats seen: it can import a name that is only a shadowing local (it pulled `resolve` into gameEligibility.ts and `bridgeRoute` into gameInstall.ts; both removed by hand, the latter would have broken L5), and it leaves unused-parameter cases (`_steamGame`) to lint. Always run prettier, codecheck and lint after it.

## Members de-`private`d (L4) — 62-08 files the re-narrowing todo

Eligibility commit: `appId`, `fetchMetadataIfNeeded`, `isBottleEligibleFromPlatforms`, `isForcedWindowsViaBottle`, `isBottleEligible`, `assembleBridgeRouteInput`, `bridgeRoute`, `ensurePlatformsCaptured`.

Install commit: `removeDemotedNativeOrphan`, `installNative`, `hasBottledSteamCopy`, `installBottleNative`, `crossoverRequiredError`, `ensureBuiltInEngineForInstall`, `installBridgeGame`, `provisionBridgeBottleForInstall`, `restorePinEngine`, `resolveInstallEngineSettings`, `installBridgeGameLeased`, `persistBridgeDrmSignal`, `reconcileBridgePrescreen`, `resolveBridgeGameInstallRoot`, `markBridgeGameInstalled`, `installDepotDownload`, `runNativeDepotDownload`, `installResultForRefusal`, `runNativeDepotDownloadLeased`, `clearStaleBridgeVerdict`, `prefetchBridgeDrmDownloads`.

## Deviations from Plan

**1. [Rule 1 - Bug] Async stubs dropped `async`.** Found when games.test.ts "two overlapping installDepotDownload calls ... exactly ONCE" went red after the eligibility lift (extra microtask hops from `async` stub wrapping). Fix in the lift recipe: stub returns the free function's promise. Re-lifted; test green with games.test.ts unchanged.

**2. [Rule 3 - Blocking] Source-scan tests repointed (not games.test.ts).** These read `games.ts` text for bodies that moved: `metadataCapture.test.ts` (4 gates, eligibility), `steamAuthSessionPolicy.test.ts` (Rules E and I: `acquireAuthenticated(` allow-list and `allowLogon: true` now in `gameInstall.ts`), `installLocation.test.ts` (C-01 UnsafeInstalldirError handler now in `gameInstall.ts`). Each assertion is the same, pointed at the new owner; committed with the lift that moved the code.

**3. [Rule 3] `crossoverRequiredError(_steamGame)`** underscore-prefixed (lint).

## Verification

- `pnpm codecheck` green; `pnpm lint` 0 errors; `pnpm boundaries` green (16 known, ratchet 136/65, `games-split-modules-are-leaves` 0); `pnpm find-deadcode` green (44 / 0); prettier --check clean; no baseline edits needed.
- `gameInstall.ts` has 0 references to `gameEligibility` (L5).
- Full jest run: only pre-existing/environmental failures remain (see `deferred-items.md`, 62-06 section, plus the four 62-05 items).

## Cleanup candidates (for 62-08)

- Re-narrow `private` on the de-privated members (list above).
- `steamAuthSessionPolicy.test.ts` / `metadataCapture.test.ts` negative scans should widen to all `game*.ts` modules.
- The plan's `buildSteamProtocolUrl`-style comment references to "games.ts" inside lifted comments are now slightly stale.

## Threat Flags

None. No new input path; bodies moved with only `this` -> `steamGame` substitution.

## Self-Check: PASSED

gameEligibility.ts and gameInstall.ts exist; commits 12f52b9d2 and 26aa21316 in `git log`.
