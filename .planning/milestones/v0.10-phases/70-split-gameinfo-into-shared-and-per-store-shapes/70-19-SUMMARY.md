---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 19
subsystem: store-migrations
tags: [gap-closure, g2, wr-04, zod, migration]
requires: ["70-18"]
provides:
  - "Seven GameInfo chains end at v3, each cleaning with stripToSchema(dropInvalidOptional: true)"
key-files:
  modified:
    - src/backend/storeMigrations/gameInfoLibraries.ts
    - src/backend/storeMigrations/index.ts
    - src/backend/storeMigrations/__tests__/gameInfoLibraries.test.ts
    - src/backend/storeVersioning/__tests__/gameInfoLibrariesEngine.test.ts
    - src/backend/__tests__/storeReadOnly.test.ts
  created:
    - src/backend/storeMigrations/__tests__/fixtures/*-wr04-v2.json (7)
requirements-completed: [ARCH-03, ARCH-03.4, ARCH-03.5]
completed: 2026-11-14
---

# Phase 70 Plan 19: gameInfoLibraries v3 schema-derived strip Summary

The hand-rolled key-tree strip is gone. Every GameInfo chain (steam, gog, gog-installed, legendary, nile, sideload, download-manager) is now two steps, v1->v2 and v2->v3, both running `stripToSchema` against the runner's member schema (or the `.shape.install` installed-info schema). Profiles already stamped v2 by 70-15 are re-stripped once, with the engine's pre-migration backup. Nulls on optional keys, undeclared keys in `reqs[]` / `gog_save_location[]` / `perLangSize` values, and legendary `about` missing `description` are cleaned; `dlcList` and legendary `save_path: null` survive.

Forward-compat: a build older than this one sees v3 library files as newer and opens them read-only (Phase 68 D-03), as it already did for v2.

## Commits

- 4af8d0207 feat(70-19): chains rewired onto stripToSchema, v2->v3 steps
- 583694fe4 test(70-19): seven WR-04 fixtures, control/result safeParse tests, v3 pins

## Verification

tsc clean; storeMigrations, storeVersioning and moduleStateCensus suites pass; prettier clean on all written paths; `pnpm gameinfo-narrowing-ceiling` PASS. Full Backend jest still shows 7 failures in unrelated suites (shim symbols, tray/main.rs source gates, epicOfflineMode, HKCU gate): none touch this plan's files.

## Deviations from Plan

**1. [Real-key fixtures vs dropInvalidOptional]** The "real-key survives unchanged" test failed on all seven chains: the 70-13 real-key fixtures redact every value to the string "redacted", and `platform` / `mac_arch` are enums, so `dropInvalidOptional` removed them. Key retention is intact; real data never holds "redacted" there. The plan forbids editing those fixtures or widening a schema, so both are untouched (byte-unchanged). Instead the test substitutes valid enum members (`platform: 'Windows'`, `mac_arch: '64'`) for the redaction string before comparing. Operator may want to confirm this reading; the alternative (dropInvalidOptional false) would defeat the legendary `about` fix.

**2. [Rule 1 - pinned version]** `src/backend/__tests__/storeReadOnly.test.ts` pinned steam_library at v2; moved to v3 (two fixtures plus one expectation). The engine "newer file" test now uses v4.

**3. Acceptance grep** `'[a-z-]+-v2-v3'` literal count is not 7: step ids are built from a prefix via template (`${prefix}-v2-v3`). The ids exist and the chain test asserts `/-v2-v3$/`.

## Self-Check: PASSED
