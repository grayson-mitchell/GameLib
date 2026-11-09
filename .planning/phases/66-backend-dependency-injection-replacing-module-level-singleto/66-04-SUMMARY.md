---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 04
subsystem: testing
tags: [jest, sidecar, bootstrap, di, test-harness]
requires:
  - phase: 66-02
    provides: backend-di-ceilings shrink-only gate (sidecar-tests-boot shard)
provides:
  - "bootFresh() harness helper: one boot per test case in a fresh module registry"
  - "boot-wiring sidecar tests with no repeated init() in one registry"
affects: [66-05, 66-06, 66-07, 66-08, 66-09]
tech-stack:
  added: []
  patterns: ["jest.resetModules() + before() + require('../../bootstrap') per case; mocks and registries read with require() after the boot"]
key-files:
  created: []
  modified:
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
    - src/backend/sidecar/__tests__/engineTempSweepBootWire.test.ts
    - src/backend/sidecar/__tests__/gogPresenceBootWire.test.ts
    - src/backend/sidecar/__tests__/migrationsWiring.test.ts
    - src/backend/sidecar/__tests__/onlineMonitorWiring.test.ts
    - src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
    - src/backend/sidecar/__tests__/playtimeQueueBootDrain.test.ts
    - src/backend/sidecar/__tests__/rosettaBootWiring.test.ts
    - src/backend/sidecar/__tests__/signInProbeBootWire.test.ts
key-decisions:
  - "bootFresh gained an optional injected `output` stream (backward compatible) so tests can record raw lines / the READY write"
  - "Direct-call arms also boot once: the logger is only initialised by a boot, so they read modules from the booted fresh registry"
requirements-completed: []
duration: 75min
completed: 2026-11-10
---

# Phase 66 Plan 04: boot-wiring tests onto bootFresh Summary

`bootFresh()` boots the sidecar once per test case in a fresh module registry, and every boot-wiring test file now uses it instead of re-entering `init()` in one registry.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 bootFresh + onlineMonitorWiring + engineTempSweepBootWire | 010f7d93d | green |
| 2 remaining boot-wiring files | 321a7bb2d | 107 suites run, green apart from one pre-existing failure |

## Scope notes

- `rosettaPlatformGate`, `sidecarStdoutFramesOnly` and `gamelibNamespaceLoad` needed no change: they never call `bootstrap.init` (the first calls `checkRosettaWhenMac` directly, the second uses `isolateModulesAsync` on installRejectionGuard, the third uses `i18next.init`).
- `outputStreamBinding` needed no change: it already uses `jest.resetModules()` against `sidecarRpc` alone and never boots.
- `bootFresh` pins (fresh registry per call, `before` runs pre-boot, live frame stream) live in `onlineMonitorWiring.test.ts` under `describe('bootFresh harness')`; no new test file.

## Converted once-guard assertions (old -> new)

- onlineMonitorWiring: "is idempotent: calling init() again does not re-register ..." -> "one boot registers exactly one connectivity-changed and one set-connectivity-online listener"
- engineTempSweepBootWire: "init() calls the sweep once ... and does not re-run it" -> "one boot calls the sweep exactly once ... survives a throwing sweep"
- signInProbeBootWire: "a second init() in the same module registry neither registers the handler nor starts the pass again" -> "one boot registers the handler and starts the pass exactly once"; the first two cases now boot per case instead of capturing a shared first init
- migrationsWiring: "is once-guarded: a second and third init() does not re-run the migration set" -> "one boot runs the migration set exactly once" (fresh `cp` called once)
- rosettaBootWiring: "is once-guarded: a second and third init() does not re-probe" -> "one boot probes exactly once"
- bootstrapWirings: "REQ-34.2-07 idempotency: two init() calls yield exactly one fetch and one listener" -> "one boot yields exactly one fetch and one listener"
- bootstrap.test: "init() pays a stale owed goonline once ..." -> "one boot pays ..."; "idempotent: a second real boot after the key is already gone logs nothing further" -> "one boot removes the key and logs the receipt exactly once"; token store "init() replaces whatever store was active" -> "one boot replaces the fail-closed module default with the real store" (setTokenStore logs, and the logger is not initialised until the boot, so the sentinel is the pre-boot module default)
- playtimeLockBootClear, gogPresenceBootWire, playtimeQueueBootDrain, bootstrapUserReconcile: wiring-proof cases now "one boot ..."; direct-call arms each boot once and use the booted registry's modules
- Names that still say "init()" in rosetta/shell-exe cases were reworded to "the boot".

## jest.mock accounting

Net jest.mock change: 0. No `jest.mock` added or removed in any file; `sidecar-tests-boot.json` unchanged (`node meta/backendDiCeilings.cjs --shard sidecar-tests-boot` PASS, jestMock=42). Full `pnpm backend-di-ceilings` PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] bootFresh optional `output` option**
- **Found during:** Task 2 (signInProbeBootWire, bootstrap.test raw-line collection)
- **Issue:** READY ordering and raw lines need a caller-supplied stream attached before the boot.
- **Fix:** `bootFresh({ before?, output? })`, default unchanged.
- **Files modified:** helpers/sidecarHarness.ts
- **Commit:** 321a7bb2d

**2. [Rule 1 - Bug in test ordering] Direct-call arms depended on an earlier init()**
- **Found during:** Task 2 (playtimeLockBootClear, gogPresence, playtimeQueue, bootstrapUserReconcile, migrationsWiring)
- **Issue:** With one boot per case the logger is uninitialised in the top-level registry, so direct calls threw. They used to pass only because an earlier case had run `init()`.
- **Fix:** each arm boots once and reads the booted registry's modules (`require` after `bootFresh`); in the online_monitor-mocked files bootstrap is required first inside `before` to avoid a circular import dropping the mock's re-exports.

### Acceptance-grep note

`grep -cE "\binit\("` is not 0 for `bootstrapWirings.test.ts` (source-gate strings that read bootstrap.ts's own `init(` text, which must stay), `gamelibNamespaceLoad.test.ts` (`i18next.init(`), and comment-only mentions elsewhere. No test code calls `bootstrap.init` in these files.

## Deferred Issues

`testContainment.test.ts` (T-34.2-83) fails because `outboundHttpRegistry.test.ts` (commit 371298720, quick-261110-9w2) is not classified in its lists. Pre-existing and unrelated; logged in `deferred-items.md`.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Commits 010f7d93d and 321a7bb2d exist; `pnpm jest src/backend/sidecar/__tests__` green apart from the one deferred failure; prettier clean; `bootstrap.ts` untouched.
