---
phase: 19-crossover-compatibility-index-macos
plan: 01
subsystem: infra
tags: [fast-xml-parser, jest, ts-jest, meta-scripts, ci, esbuild, gzip]

# Dependency graph
requires: []
provides:
  - "meta/buildCrossoverIndex.ts — CI-only builder that parses CodeWeavers' .tie dump and emits crossover-index.json.gz + collisions.json"
  - "meta jest project (meta/jest.config.js) wired into root jest.config.js so meta/ scripts get permanent regression coverage"
  - "build-crossover-index pnpm script entry"
  - "trimmed .tie XML fixture (meta/__tests__/fixtures/crossover-dump-sample.tie.xml) exercising the real c4p>applications>app[]/<appprofile> dump shape"
affects: [19-02, 19-03, "phase-19 CI workflow (build-crossover-index.yml)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "meta/ CI-script convention: plain top-level-imperative TS, esbuild --bundle --platform=node --target=node21 | node, no class"
    - "Pure exported functions (parseDump/extractRecords/dedupRecords/assertNonEmpty) kept free of I/O so a guarded main() can be unit-tested without hitting the network"
    - "JEST_WORKER_ID (not require.main===module) as the run-as-script vs imported-under-test guard for scripts invoked via `esbuild | node` stdin piping"

key-files:
  created:
    - meta/buildCrossoverIndex.ts
    - meta/__tests__/buildCrossoverIndex.test.ts
    - meta/__tests__/fixtures/crossover-dump-sample.tie.xml
    - meta/jest.config.js
  modified:
    - jest.config.js
    - package.json

key-decisions:
  - "Guarded main() with `!process.env.JEST_WORKER_ID` instead of the usual `require.main === module` idiom — Node does not set require.main when a script is read from stdin (verified live), which is exactly how this script is invoked (`esbuild --bundle ... | node`, the meta/ convention). The standard guard would have silently no-op'd main() on every real CI run."
  - "Used built-in fetch() + node:zlib gunzipSync for the dump download rather than axiosClient — this is a CI-only script with no Electron main-process context, so the app's shared HTTP client doesn't apply."
  - "Dedup groups by steamid, falling back to `appid:{appid}` for records with no steamid, so non-Steam-linked Mac-medal games still pass through dedupRecords without special-casing."
  - "Sorted the emitted `entries` array by name before gzip, on top of the already-deterministic Map insertion order, as extra insurance for the byte-identical-output requirement."

patterns-established:
  - "meta/ scripts that need to export pure functions for testing must NOT use require.main===module as their script guard when invoked via the project's `esbuild --bundle ... | node` piping convention — use `!process.env.JEST_WORKER_ID` instead."

requirements-completed: [CXIDX-01]

# Metrics
duration: ~45min
completed: 2026-07-14
---

# Phase 19 Plan 01: CrossOver Index Builder Summary

**CI-only `meta/buildCrossoverIndex.ts` that parses CodeWeavers' `.tie` XML dump (raised fast-xml-parser entity limits, real `c4p>applications>app[]`/`<appprofile>` shape) and emits a deterministic `crossover-index.json.gz` of Mac-medal Games plus a `collisions.json` drift report, with a permanent 7-test jest regression suite.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2 completed
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Built the CI index builder's full pipeline: parse (raised entity limits) → extract (medal rule, category filter) → dedup (total three-key deterministic order) → emit (gzipped JSON + collisions drift report) → zero-record fail-fast guard.
- Wired a new `meta` jest project into the root config so `meta/` scripts get permanent, collected regression coverage (previously only `src/backend` and `src/frontend` were collected).
- Authored a trimmed `.tie` XML fixture that faithfully reproduces the dump's real, previously-undocumented nesting (`<applications>` wrapper; `steamid`/`category`/`medal` inside `<appprofile>`), covering all six required cases from the plan (Mac-medal Games, entity-encoded name, Linux-only exclusion, non-Games exclusion, an exact-tie collision, and steamid-present/absent).
- Live-verified the builder end-to-end against the fixture: 5 extracted → 4 winners + 1 collision, gzip decompresses to Mac-medal-only Games, two runs produce byte-identical output (modulo `generatedAt`), and a zero-record dump exits non-zero.

## Task Commits

1. **Task 1: Fixture + meta jest project + failing regression test + script entry** - `64582eb3` (test)
2. **Task 2: Implement the builder — parse, extract, medal rule, deterministic dedup, emit, zero-record guard** - `c2106ae9` (feat)

_TDD tasks: both tasks used the RED→GREEN gate individually (test commit then feat commit); no refactor commit was needed._

## Files Created/Modified

- `meta/buildCrossoverIndex.ts` - The CI builder: exports `parseDump`, `extractRecords`, `dedupRecords`, `assertNonEmpty`/`ZeroRecordError` (all pure, I/O-free) plus a guarded `main()` that fetches/reads the dump, runs the pipeline, and writes `crossover-index.json.gz` + `collisions.json`
- `meta/__tests__/buildCrossoverIndex.test.ts` - Permanent regression: medal-rule filtering, entity decoding, canonical-name selection, 3-key dedup determinism (byte-identical across runs), collision reporting, zero-record guard
- `meta/__tests__/fixtures/crossover-dump-sample.tie.xml` - Trimmed fixture with the real `c4p>applications>app[]`/`<appprofile>` shape, covering all 6 required cases
- `meta/jest.config.js` - New `Meta` jest project (ts-jest, mirrors `src/backend/jest.config.js`)
- `jest.config.js` - Added `'<rootDir>/meta'` to the `projects` array (only this one line changed)
- `package.json` - Added `build-crossover-index` script, verbatim `lint-translations` shape

## Decisions Made

- **JEST_WORKER_ID guard over require.main===module** (see key-decisions above) — discovered during Task 2 verification that the standard Node script-guard idiom is incompatible with this project's `esbuild --bundle ... | node` stdin-piping convention. This is a correctness fix (Rule 1: the builder would have silently produced no output on every real CI invocation) applied before the task was committed, not a deviation logged after the fact.
- Kept `label` (raw medal text, e.g. `gold`/`bronze`) alongside `rating` in the emitted index, per the plan's discretion note (D-12) — a cheap cross-check that the numeric rating derivation matches the source.
- Dedup collision report uses the group key (steamid, or `appid:{appid}` fallback) plus `winnerAppid`/`loserAppids` rather than full record dumps — small, readable drift signal per D-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed the script guard so `main()` actually runs on real invocation**

- **Found during:** Task 2 (verifying the builder against the fixture via `pnpm build-crossover-index`)
- **Issue:** The initial implementation guarded `main()` with the conventional `require.main === module` check. Live-testing the actual `esbuild --bundle ... | node` pipe (the package.json script shape mandated by the plan and the project's `meta/` convention) showed `require.main` is `undefined` when Node reads a script from stdin — so the guard never fired and the builder silently did nothing (`pnpm test`/exit code showed success but no files were written and no console output appeared) on every real run.
- **Fix:** Replaced the guard with `!process.env.JEST_WORKER_ID`, which Jest sets for every worker (including `--runInBand`) and which is `undefined` outside Jest — this correctly distinguishes "imported under test" from "run as the actual CI script" regardless of the stdin-piping invocation style.
- **Files modified:** `meta/buildCrossoverIndex.ts`
- **Verification:** Re-ran the exact `pnpm build-crossover-index` pipe against the fixture — confirmed console output, both output files written, gzip contents correct (4 winners, 1 collision), two runs byte-identical modulo `generatedAt`, and a zero-record dump exits non-zero. Re-ran the jest suite to confirm the guard still correctly no-ops under test (all 7 tests still pass, no network/filesystem side effects during import).
- **Committed in:** `c2106ae9` (part of Task 2 commit — caught and fixed before committing, not a follow-up commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix, Rule 1)
**Impact on plan:** Essential correctness fix — without it the CI builder (this plan's entire purpose, CXIDX-01) would never actually produce an index when run for real, despite passing all tests (which import the module directly and never exercise the stdin-piped invocation path). No scope creep; the pipeline, medal rule, and dedup logic are exactly as designed in the plan/research.

## Issues Encountered

- Initial `grep -q 'processEntities: false'` verification check flagged a false positive — a code comment ("NEVER `processEntities: false`") contained the literal substring the negative-grep checks for. Reworded the comment to avoid the substring while preserving the warning. Not a deviation (cosmetic, comment-only), fixed before the Task 2 commit.

## User Setup Required

None - no external service configuration required. (The daily GitHub Action, rolling-release publish, and workflow-enable step are Task/Plan items for a later plan in this phase, per the phase's plan breakdown — this plan is CI-builder-only.)

## Next Phase Readiness

- `meta/buildCrossoverIndex.ts`'s exported pure functions (`parseDump`, `extractRecords`, `dedupRecords`) are ready to be reused as the dump-loading logic for `meta/measureCrossoverMatching.ts` (the D-01/D-02/D-03 measurement task), per 19-RESEARCH.md's stated design.
- The `IndexPayload` shape emitted here (`{ version: 1, generatedAt, entries: [{ name, rating, label, steamid? }] }`) is what the downstream `crossover_index/schema.ts` zod schema (a later plan) will validate against — no blocking gap, but the later plan should confirm the exact field names line up (this plan kept `label` in addition to the RESEARCH.md-drafted schema's `name`/`rating`/`steamid`).
- No blockers. The `.github/workflows/build-crossover-index.yml` (T-03/T-04/Pitfall 3/4/7 — rolling tag, `--latest=false`, `workflow_dispatch`, fork-scheduled-workflow enable step) is out of scope for this plan and remains for a later plan in the phase's wave breakdown.

---

*Phase: 19-crossover-compatibility-index-macos*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: meta/buildCrossoverIndex.ts
- FOUND: meta/__tests__/buildCrossoverIndex.test.ts
- FOUND: meta/__tests__/fixtures/crossover-dump-sample.tie.xml
- FOUND: meta/jest.config.js
- FOUND: .planning/phases/19-crossover-compatibility-index-macos/19-01-SUMMARY.md
- FOUND: 64582eb3 (test commit)
- FOUND: c2106ae9 (feat commit)
- FOUND: 97d622b8 (docs/summary commit)
