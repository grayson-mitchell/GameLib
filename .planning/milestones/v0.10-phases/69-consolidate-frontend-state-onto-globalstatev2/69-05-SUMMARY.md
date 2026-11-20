---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 05
subsystem: frontend-state
tags: [zustand, storeKit, rename]
requires: [69-01, 69-02, 69-04]
provides: [uiState store with subscribe + reset registration]
affects: [69-06, 69-16]
key-files:
  created: [src/frontend/state/uiState.ts, src/frontend/state/__tests__/uiState.test.ts]
  modified: [~28 importers, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json]
decisions:
  - "gameOverrides keeps its create-time read (timing preserved per R1)"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 05: GlobalStateV2 to uiState Summary

GlobalStateV2.ts renamed (git mv) to uiState.ts and rebuilt on storeKit (subscribeWithSelector, callable hook with subscribe, registerStoreForReset); every importer repointed with identical field reads.

## Commits
- 465fdb8a9: single commit for Tasks 1 and 2. They could not be split: the rename breaks every importer until they are repointed, so a Task-1-only commit would not typecheck.

## Tests
- New uiState.test.ts (zero jest.mock; supplies a stub `window.__TAURI_INTERNALS__` before a require, because the node-env frontend project has no jsdom and frontend/helpers attaches window.api at module scope). Covers initial values, modal actions, refreshWineVersions toggle, subscribe selector.
- Existing tests (deleteButtonReachability, EngineOverride.save, SettingsButton, both useSettingsContext tests) were path-renamed only inside existing jest.mock calls; none converted, so no ceiling shard changed.

## Deviations
- [Rule 3] Also updated path references to the old file in meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json (kept sorted), meta/frontendContextCeiling.cjs message and its test fixture, storePolicy.ts and storeKit.ts comments, .github/copilot-instructions.md, so `grep GlobalStateV2 src/` is zero.
- knip baseline needed no change.

## Gate status
Frontend jest 310/310 green, codecheck, backend-di-ceilings, frontend-context-ceiling pass. `pnpm lint` and `pnpm find-deadcode` fail only on pre-existing meta/rerender/* files from 69-04 (eslint tsconfig does not include them; knip exports/unlisted in fakeApi.ts, rerender.perf.tsx, syntheticLibrary.ts). Not caused by this plan; not fixed.

## Self-Check: PASSED
