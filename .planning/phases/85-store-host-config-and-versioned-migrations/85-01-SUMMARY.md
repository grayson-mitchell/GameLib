---
phase: 85-store-host-config-and-versioned-migrations
plan: 01
subsystem: testing
tags: [conf, golden-fixtures, jest, store-versioning, byte-compatibility, dot-prop]

requires:
  - phase: 84-logger
    provides: the oracle shape this copies (compare by default, write mode under an env flag, prettier-ignored fixture tree)
provides:
  - storeOracle.test.ts, the TS oracle for the store stack (compare mode by default, write mode under GAMELIB_WRITE_STORE_GOLDEN=1)
  - a 66-case byte-exact golden (cases.json, outcomes.json, expected tree, inputs, NOTES.md) generated from the unmodified TS stack
  - shared dot-path (35), JS number text (18) and JS key order (14) vectors produced by conf and JSON.stringify
affects: [85-06, 85-07, 85-08, 85-21, 85-24]

actuals:
  tokens: 70000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Store oracle: real GameLibStore + createStoreRoot under a Date-only fake clock in a mkdtemp userData, files snapshotted and compared as Buffers"
    - "Data-described migration override steps (setTop/deleteTop/throws) so engine cases stay plain JSON and replayable from Rust"
    - "engine cases carry expectPath and the oracle throws when the TS engine takes another path, so a label is checked, never trusted"

key-files:
  created:
    - src/backend/stores/__tests__/storeOracle.test.ts
    - src-tauri/crates/gamelib-store/tests/fixtures/golden/cases.json
    - src-tauri/crates/gamelib-store/tests/fixtures/golden/outcomes.json
    - src-tauri/crates/gamelib-store/tests/fixtures/golden/NOTES.md
    - src-tauri/crates/gamelib-store/tests/fixtures/golden/expected/ (66 case directories)
    - src-tauri/crates/gamelib-store/tests/fixtures/golden/inputs/ (29 migrate inputs)
    - src-tauri/crates/gamelib-store/tests/fixtures/vectors/dotpath.json
    - src-tauri/crates/gamelib-store/tests/fixtures/vectors/numbers.json
    - src-tauri/crates/gamelib-store/tests/fixtures/vectors/keyorder.json
  modified:
    - .prettierignore

key-decisions:
  - "D-05 settled from code: conf stores are tab-indented JSON with the __internal__.gamelib.schemaVersion envelope and no trailing newline; settings documents are 2-space with a top-level version string and no trailing newline"
  - "A migration rewrite is tab-indented for BOTH flavours, so a freshly migrated settings document is tab-indented until the next writeSettingsFile rewrites it with 2 spaces; recorded in NOTES.md as what TS does today"
  - "Corrupt-file cases are recorded oracle: tsOnly with a D-18 divergenceNote; Rust deliberately keeps the bytes, copies aside and opens read-only (user-state) or empty (cache)"
  - "Migrate inputs live in golden/inputs/<id>.json so the golden does not depend on storeMigrations/__tests__/fixtures, which 85-24 deletes"

patterns-established:
  - "Vectors files carry their own inputs (specs in the oracle, mirrored into the JSON), so they survive the oracle's deletion in 85-21"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "A store oracle that drives the real GameLibStore, versioning engine and STORE_MIGRATIONS and compares every produced file and outcome to a committed tree on every run"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/storeOracle.test.ts#store oracle (TS store stack -> committed golden)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 66-case golden covering ops, migrate (every settings and library fixture, a five-round backup sequence), engine paths and settings documents, generated from the unmodified TS stack"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/storeOracle.test.ts (one test per case id, plus the id-list and temp-root tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dot-path (35), number text (18) and key-order (14) vectors produced by conf and JSON.stringify, including a lone-surrogate entry marked rustParse reject"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/storeOracle.test.ts#store oracle vectors (dot paths, number text, key order)"
        status: pass
    human_judgment: false
  - id: D4
    description: "NOTES.md records the two byte flavours, the tab rewrite of migrated settings documents, the fake clock and backup naming, and the deliberate Rust divergences"
    requirement: FND-06
    verification: []
    human_judgment: true
    rationale: "Prose accuracy: the byte rules were read from the code and confirmed by the generated files, but whether the document is complete enough for the Rust replay authors is a reader's judgement"

duration: ~35min (approximate; start time not captured)
completed: 2026-11-22
status: complete
plan_head_before: 1582a61d5c2ffb0d373203a9f5cd74273fd2eb1b
plan_head_after: 258593d2daf93b488e6364e95d0d0ebf2802d8ad
commits: 3
---

# Phase 85 Plan 01: Store oracle and byte-exact golden Summary

**A jest oracle that drives the real conf-based GameLibStore, the Phase 68 versioning engine and the real migration chains to produce a 66-case byte-exact golden plus 67 shared dot-path, number-text and key-order vectors, all before any store TS changes.**

## Performance

- **Duration:** about 35 min (approximate; the start time was not captured)
- **Completed:** 2026-11-22
- **Tasks:** 3
- **Files changed:** 137 (code: 2, fixtures: 135, plus .prettierignore)

## Accomplishments

