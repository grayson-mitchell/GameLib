---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 09
subsystem: testing
tags: [jest, sidecar, bootFresh, di, flows-tests]
requires:
  - phase: 66-04
    provides: bootFresh() harness helper
  - phase: 66-06
    provides: reuseRegistry option and per-file freshRegistry()/boot() pattern
provides:
  - "appShellFlows on one fresh boot per case, no isolateModules"
  - "rustInvokeChannel and devSecretVault wiring cases on one fresh boot per case"
  - "clipboardFlows, steamFocusRefreshWire, loggerCallSiteGuard confirmed free of any sidecar boot"
affects: [66-08]
key-files:
  modified:
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/sidecar/__tests__/devSecretVault.test.ts
    - src/backend/sidecar/__tests__/rustInvokeChannel.test.ts
    - src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts
    - src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts
    - src/backend/sidecar/__tests__/clipboardFlows.test.ts
key-decisions:
  - "appShellFlows: per-file freshRegistry() + boot() = bootFresh({ reuseRegistry: true }); the former jest.isolateModules cases (which never boot, they call registerAppShellFlows directly) use a local inFreshRegistry() = resetModules + fn, labelled no-boot"
  - "gamesConfigPath is read from the fresh registry: the static import resolved to a different HOME than the registry a boot sees, so the CR-04 lock file was invisible to handleExit"
requirements-completed: []
duration: 45min
completed: 2026-11-10
---

# Phase 66 Plan 09: flows-4 tests onto bootFresh Summary

Six suites no longer re-enter boot inside one module registry. `appShellFlows` (47 cases), `rustInvokeChannel` (9) and the two wiring cases in `devSecretVault` boot once per case via `bootFresh`; the other three never boot.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 appShellFlows | 8ad2c2e5f | 47 passed (47 before) |
| 2 devSecretVault, rustInvokeChannel, loggerCallSiteGuard, steamFocusRefreshWire, clipboardFlows | 193f1d307 | 52 passed (52 before) |

## Approach

- appShellFlows: top-level imports of mocked or registry modules became `let` handles rebound in `freshRegistry()` (bootstrap required first), run first in the outer `beforeEach`; every `startSidecar()` is `boot()`. The 11 `isolateModules` scopes load modules fresh and call `registerAppShellFlows()` directly (no boot), so they became `inFreshRegistry()` with a "no boot" label. The once-per-process `frontendReadyBootWorkDone` property is still proven: CR-02 delivers `frontendReady` twice into one fresh registration and asserts `initQueue` ran once. Per-case fresh registries also remove the order coupling the old comments worked around.
- rustInvokeChannel: `bootFresh()` per case, `sidecarRpc` required after boot (`freshRpc()`).
- devSecretVault: the two bootstrap-wiring cases build a fresh registry, re-spy logger/vault/token/Humble stores there, then `bootFresh({ reuseRegistry: true })`. Task-1 cases never boot.
- clipboardFlows, steamFocusRefreshWire, loggerCallSiteGuard never called init/startSidecar (they use `register*Flows`/`startRpcServer`/`initHeadless`); only prose was reworded, and the two loggerCallSiteGuard isolate scopes carry "no boot" comments.

## jest.mock accounting

Net 0. `sidecar-tests-flows-4.json` unchanged (jestMock=33, 6 files); shard PASS.

## Deviations from Plan

**1. [Rule 1 - Bug] gamesConfigPath from the fresh registry**
- **Found during:** Task 1
- **Issue:** the static `gamesConfigPath` import differs from the path a freshly booted registry uses, so CR-04's lock file was not seen and no quit dialog was raised (3 cases failed).
- **Fix:** read it in `freshRegistry()`; `lockFile` is built in the describe's `beforeEach`.

The plan suggested rewriting the `isolateModules` cases onto a real boot driven twice; they were kept as direct-registration cases (no boot) because they never booted, so there was no re-entry to remove.

## Wave-end gate (run after 66-05..07 on main)

- `pnpm backend-di-ceilings`: PASS (moduleState=308, childProcess=32, jestMock=2582, sanctioned=2).
- `pnpm jest src/backend/sidecar/__tests__`: 106 of 107 suites pass, 2992 of 2993 tests. The single failure is the known pre-existing `testContainment.test.ts` T-34.2-83 (unclassified `outboundHttpRegistry.test.ts`), already in deferred-items.md.
- Late-async leak reported, not fixed: 14 "Cannot log after tests are done" console.info warnings across the full run, from `downloadQueueFlowRegistration` (the boot-time auto-resume notice fires on setImmediate after the last case of a suite). Seen in installFlows (66-07) and now also in appShellFlows and devSecretVault; none fail a test. appShellFlows did not show it before this plan.

## Known Stubs

None.

## Threat Flags

None. No production file changed; containment setup untouched; env/vault paths still set per case.

## Self-Check: PASSED

Commits 193f1d307 and 8ad2c2e5f exist; all six suites pass; prettier and eslint (warnings only) clean.
