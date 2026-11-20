---
phase: 62-module-boundaries-and-decomposition
plan: 01
subsystem: testing
tags: [dependency-cruiser, import-graph, boundaries, baseline]
requires: []
provides:
  - dependency-cruiser 18.7.2 with five import-graph rules at severity error
  - shrink-only known-violations baseline (16 entries)
  - seeded-violation gate tests proving each rule fires and the baseline cannot grow or go stale
affects: [62-02, 62-03, every later 62 plan that shrinks the baseline]
tech-stack:
  added: [dependency-cruiser@18.7.2 (exact pin, devDependency)]
  patterns: ["error-severity rules + --ignore-known baseline, rewritten only with --baseline-mode shrink-only"]
key-files:
  created:
    - .dependency-cruiser.cjs
    - .dependency-cruiser-known-violations.json
    - meta/__tests__/boundaryGates.test.ts
  modified: [package.json, pnpm-lock.yaml, .prettierignore]
key-decisions:
  - "Rules start at severity error with a baseline (user ruling 2026-11-06, supersedes roadmap warn-only)"
  - "no-circular scoped to the depot subtree only; games-split-modules-are-leaves guards games.ts cycles"
requirements-completed: [D-13, D-14, D-08]
duration: ~25min
completed: 2026-11-06
---

# Phase 62 Plan 01: dependency-cruiser boundary gate Summary

**dependency-cruiser 18.7.2 enforces five import-graph rules at `error`, with 16 pre-existing violations held in a shrink-only baseline and 14 seeded-violation tests proving each rule fires.**

## Task 1: supply-chain checkpoint
Operator replied "approved". The orchestrator verified on the npm registry: repo github.com/sverweij/dependency-cruiser, maintainers sverweij and foureightone, no install/preinstall/postinstall scripts, about 8.1M weekly downloads, 18.7.2 published 2026-11-02. I re-checked `npm view dependency-cruiser@18.7.2` (repository URL and scripts) before installing. The approval reached me through the orchestrator's relay of the operator's reply, not directly. The lockfile diff added only dependency-cruiser's tree plus a postcss patch-level reshuffle.

## Baseline counts (tool-measured, src/backend)
| Rule | Violations |
|---|---|
| no-cross-store-manager | 0 |
| launcher-only-via-store-managers-index | 9 (8 static + dynamic steam/bottle) |
| no-depot-parent-back-edge | 3 (reconcile, pathCollisions, flagsCensus) |
| no-circular-depot | 4 |
| games-split-modules-are-leaves | 0 |

Total 16, in `.dependency-cruiser-known-violations.json`.

## 18.7.2 flags confirmed via `--help`
`--baseline [file]`, `--baseline-mode full|shrink-only|format`, `--ignore-known [file]`. Findings:
- `--baseline` needs the file argument given explicitly. A bare `--baseline src/backend` consumed the path as the filename and wrote nothing.
- `--output-type json` always exits 0, so the tests take the exit status from a separate `--output-type err` run.
- shrink-only exits 0 and leaves a newly added violation out of the rewritten baseline.
- `$1` back-reference in `to.pathNot` works for the cross-manager rule.

## Tests
`meta/__tests__/boundaryGates.test.ts`, 14 cases:
- Each rule fires on a seeded violation (the launcher rule on both static and dynamic imports).
- The test-file exemption, the index import and the type-only import are allowed.
- A new violation is not absorbed by the baseline.
- shrink-only does not grow the baseline.
- A stale baseline is detected (seeded and on the real repo).
- The real repo is clean under `--ignore-known`.

Near-misses were checked manually and reverted:
- Flipping the launcher rule to `warn` fails 2 tests.
- Adding a fake baseline entry fails the real-repo stale-baseline test.

`fakeHomeIsolation.test.ts` (7 tests), `pnpm codecheck`, prettier and eslint are green. The spawn env comes from `createFakeHomeProfile()`.

## Deviations from Plan
None of substance. `pnpm boundaries` and lint wiring were deliberately left for 62-03.

## Commits
- e2a1ce97a chore(62-01): add dependency-cruiser 18.7.2 with import-graph rules and baseline
- 39536b6de test(62-01): seeded-violation gate tests for dependency-cruiser rules

## Self-Check: PASSED
