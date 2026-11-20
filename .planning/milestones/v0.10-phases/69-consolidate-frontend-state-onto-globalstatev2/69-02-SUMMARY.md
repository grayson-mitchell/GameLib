---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 02
subsystem: meta-gates
tags: [ratchet, ci, jest-ceilings]
requires: ["69-03"]
provides:
  - "pnpm frontend-context-ceiling shrink-only ratchet over ContextProvider imports"
  - "frontend jestMock ceilings re-sharded by area"
affects: [69-07, 69-08, 69-09, 69-11, 69-15, 69-20, 69-21, 69-22, 69-23, 69-24]
key-files:
  created:
    - meta/frontendContextCeiling.cjs
    - meta/frontendContextCeiling/*.json (15 shards)
    - meta/__tests__/frontendContextCeiling.test.ts
    - meta/__tests__/frontendContextCeilingWiring.test.ts
    - meta/backendDiCeilings/frontend-*.json (12 shards)
  modified:
    - meta/backendDiCeilings/src.frontend.json
    - package.json
    - .husky/pre-push
    - .github/workflows/lint.yml
decisions:
  - "Metric: ImportDeclaration / export-from nodes resolving to src/frontend/state/ContextProvider (AST); comments score 0"
  - "Floor DEFAULT_MIN_FRONTEND_FILES = 228 (455 non-test files scanned 2026-11-10)"
  - "Shard membership is enforced by path prefix in the script (wrong-shard check)"
metrics:
  completed: 2026-11-10
  tasks: 3
---

# Phase 69 Plan 02: Frontend ContextProvider ratchet Summary

Shrink-only AST ratchet (no update flag) pinning 124 ContextProvider importer files, wired into package.json, lint.yml and pre-push line 2, plus frontend jestMock ceilings split into area shards.

## Commits

- c3d15ccc9: ratchet script, 15 shards, unit tests (36 cases)
- f28372f55: wiring (package.json, pre-push line 2, lint.yml) + wiring test
- db8a136fe: re-shard of backendDiCeilings frontend entries

## Measurements

- Census total 124 files / 124 imports, equal to the expected 124; no drift. Per shard: app 1, state 1, hooks 3, components-ui 19, navshell 8, settings-components 39, settings-sections 10, library 9, installmodal 7, game 7, downloads 4, console 3, login 5, webview 2, other 6.
- Scanned non-test frontend files: 455.
- jestMock entries: 122 in src.frontend.json before; 113 moved across 12 new shards + 9 remaining = 122 after. Merged totals unchanged (gate PASS: jestMock=2582 over 454 files).
- New backendDiCeilings shards created: frontend-state (2), -hooks (5), -components-ui (17), -components-ui-navshell (20), -screens-settings-components (7), -screens-settings-other (16), -screens-library (7), -screens-library-installmodal (1), -screens-game (17), -screens-login-webview (13), -screens-downloads-console (2), -screens-other (6). All 12 exist.
- `.husky/pre-push` is not prettier-ignored (`inferredParser: null`, `ignored: false`) but has no parser; only json/yaml/test files were checked.

## Rule for later plans (R3)

No new jest.mock under src/. When a converted test's jest.mock count drops, lower its entry in its frontend-* shard (remove at 0) in the same commit. Parallel plans in one wave own disjoint frontend-* shards. Likewise remove a file's meta/frontendContextCeiling/<area>.json entry in the same commit as its ContextProvider import (delete the shard file when empty). Plan 69-24 deletes the gate.

## Deviations from Plan

None - plan executed as written. (A wrong-shard-path check and `--root`/`--baseline-dir` CLI flags were added for fixture testing.)

## Verification

pnpm frontend-context-ceiling and pnpm backend-di-ceilings PASS; Meta tests for both gates, wiring, steamLineCeilingWiring and tsconfigMeta pass. Full `pnpm lint`/`codecheck` were not run (only meta/JSON/CJS files changed).

## Self-Check: PASSED