- The oracle (`storeOracle.test.ts`) compares by default and rewrites the golden only under `GAMELIB_WRITE_STORE_GOLDEN=1`. It runs each case in a fresh `mkdtemp` userData under a Date-only fake clock (2026-11-21 09:00 UTC), snapshots every file as a Buffer, and asserts the file set, each file's bytes and `outcomes.json`. It also asserts no temp root appears in any recorded path or expected file (T-85-02).
- 66 cases: 16 `ops` (dot paths, integer-like keys, envelope position, whole-object assign, dot-notation-off URL keys, a token-bearing file with two declarations, reserved-key refusal, control characters), 29 `migrate` (7 settings fixtures, 7 library chains each from three fixtures, a five-round sequence proving max 3 backups and the newest-equal skip), 14 `engine` (identity, current, newer read-only for user-state/cache/failedView, cache chain deletes, migrates with backup, failed migration, four corrupt-file inputs), 7 `settingsDoc`.
- Each `engine` case states `expectPath` and the oracle throws if the TS engine takes another path.
- Vectors: `dotpath.json` (35, every result and `after` produced through a real GameLibStore), `numbers.json` (18), `keyorder.json` (14).
- `.prettierignore` covers `src-tauri/crates/gamelib-store/tests/fixtures`, so byte-exact tab JSON is never reformatted.

## Task Commits

1. **Task 1: Tracer, three cases end to end** - `c1142400c` (test)
2. **Task 2: Full case inventory with NOTES.md** - `3062bffc0` (test)
3. **Task 3: Shared vectors** - `258593d2d` (test)

**Plan metadata:** recorded in the docs commit that follows this SUMMARY.

Tracer gate: the tracer's `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so it was re-run end to end after Task 1 (jest compare green, expected file present, fixtures dir reported ignored, test file prettier-clean) and expansion continued.

## Files Created/Modified

- `src/backend/stores/__tests__/storeOracle.test.ts` - the oracle (case runner, engine-path assertions, rounds, vectors)
- `src-tauri/crates/gamelib-store/tests/fixtures/golden/` - `cases.json` (hand-authored inputs), `outcomes.json`, `expected/<id>/...`, `inputs/<id>.json`, `NOTES.md`
- `src-tauri/crates/gamelib-store/tests/fixtures/vectors/` - `dotpath.json`, `numbers.json`, `keyorder.json`
- `.prettierignore` - the new fixtures entry with a reason

## Decisions Made

- `cases.json` is authored by a throwaway generator script kept outside the repo (scratchpad); only its output is committed. No expected byte was typed by hand.
- Case schema choices the Rust replay must honour (all in NOTES.md): `second` declaration for two stores on one file, data-described override `steps`, per-round `rounds`/`reseed: newestBackup`, `expectPath` on engine cases.

## Deviations from Plan

### Findings recorded, not fixed

**1. [Finding] A migrated settings document is tab-indented, not 2-space**
- **Found during:** Task 1 (`migrate-settings-global-v0`)
- **Issue:** The plan's D-05 statement says settings documents are written with `JSON.stringify(data, null, 2)`. That holds for `writeSettingsFile`, but the engine's migration rewrite (`engine.ts` `atomicWritePrivate(..., JSON.stringify(..., undefined, '\t'))`) uses tabs for both flavours, so `config.json` is tab-indented right after a migration.
- **Resolution:** Not a bug to fix here (this plan changes no store code). The golden records it as TS behaviour and NOTES.md states it, so the Rust engine reproduces it.

### Additions beyond the plan text

- Extra `migrate` cases for each library chain's `*-real-keys.json` and `*-wr04-v2.json` fixtures (the plan named only `*-gameinfo-v1`/`-v0`), because the plan also says "every fixture"; and extra engine paths (`migrates`, `failed`, invalid schemaVersion, newer cache, failedView empty, cache identity chain) so the engine decision order in `runFileMigration` is covered branch by branch.
- The temp-root scan also covers `expected/` and not only `outcomes.json`.

**Total deviations:** 0 auto-fixed. **Impact:** none on the plan's goal; the golden is wider than the minimum (66 cases against 40).

## Mutation check (acceptance criterion)

Recorded once, then reverted: overwriting byte 3 of `expected/ops-clear/store/prefs.json` with `X` made the `ops-clear` test fail (1 failed, 67 passed); restoring the original bytes returned the suite to 68 passed. The final suite is 72 tests (66 case tests, the id-list test, the temp-root test, three vector tests, the minimums test) and all pass.

## Issues Encountered

- `pnpm backend-di-ceilings` fails on steam bridge test files this plan did not touch (`steam/__tests__/games.test.ts` 47 > 45, `bridge/__tests__/otherSessionPlaying.test.ts`, `bridge/__tests__/steamOfflineMode.test.ts`). Pre-existing and outside this plan's scope: logged in `deferred-items.md`. `storeOracle.test.ts` has zero `jest.mock` calls, so no shard file was needed.
- `pnpm codecheck` and `pnpm lint` exit 0 (lint: production PASS, tests PASS).

## Known Stubs

None.

## Threat Flags

None. The oracle only creates and deletes temp directories under `os.tmpdir()`; it never reads HOME or a real profile.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Rust store plans (85-06..85-08) can replay `cases.json` against `expected/` and `outcomes.json`, and read the three vector files directly.
- `NOTES.md` lists what the Rust side must pin with its own tests: 0600/0700 modes, corrupt-file handling (D-18), caches never resetting silently, lone-surrogate files kept read-only.

## Self-Check: PASSED

- FOUND: `src/backend/stores/__tests__/storeOracle.test.ts`, `golden/cases.json`, `golden/outcomes.json`, `golden/NOTES.md`, `golden/expected/migrate-settings-global-v0/config.json`, `vectors/dotpath.json`, `vectors/numbers.json`, `vectors/keyorder.json`
- FOUND commits: `c1142400c`, `3062bffc0`, `258593d2d`

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
