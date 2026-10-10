---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 04
subsystem: winetricks-catalog
tags: [winetricks, parser, tdd, common, pure-function]

# Dependency graph
requires:
  - phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
    provides: "45-CONTEXT.md D-09/D-17/D-19 decisions and the pinned winetricks script inventory"
provides:
  - "parseWinetricksMetadata(scriptText) -- pure w_metadata block parser, 567-verb coverage"
  - "deriveNeedsGuiVerbs(scriptText) -- w_download_manual-derived needs-GUI verb set (D-17)"
  - "isVisibleVerb / filterVisibleCatalog -- D-09 visibility predicate"
  - "committed, reproducible fixture excerpt of the pinned winetricks script (20260125-next)"
affects: [45-06, 45-12]

# Actuals (#2632)
actuals:
  tokens: 40850
  tasks: 2
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure src/common/winetricks/ modules: no fs/electron/logger/process imports, text-in text-out, mirroring the existing winetricksListParse.ts seam"
    - "TDD RED evidence via a type-correct but deliberately inert stub module (never a missing-module error), jest --json converted to TAP, validated through gsd-tools tdd-red-evidence"
    - "Committed, awk-regenerated fixture excerpts of real pinned scripts, with the exact regeneration command recorded in the fixture's own header comment"

key-files:
  created:
    - src/common/winetricks/metadata.ts
    - src/common/winetricks/visibility.ts
    - src/common/winetricks/__tests__/metadata.test.ts
    - src/common/winetricks/__tests__/visibility.test.ts
    - src/common/winetricks/__tests__/fixtures/winetricks-20260125-next.metadata.sh
  modified: []

key-decisions:
  - "RED evidence for both tasks used a type-correct stub module (empty Map/Set, isVisibleVerb always true) rather than a missing-module error, since gsd-tools tdd-red-evidence classifies 'Cannot find module' as INVALID_RED (zero_tests_discovered)"
  - "deriveNeedsGuiVerbs scans only load_<verb>() function bodies for literal w_download_manual call sites -- the media field is never consulted, per D-17's explicit rejection of that heuristic (gdiplus_winxp/protectionid set media=manual_download but call ordinary w_download)"
  - "Measured visible count over the fixture is 502 (328 dlls + 42 fonts + 132 settings), matching the planning-time estimate exactly -- all six D-17 needs-GUI verbs already fall inside the apps/benchmarks categories in this fixture, so the needsGui check and the category check don't overlap-reduce the count further here"

patterns-established:
  - "Pattern: fixture header comments carry source path, sha256, extraction date, and the exact regeneration command/script, with an explicit 'never hand-edit' note"

requirements-completed: [D-09, D-17, D-19]

coverage:
  - id: D1
    description: "parseWinetricksMetadata extracts title/publisher/year/media/conflicts/homepage per verb from w_metadata blocks, ignoring title_<lang> continuation lines"
    requirement: D-19
    verification:
      - kind: unit
        ref: "src/common/winetricks/__tests__/metadata.test.ts#parseWinetricksMetadata"
        status: pass
    human_judgment: false
  - id: D2
    description: "deriveNeedsGuiVerbs returns exactly the six w_download_manual callers and excludes media=manual_download/silent-install-flag false positives, with a non-vacuity sabotage control"
    requirement: D-17
    verification:
      - kind: unit
        ref: "src/common/winetricks/__tests__/metadata.test.ts#deriveNeedsGuiVerbs"
        status: pass
    human_judgment: false
  - id: D3
    description: "isVisibleVerb/filterVisibleCatalog implement D-09: hide apps/benchmarks categories, the ten launcher verbs, and needsGui-flagged verbs; keep install-shaped settings verbs and the bad/good test verbs; measured 502 visible over the fixture"
    requirement: D-09
    verification:
      - kind: unit
        ref: "src/common/winetricks/__tests__/visibility.test.ts#isVisibleVerb and #filterVisibleCatalog"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-10-10
status: complete
---

# Phase 45 Plan 04: Winetricks Metadata Parser and D-09 Visibility Predicate Summary

**Pure-function winetricks catalog facts: a 567-verb `w_metadata` parser, the D-17 `w_download_manual`-derived needs-GUI set, and the D-09 visibility predicate — all tested against a committed, reproducible excerpt of the exact pinned script GameLib downloads, with the excerpt's own header recording its source sha256 and regeneration command.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-10-10
- **Tasks:** 2
- **Files modified:** 5 (all created)

