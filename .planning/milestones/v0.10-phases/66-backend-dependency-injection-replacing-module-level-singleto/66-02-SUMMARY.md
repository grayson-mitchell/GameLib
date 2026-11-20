---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 02
subsystem: tooling
tags: [ratchet, ci-gate, typescript-ast, di]
requires: []
provides:
  - "meta/backendDiCeilings.cjs shrink-only gate (module state, child_process, jest.mock)"
  - "sharded baselines in meta/backendDiCeilings/*.json with sanctioned table and rust-overlap mechanism"
  - "pnpm backend-di-ceilings wired in package.json, lint.yml, pre-push line 2"
affects: [66-03, 66-04, 66-05, 66-06, 66-07, 66-08, 66-09]
tech-stack:
  added: []
  patterns: ["TS compiler API census (no program)", "sharded exact-count baselines, no update flag"]
key-files:
  created:
    - meta/backendDiCeilings.cjs
    - meta/__tests__/backendDiCeilings.test.ts
    - meta/__tests__/backendDiCeilingsWiring.test.ts
    - "meta/backendDiCeilings/*.json (41 shards)"
  modified:
    - package.json
    - .github/workflows/lint.yml
    - .husky/pre-push
key-decisions:
  - "logger/index.ts sanctioned as logger-sink with moduleState 2 (heroicLogWriter, runnerLogWriters)"
  - "no rust-overlap entries: Phase 73 depot files gone; VDF/ACF readers have zero module state and no child_process import"
requirements-completed: []
duration: 40min
completed: 2026-11-10
---

# Phase 66 Plan 02: Backend DI ceilings gate Summary

A shrink-only AST ratchet now holds three exact per-file counts (module state, child_process imports, jest.mock calls) from 41 shards, and `pnpm backend-di-ceilings` runs in package.json, CI and pre-push.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 Census, evaluate, fixture tests | 8fd8365d7 | 78 tests |
| 2 Shards, wiring, wiring test | dde9d226e | gate green, 24 wiring/meta tests |

## Measured numbers (2026-11-10)

PASS line: `moduleState=308 (139 files) childProcess=32 (32 files) jestMock=2582 (454 files) sanctioned=2`.
Scanned 483 non-test backend files and 1,911 src files. Floors: 240 backend, 955 src. Totals include 66-01's process.json (runner.ts sanctioned childProcess 1, counted in the gate); logger/index.ts is sanctioned (2). The plan-time 305/34 figures differ because the census moved with 66-01's new files and the AST (not textual) count.

## Shards

Written set: 41 shards generated here (the plan's 38 area + 5 sidecar-test, listed identically, minus none; no area appeared or vanished): `__tests__, _root, appshell, constants, crossover_index, dialog, downloadmanager, engine, game_overrides, gamedetails, humble, logger, macArch, migration, platform, runsForMe, scanners, shortcuts, sidecar, signInProbe, src.frontend, src.preload, steamgrid, store, storeManagers.{__tests__,gog,legendary,nile,sideload,steam}, storeMigrations, storeSearch, storeVersioning, tools, utils, wiki_game_info, wine, sidecar-tests-{boot,flows-1,flows-2,flows-3,flows-4}`. process.json is 66-01's and was not touched; it loads and validates unchanged.

## Rust-overlap re-check

`steam/depot/` holds no lzma/decompress/download/fileAttributes files. acfState, installedMap, resumeBreadcrumbs, acfInstalldir, cancelDelete, sharedRedists and nonesteamgame all have zero module state and zero child_process imports. The rust-overlap table is empty; the mechanism is fixture-tested.

## Mutation probe

Appending `let __probe = 1` to `src/backend/online_monitor.ts` produced `FAIL: grew: src/backend/online_monitor.ts 8 > baseline 7 (moduleState)`; after revert the gate printed PASS.

## Deviations from Plan

None - plan executed as written. Prettier reformatted the new files (accepted).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Files and commits 8fd8365d7, dde9d226e exist; `pnpm backend-di-ceilings` green with process.json present.
