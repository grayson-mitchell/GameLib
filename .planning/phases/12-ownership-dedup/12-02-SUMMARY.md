---
phase: 12-ownership-dedup
plan: 02
subsystem: humble-dedup
tags: [typescript, jest, tdd, humble-bundle, steam, dedup, fuzzy-matching, levenshtein]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    plan: 01
    provides: HumbleKey.steamAppId?/ownedElsewhere/matchConfidence overlay fields, HUMBLE_FUZZY_MATCH_THRESHOLD=0.85 constant
provides:
  - Pure ownership-matching module src/backend/humble/dedup.ts (recomputeOwnership, fuzzyMatch, titleSimilarity, isDlcFalsePositiveRisk, normalizeTitle)
  - fastest-levenshtein@1.0.16 runtime dependency (installed after human legitimacy gate)
  - GameInfo[] Steam-library test fixture (fixtures/steamGames.ts) with documented DLC/edition-variant titles
affects: [12-03-backend-wiring, 12-04-ipc, 12-05-ui]

# Tech tracking
tech-stack:
  added: [fastest-levenshtein@1.0.16]
  patterns:
    [
      injected-dependency pure module (caller passes steamGames + override predicate, mirrors classify.ts isRevealed injection),
      length-sensitive Levenshtein ratio over token-set matching for containment-pair safety
    ]

key-files:
  created:
    - src/backend/humble/dedup.ts
    - src/backend/humble/__tests__/dedup.test.ts
    - src/backend/humble/__tests__/fixtures/steamGames.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "normalizeTitle strips parenthetical qualifiers — required fix to the RESEARCH.md Pattern 3 reference, which failed its own 'Into the Breach (Steam)' must-match fixture at ~0.71"
  - "Empty steamGames array returns keys unchanged (D-48 unit-level floor) rather than recomputing to all-false; the real connectivity gate lives in the caller (Plan 03)"
  - "D-42 override only clears a fuzzy match — an exact AppID match is ground truth and cannot be overridden"

patterns-established:
  - "dedup.ts is a pure module with injected data: steamGames array + isOverridden predicate passed by library.ts, never read from a store inside the module"

requirements-completed: []
requirements-progressed: [HDEDUP-01]

# Metrics
duration: 6min (execution; excludes human package-legitimacy gate wait)
completed: 2026-07-06
---

# Phase 12 Plan 02: Pure Ownership-Matching Module Summary

**Two-tier ownership matcher (exact-AppID-final per D-44, 85%+ length-sensitive normalized-Levenshtein fuzzy fallback with DLC-keyword guard per D-45) shipped as a pure injected-dependency module on fastest-levenshtein, installed only after the blocking-human package-legitimacy gate.**

## Performance

- **Duration:** ~6 min execution (10:55:40Z -> 11:01:32Z), after the Task 1 human gate was approved
- **Started:** 2026-07-06T10:55:40Z
- **Completed:** 2026-07-06T11:01:32Z
- **Tasks:** 2 completed (1 blocking-human checkpoint + 1 TDD auto task)
- **Files modified:** 5 (3 created, 2 dependency manifests)

## Accomplishments

- `fastest-levenshtein@1.0.16` installed via pnpm after the human completed the `[ASSUMED]`-provenance legitimacy verification (T-12-SC): exact name confirmed, repo `github.com/ka-weihe/fastest-levenshtein`, no install hooks, zero runtime deps, 22.3M weekly downloads. `git status` showed only package.json/pnpm-lock.yaml changes — no dependency drift
- `src/backend/humble/dedup.ts` (163 lines): pure module exporting `normalizeTitle`, `titleSimilarity`, `isDlcFalsePositiveRisk`, `fuzzyMatch`, `recomputeOwnership`. No store/IPC/logging imports — steamGames array and the D-42 override predicate are injected by the caller, mirroring classify.ts's `isRevealed` injection
- Two-tier contract implemented exactly per D-44/D-45: `steamAppId` present -> exact `app_name` equality, verdict final with NO fuzzy fallback; absent -> normalized-Levenshtein ratio >= `HUMBLE_FUZZY_MATCH_THRESHOLD` (0.85) with the raw-title DLC-keyword guard vetoing first. No platform gate (D-45 cross-platform matching intentional)
- UNPICKED pseudo-entries excluded entirely (D-27); empty Steam library returns input keys unchanged (D-48 unit-level keep-last-known floor); D-42 override clears fuzzy matches only, never exact
- `EDITION_SUFFIXES`/`DLC_KEYWORDS` are fixed hardcoded module-level `const` arrays (T-12-01 ReDoS guard) — never parameters, never config/IPC/API-sourced
- 22 new tests all green (named cases: "appid", "fuzzy match", "dlc", "unpicked", "cross-platform", "keep-last-known", plus D-42 override + unit tests for each exported helper); full humble backend suite 246/246; `tsc --noEmit` clean; eslint clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy gate + install** - `81892fad` (chore) — gate approved by human via coordinator, then `pnpm add fastest-levenshtein`
2. **Task 2 (TDD RED): failing tests + fixture** - `651ae13d` (test)
3. **Task 2 (TDD GREEN): dedup.ts implementation** - `30cac468` (feat)

No REFACTOR commit — the GREEN implementation needed no cleanup pass.

## TDD Gate Compliance

