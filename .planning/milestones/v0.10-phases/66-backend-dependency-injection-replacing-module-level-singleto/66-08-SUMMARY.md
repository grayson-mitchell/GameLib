---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 08
subsystem: sidecar-boot
tags: [di, bootstrap, boot-steps, one-shot-latch, test-harness]
requires: [66-01, 66-03, 66-04, 66-05, 66-06, 66-07, 66-09]
provides:
  - "bootstrap.ts boot as one ordered list of named steps (BOOT_STEP_NAMES, buildBootSteps)"
  - "bootSidecar(ctx, input, output) with a one-shot latch; init() builds the AppContext once"
  - "bootFresh() on a fresh createTestContext() per case"
affects: [meta/backendDiCeilings/sidecar.json]
tech-stack:
  added: []
  patterns: ["ordered named boot steps over an explicit AppContext", "one sanctioned boot-entry let"]
key-files:
  created:
    - src/backend/sidecar/__tests__/bootSourceShape.test.ts
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts
    - src/backend/sidecar/__tests__/rosettaPlatformGate.test.ts
    - src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
    - src/backend/sidecar/__tests__/playtimeQueueBootDrain.test.ts
    - meta/backendDiCeilings/sidecar.json
key-decisions:
  - "27 named steps in today's exact order; outbound-http-tracking is step 1 (it precedes the logger today)"
  - "init stays synchronous; buildBootSteps is kept LAST in the file so bootstrapWirings' slice-from-`export function init(` source gate still sees every step call in order"
  - "bootstrap.ts is a sanctioned boot-entry (moduleState 1), not an ordinary entry of 17"
requirements-completed: []
duration: ~75min
completed: 2026-11-10
---

# Phase 66 Plan 08: Boot as ordered steps, one-shot latch Summary

Sidecar boot is now 27 named steps run in order by `bootSidecar(ctx, input, output)` over an AppContext built once; the 16 once-guard booleans and the `i18nReady` module promise are gone, a second boot throws naming D-08, and `bootstrap.ts` moved from a 17-count moduleState entry to a sanctioned boot-entry of 1.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1. Ordered step list, guards and module i18nReady deleted | 5e12362bc | `BOOT_STEP_NAMES`, `buildBootSteps()`, `BootState.i18nReady`; `checkRosettaWhenMac(i18nReady)` |
| 2. One-shot latch and AppContext wiring | 012e7df47 | `let booted`, `bootSidecar`, `resolveAppPaths`, `createBackendLogSink`; steps read `ctx.paths`; ceilings moved to sanctioned |
| 3. Harness on createTestContext, boot assertions, smoke | e8bbeac5f | `bootFresh` boots on a fresh test context; `startSidecar` deleted; new D-08 cases and `bootSourceShape.test.ts` |

Callers of the changed exports (grepped across `src/` and `meta/`): `checkRosettaWhenMac` is called only from the rosetta boot step and `rosettaPlatformGate.test.ts` (updated to pass `Promise.resolve()`); `rosettaBootWiring.test.ts` reaches it only through the boot and needed no edit. `reconcileStoreUsersWhenOnline` never read `i18nReady`, so it keeps its signature. `src/sidecar/index.ts` is untouched.

## Verification

- `pnpm codecheck`, `pnpm boundaries`, `pnpm backend-di-ceilings` (PASS, `sanctioned=3`) green.
- `pnpm jest src/backend/sidecar/__tests__`: 3003 passed, 1 failed (the known testContainment T-34.2-83 / outboundHttpRegistry item).
- `pnpm build:sidecar && pnpm smoke:sidecar`: `PASS: built, started, wrote __GAMELIB_SIDECAR_READY__, no swallowed early-boot fault, exited 0 on stdin EOF.` (1.29 s wall for the smoke).
- Prettier clean over every touched path. `sidecar-tests-boot.json` unchanged: no `jest.mock` added anywhere (net 0).
- `pnpm find-deadcode`: no finding from this plan; two pre-existing in `recent_games.ts`. `pnpm lint` and `pnpm test:ci` still fail on items outside this plan (see Deferred).

## Deviations from Plan

