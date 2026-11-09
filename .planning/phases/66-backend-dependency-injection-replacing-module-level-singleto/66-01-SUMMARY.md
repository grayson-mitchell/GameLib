---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 01
subsystem: backend
tags: [di, process-runner, clock, depcruise]
requires: []
provides:
  - "src/backend/process/ leaf: Clock, tracked/teardown registries, ProcessRunner, AppContext"
  - "depcruise runner-is-a-leaf and runner-no-npm rules"
  - "meta/backendDiCeilings/process.json sanctioned runner entry"
affects: [66-02, 66-03, 66-08]
tech-stack:
  added: []
  patterns: ["per-instance factories, no module state", "argv-only runner with unref'd child, pipes and kill timer"]
key-files:
  created:
    - src/backend/process/types.ts
    - src/backend/process/clock.ts
    - src/backend/process/registry.ts
    - src/backend/process/runner.ts
    - src/backend/process/context.ts
    - src/backend/process/__tests__/clock.test.ts
    - src/backend/process/__tests__/registry.test.ts
    - src/backend/process/__tests__/runner.test.ts
    - src/backend/process/__tests__/context.test.ts
    - meta/backendDiCeilings/process.json
  modified:
    - .dependency-cruiser.cjs
key-decisions:
  - "stdin pipe is unref'd too (not only stdout/stderr) so a running child shows no PipeWrap in getActiveResourcesInfo()"
  - "openDetached gates on deps.platform === 'darwin' only"
requirements-completed: []
duration: 25min
completed: 2026-11-10
---

# Phase 66 Plan 01: Process leaf (clock, runner, AppContext) Summary

`src/backend/process/` now exists as a dependency-free leaf: an injected clock that unrefs by default, per-instance tracked/teardown registries, an argv-only process runner (default 30 s timeout, SIGKILL, all handles unref'd), `runSync`, `openDetached`, and `createAppContext()`. Nothing in production calls it yet.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 Contracts, clock, registries | 1413c022c | 13 tests |
| 2 Runner and createAppContext | 782d204ce | 27 more tests, real children under fake HOME |
| 3 Depcruise leaf rules, ceiling shard | 716051ef6 | `pnpm boundaries` clean |

## Verification

- `pnpm jest src/backend/process` plus `fakeHomeIsolation.test.ts`: 47 passing; `pnpm codecheck`, `pnpm find-deadcode`, prettier: pass.
- Rule bites: with `import 'backend/logger'` appended to `context.ts`, `pnpm boundaries` printed `error runner-is-a-leaf: src/backend/process/context.ts → src/backend/logger/index.ts` (1 error); reverted, no diff left.
- `pnpm backend-di-ceilings` not run: `meta/backendDiCeilings.cjs` (66-02, same wave) is absent. The shard parses with exactly one `sanctioned` key.

## Deviations from Plan

**1. [Rule 1 - Bug] stdin pipe also unref'd.** The plan names only stdout/stderr; the open stdin PipeWrap would have shown in `getActiveResourcesInfo()` and held the loop, failing the exit-contract test. Fixed in `runner.ts` (`unrefChild`). Commit 782d204ce.

**2. Minor:** single `child_process` import line using inline `type ChildProcess` (acceptance grep demands exactly one declaration); `tsc` strictness required `?.` on two test index accesses.

Note: running `pnpm boundaries` triggered a pnpm prepare/install lifecycle (husky, download-helper-binaries); no tracked files changed.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register.

## Self-Check: PASSED

All created files exist; commits 1413c022c, 782d204ce, 716051ef6 exist.