- RED gate: `651ae13d` (`test(12-02)`) — suite failed with module-not-found before implementation existed (verified failing output before commit)
- GREEN gate: `30cac468` (`feat(12-02)`) — 22/22 passing after implementation
- REFACTOR gate: intentionally skipped, no changes needed

## Files Created/Modified

- `src/backend/humble/dedup.ts` - Pure two-tier ownership matcher; docstring carries the classify.ts "No I/O, no logging, no store import" contract plus the T-12-01/T-12-05 constant-list guard note
- `src/backend/humble/__tests__/dedup.test.ts` - 22 tests: AppID exact-final (hit + miss-without-fallback), all three documented should-match fuzzy pairs, both documented should-NOT-match DLC/substring pairs, UNPICKED exclusion, cross-platform GOG-key match, keep-last-known on empty library, D-42 override (clears fuzzy / never clears exact), per-helper unit tests
- `src/backend/humble/__tests__/fixtures/steamGames.ts` - `GameInfo[]` fixture via a `makeSteamGame` factory; named exports per the tpks.ts convention; includes Portal 2 (AppID 620), the three fuzzy-pair titles, Game X / Batman: Arkham Knight DLC-guard targets, Stardew Valley cross-platform target
- `package.json` / `pnpm-lock.yaml` - `fastest-levenshtein@^1.0.16` added (only intended changes; verified no drift)

## Decisions Made

- **Parenthetical stripping added to normalizeTitle** (deviation, see below) — the RESEARCH.md reference implementation could not pass its own documented fixture without it.
- **Empty-library early return**: `recomputeOwnership(keys, [], ...)` returns `keys` unchanged. The plan's keep-last-known note says the module "computes from whatever it is given" but the test must "assert the function does not zero-out on empty input" — a guard clause satisfies both without moving the D-48 connectivity decision out of the caller (an empty library produces zero matches either way; the guard just preserves prior true values instead of erasing them).
- **Override scope**: implemented per the plan's parenthetical "(override only ever clears a fuzzy match)" — `isOverridden` is consulted only when the computed confidence is `'fuzzy'`; exact AppID matches are unoverridable ground truth. Covered by two dedicated tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RESEARCH.md Pattern 3 reference normalizeTitle fails its own must-match fixture**
- **Found during:** Task 2 (test design, confirmed by scoring math)
- **Issue:** The vetted reference `normalizeTitle` does not strip parenthetical qualifiers, so the documented must-match pair `"Into the Breach"` vs `"Into The Breach (Steam)"` scores `1 - 6/21 ≈ 0.714` — below the locked 0.85 threshold — meaning the reference implementation as written fails the plan's own required fixture.
- **Fix:** Added `t.replace(/\([^)]*\)/g, ' ')` to `normalizeTitle` (after trademark-symbol stripping, before suffix/punctuation stripping). Safe against DLC leakage because `isDlcFalsePositiveRisk` runs on RAW pre-normalization titles — e.g. `"Half-Life (Original Soundtrack)"` is still vetoed by the `soundtrack` keyword before similarity is computed (covered by a dedicated test).
- **Files modified:** `src/backend/humble/dedup.ts`
- **Commit:** `30cac468`

## Authentication Gates

None (the Task 1 blocking-human checkpoint was a package-legitimacy gate, not an auth gate — resolved via coordinator-relayed human approval with registry evidence).

## Known Stubs

None. All exported functions are fully implemented and tested. `recomputeOwnership` is not yet CALLED from production code by design — Plan 12-03 (backend wiring) wires it into library.ts with the real store reads and the D-48 connectivity gate.

## Threat Flags

None beyond the plan's own threat model. T-12-SC (supply chain) mitigated via the executed blocking-human gate; T-12-01 (ReDoS) mitigated via hardcoded constant lists; T-12-05 (input validation) holds — untrusted titles are only ever normalized and edit-distance-compared, never interpolated into regex/shell/path/SQL.

## Orchestrator Notes

- REQUIREMENTS.md deliberately NOT touched (shared artifact; HDEDUP-01 spans plans 02-05 and is not yet end-to-end complete — the matcher exists but nothing calls it until Plan 03).
- STATE.md / ROADMAP.md untouched per worktree protocol.

## Self-Check: PASSED

- FOUND: src/backend/humble/dedup.ts (exports recomputeOwnership, fuzzyMatch, titleSimilarity, isDlcFalsePositiveRisk, normalizeTitle; 163 lines >= min 40; grep confirms no electronStores/sendFrontendMessage/store import)
- FOUND: src/backend/humble/__tests__/dedup.test.ts (contains isDlcFalsePositiveRisk coverage)
- FOUND: src/backend/humble/__tests__/fixtures/steamGames.ts
- FOUND commit 81892fad (chore(12-02): add fastest-levenshtein dependency after legitimacy gate)
- FOUND commit 651ae13d (test(12-02): add failing tests for ownership-matching module)
- FOUND commit 30cac468 (feat(12-02): implement pure two-tier ownership matcher)
- jest dedup.test.ts: 22/22 passed; all six named `-t` selectors ("appid", "fuzzy match", "dlc", "unpicked", "cross-platform", "keep-last-known") select passing tests
- jest src/backend/humble (full suite): 246/246 passed
- tsc --noEmit: clean; eslint on all three new files: exit 0
- package.json lists fastest-levenshtein@^1.0.16; git status clean (no untracked/unintended changes)