**1. [Rule 3 - Blocking] Pre-existing codecheck errors from 66-04** — `bootstrapUserReconcile.test.ts` (circular `World` type) and `playtimeQueueBootDrain.test.ts` (seed param type) failed `pnpm codecheck`, which every task's verify requires. Fixed with an explicit `World` interface and a loosened seed param. Commit 5e12362bc.

**2. [Rule 1 - Bug] installFlows booted twice in one case** — "setting unset follows enableSteamNativeInstall" called `bootFresh({reuseRegistry:true})` twice in one registry, which the new latch correctly rejects. Split into two one-boot cases. Commit 012e7df47.

**3. [Rule 3] testContainment classification** — a new `*.test.ts` must be classified or T-34.2-83 gains a second unclassified file; added `bootSourceShape.test.ts` to `STRUCTURALLY_CONTAINED_SUITES` (reads source text only). Commit e8bbeac5f. Does not touch the known `outboundHttpRegistry.test.ts` failure.

**4. [Rule 3] knip** — `BOOT_STEP_NAMES`, `bootSidecar`, `resolveAppPaths` and four helper exports consumed only via `require()` in tests tripped `find-deadcode`; tagged `@public` with the reason. Nothing added to the knip baseline.

**5. Task 1/2 boundary** — Task 1's `init` already builds the context via `createAppContext` (a no-latch version) so the step signature is real; Task 2 added the latch, `resolveAppPaths` and `ctx.paths` reads. The shard file `sidecar-tests-boot.json` was not modified because no count changed.

**6. Rosetta ordering case** uses `jest.replaceProperty` on `constants/environment`.`isMac` plus a `jest.spyOn` on `checkRosettaInstall` (no `jest.mock`), so it runs on any host OS.

## Wave-3 finding: "Cannot log after tests are done"

Not fixed, recorded in `deferred-items.md`. The notice is a bare `setImmediate` inside `registerDownloadQueueFlows()` that runs at `require('./handlers')` time, i.e. at module import of bootstrap, not in a boot step; the step restructure does not make it awaitable. The count varies per run (14, 10, 10, 0 observed). Fix belongs in `downloadQueueFlowRegistration.ts`; console was not silenced.

## Deferred Issues

All in `deferred-items.md`: the Cannot-log cause above; 20 pre-existing `pnpm lint` errors (19 in `bootstrapUserReconcile.test.ts` from 66-04, 1 in `process/runner.ts`); 2 pre-existing knip findings in `recent_games.ts`; 8 `pnpm test:ci` suites failing outside this plan's files (testContainment, tauriShellSource, macArchKnownFixRouting, gamelibCatalogParity, genI18nGateScope, lintTranslations, logSecretGate, x86CallbackWineHarness).

## Known Stubs

None.

## Threat Flags

None. No new handles or in-flight work; step bodies moved verbatim (T-66-25); second boot throws (T-66-26); secret-store/online-monitor/rosetta/READY order pinned by `BOOT_STEP_NAMES` and the anchor test (T-66-27); logger step still binds the processGuards sinks once (T-66-28); harness `userData` stays under the per-case fake HOME and is disposed after each test (T-66-29).

## Self-Check: PASSED

- FOUND: src/backend/sidecar/__tests__/bootSourceShape.test.ts
- FOUND commits: 5e12362bc, 012e7df47, e8bbeac5f

## Post-execution gate fixes

Phase 66 left `pnpm lint` (21 errors) and `pnpm find-deadcode` (2 findings) red; fixed in a `fix(66)` commit.

- `runner.ts`: `kill: base.kill` replaced with `(signal) => base.kill(signal)` (unbound-method); no disable needed.
- `bootstrapUserReconcile.test.ts`: the `*IsLoggedInSpy` bindings existed pre-phase only to `mockRestore()` them (checked against a247fdb7f); no assertions were dropped by the bootFresh migration, so none were restored. Bindings and unused destructures dropped, stub calls kept.
- `bootstrapWirings.test.ts`: a 21st error (`prefer-const` on `deliverUrl`, from 66-04) removed by using the destructured handle directly.
- knip `getRecentGames`/`testingExportsRecentGames`: not lost coverage. steamFlows.test.ts still exercises both; 66-07 moved the import to `require()` inside `freshRegistry()`, which knip cannot see. Added a type-only `import type * as RecentGamesModule` so the static edge is visible. No exports removed, baseline untouched.
