---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 04
subsystem: build-and-release
tags: [itad, esbuild-define, release-workflow, secrets]
requires: []
provides:
  - itadKeyDefineFlag esbuild define helper
  - meta/buildSidecar.ts dev bundle with key define
  - resolveBuiltInItadKey (env > baked, null when absent)
  - release-tauri.yml ITAD_API_KEY fail-fast and step-scoped secret
affects: [47-05, 47-06]
tech-stack:
  added: []
  patterns: [esbuild define with typeof guard, step-scoped secret env]
key-files:
  created:
    - meta/buildSidecar.ts
    - meta/__tests__/itadKeyDefine.test.ts
    - src/backend/storeSearch/itadKey.ts
    - src/backend/storeSearch/__tests__/itadKey.test.ts
  modified:
    - meta/esbuildWorkerBundleShared.ts
    - meta/buildSidecarSea.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - package.json
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts
decisions:
  - "Define kept out of seaEsbuildFlags() so meta worker bundles never carry the key"
metrics:
  tasks: 2
  files: 10
completed: 2026-11-14
---

# Phase 47 Plan 04: ITAD key build/runtime plumbing Summary

An `ITAD_API_KEY` esbuild define now reaches both the dev (`build:sidecar`) and SEA sidecar bundles. A runtime resolver prefers `GAMELIB_ITAD_API_KEY` over the baked key. The release workflow fails before the SEA build when the secret is missing.

## Tasks

1. Define helper, dev and SEA bundles, resolver: commit 9317ffa80.
2. Release workflow fail-fast and pins: commit 0bfc8fc7e.

## Verification

- Meta and Backend jest runs pass, including moduleStateCensus; `pnpm codecheck` is green.
- `pnpm build:sidecar` exits 0 keyless. The `__ITAD_API_KEY__` grep count is 0, but only because nothing imports `itadKey.ts` yet. The count will become meaningful once Plan 47-05 wires the adapter.
- releaseWorkflow.test.ts passes with 5 new pins (114 tests).
- The key value was never printed, logged or committed.

## Deviations from Plan

None - plan executed as written.

## Self-Check: PASSED