## Accomplishments
- `parseWinetricksMetadata` parses all 567 `w_metadata` blocks from the pinned script's text in a single linear pass, exact-matching field names so `title_<lang>=` continuation lines never pollute `title`
- `deriveNeedsGuiVerbs` derives the needs-GUI set (D-17) exclusively from `w_download_manual` call sites inside `load_<verb>()` bodies — proven against two negative-control pairs (`gdiplus_winxp`/`protectionid` set `media=manual_download` but call ordinary `w_download`; `fontxplorer`/`ubisoftconnect` use silent-install flags) and one non-vacuity sabotage control
- `isVisibleVerb` / `filterVisibleCatalog` implement the D-09 visibility rule, measured at exactly 502 visible verbs (328 dlls + 42 fonts + 132 settings) over the committed fixture
- A committed, awk-regenerated fixture (`winetricks-20260125-next.metadata.sh`, 146,891 bytes) carries every `w_metadata` block verbatim plus the 11 `load_<verb>()` bodies these tests exercise, with its own header documenting source sha256 `f35c29737ca08a583569e6a3752d52fbe23333c5acfad5f16c4177d25eaf3f4b` and the exact awk regeneration command

## Task Commits

Each task's RED and GREEN phases were committed atomically:

1. **Task 1: winetricks metadata parser + needs-GUI derivation**
   - `2d81d88f7` test(45-04): add failing tests for winetricks metadata parser and needs-GUI derivation (RED)
   - `7b6f4cf66` feat(45-04): implement winetricks metadata parser and needs-GUI derivation (GREEN)
2. **Task 2: D-09 visibility predicate**
   - `dd1a046c0` test(45-04): add failing tests for the D-09 visibility predicate (RED)
   - `584c59d73` feat(45-04): implement the D-09 visibility predicate (GREEN)

_TDD tasks each have a test → feat commit pair; no refactor commit was needed._

## Files Created/Modified
- `src/common/winetricks/metadata.ts` - `parseWinetricksMetadata`, `deriveNeedsGuiVerbs`, `WinetricksVerbMetadata` type
- `src/common/winetricks/visibility.ts` - `isVisibleVerb`, `filterVisibleCatalog`, `HIDDEN_CATEGORIES`, `HIDDEN_VERBS`
- `src/common/winetricks/__tests__/metadata.test.ts` - 11 tests covering synthetic blocks, robustness, fixture category counts/order, and D-17's needs-GUI derivation with negative + sabotage controls
- `src/common/winetricks/__tests__/visibility.test.ts` - 13 tests covering per-category/verb/needsGui hiding, kept install-shaped settings verbs, order-preservation, and the fixture's measured visible count
- `src/common/winetricks/__tests__/fixtures/winetricks-20260125-next.metadata.sh` - committed, reproducible excerpt of the pinned script (567 `w_metadata` blocks + 11 `load_<verb>()` bodies), regenerated via a recorded awk script, never hand-edited

## Decisions Made
- RED evidence for both tasks used a type-correct, deliberately inert stub module (empty `Map`/`Set` returns, `isVisibleVerb` always `true`) rather than letting jest fail on a missing module — `gsd-tools tdd-red-evidence` classifies a "Cannot find module" failure as `INVALID_RED` (`zero_tests_discovered`), not valid RED evidence. Both RED commits verified `RED_EVIDENCE_OK` before their GREEN implementation.
- `deriveNeedsGuiVerbs` scans only `load_<verb>()` function bodies for a literal `w_download_manual` call; the `media` field is never consulted, per D-17's explicit rejection of that heuristic.
- The measured D-09 visible count over the fixture (502) matches the plan's planning-time estimate exactly; all six D-17 needs-GUI verbs happen to already sit inside the `apps`/`benchmarks` categories in this fixture, so `isVisibleVerb`'s `needsGui` check is exercised directly (via a synthetic `dlls` verb carrying `needsGui: true`) rather than changing the fixture's visible count on its own.

## Deviations from Plan

None — plan executed exactly as written. Two formatting/classification corrections were made during execution, neither changing behavior:
- The module header comment for `metadata.ts` originally said "no child_process" while describing what the module does NOT import; this literally tripped the plan's own acceptance-criteria grep for the string `child_process`. Reworded to "no process spawning" (same meaning).
- `npx prettier --write` was run once on each new file before the corresponding commit, satisfying the project's `<verify>`-block prettier convention; no logic changed.

## Issues Encountered
None beyond the TDD RED-evidence mechanics documented above under Decisions Made.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `45-06` (the backend caller that reads the script file from disk) can now import `parseWinetricksMetadata`, `deriveNeedsGuiVerbs`, `isVisibleVerb`, and `filterVisibleCatalog` directly from `src/common/winetricks/`.
- `45-12`'s live gate can rely on the `bad` settings test verb staying visible (confirmed by test) to induce a deterministic failure.
- No blockers. The existing hand-written `NEEDS_GUI_WINETRICKS_VERBS` list in `src/common/winetricks/verbs.ts` is still in place and not yet superseded by `deriveNeedsGuiVerbs` — that retirement is out of this plan's `files_modified` scope and belongs to whichever later plan wires the real catalog through.

---
*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Completed: 2026-10-10*

## Self-Check: PASSED

All 5 created files and all 4 task commits (`2d81d88f7`, `7b6f4cf66`, `dd1a046c0`, `584c59d73`) verified present on disk and in git log.
