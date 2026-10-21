---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 18
subsystem: steam-bridge
tags: [steam-bridge, census, uat, tdd, meta-tooling]

requires:
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 02)
    provides: importParse.ts (parseSteamApiImportTable), interfaceVersions.ts (resolveRequiredInterfaceVersions, usesRuntimeInterfaceLookup, readInterfaceVersionStrings) -- zero-backend-import pure modules reused unchanged
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 03)
    provides: shimCoverage.ts (evaluateShimCoverage, SHIM64_EXPORTED_SYMBOLS) -- the shipped coverage sets the census classifies against
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 05)
    provides: bridge-allowlist.json v2 schema (seed/knownBad), read directly for the known-bad lookup
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 08)
    provides: SteamBridgeKnownBadReason closed taxonomy referenced by the known-bad classification
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 14)
    provides: GAMESERVER_FLAT_STUBS, second/last interface group manifests -- what makes XCOM/Hoard's wider imports resolvable
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 15)
    provides: the real, populated SHIM64_EXPORTED_SYMBOLS/SHIM64_SERVED_INTERFACE_VERSIONS the x64 census path classifies against
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 16)
    provides: D-51-09/10 route-visibility UI, referenced by UAT item 8
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca (Plan 17)
    provides: the pre-install prescreen (D-51-06/17), referenced by UAT item 6
provides:
  - "meta/bridgeCensus.ts: pnpm bridge-census [--json] -- a real-bottle census against the shipped shimCoverage sets, reporting N of M titles routed to the bridge with every miss classified"
  - "classifyCensusTitle/summarizeCensus: pure, unit-tested classification composing the exact resolveRequiredInterfaceVersions + evaluateShimCoverage pipeline the live bridge uses, so a census result can never silently diverge from a real install/launch decision"
  - ".planning/phases/51-.../51-UAT.md: the phase's 13-item live/desk gate contract, in the repo's UAT item shape, for 51-19 to execute"
affects: [51-19]

actuals:
  tokens: 8940
  tasks: 2
  commits: 3
  plan_head_before: 3f2800a97abc840a1fa66c2d491b5530271e0dfd
  plan_head_after: 203d1b873b2df9fc87a8356fa57f85a043a08fe6

tech-stack:
  added: []
  patterns:
    - "classifyCensusTitle takes an injectable CensusCoverageDeps (default = the real, shipped resolveRequiredInterfaceVersions/evaluateShimCoverage/SHIM64_EXPORTED_SYMBOLS), the same test-injection seam shimCoverage.ts's own evaluateShimCoverageWith already established -- lets the 'win64-no-shim' structural case (x64 export set empty) be exercised with a fixture even though the real set has been non-empty since 51-15's D-51-13 GO"
    - "Dedup-by-appid across bottles: the same appid found in more than one matching bottle (legacy shared + a per-game bottle) is counted once, first occurrence wins -- a title installed twice is an operator-side artifact, not two owned titles"
    - "isGameLibShimBytes's marker check (GameLibSteamBridgeShim / 127.0.0.1) is reimplemented locally in meta/bridgeCensus.ts rather than imported from shimGenerate.ts, preserving the zero-backend-import bundling discipline importParse.ts/interfaceVersions.ts/shimCoverage.ts already established"

key-files:
  created:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-UAT.md
  modified:
    - package.json

key-decisions:
  - "known-bad classification is checked FIRST, ahead of exe/coverage analysis -- mirrors the live route resolver's own D-51-08 precedence (a known-bad title is never attempted regardless of what its exe looks like)"
  - "Classification precedence below known-bad/no-binary: no-steam-api exe -> bridge (flagged); x64 with an empty export set -> win64-no-shim (never even calls into coverage resolution); unresolved interface-version family -> unknown-version; any remaining missing export/served-version -> missing-symbols; otherwise -> bridge"
  - "CensusRow carries ONLY appid/name/installdir/arch/class/detail (T-51-39) -- installdir is always the bare ACF folder name, never the resolved absolute install path, which stays internal to the exe-finding/objdump step and is never threaded into a returned row"
  - "Declared named real-profile arm (two-profile rule): the tool's whole purpose is reading the operator's real, populated bottles, so no fake-HOME wrapping is used; the two objdump spawns are argv-form with no env option at all, so the spawn sites cannot trip fakeHomeIsolation.test.ts's hand-rolled-env-literal detector either way"

patterns-established:
  - "A standalone meta/ census tool composing live backend pure-logic modules (importParse.ts/interfaceVersions.ts/shimCoverage.ts) by relative import, reusing their injectable-deps test seam, rather than re-deriving the coverage logic a second time"

requirements-completed: []

coverage:
  - id: D1
    description: "meta/bridgeCensus.ts + pnpm bridge-census script: real-bottle census against shimCoverage, classifying every title bridge/win64-no-shim/missing-symbols/unknown-version/known-bad/no-binary"
    verification:
      - kind: unit
        ref: "meta/__tests__/bridgeCensus.test.ts (11/11 passing)"
        status: pass
      - kind: other
        ref: "pnpm bridge-census, run live against this operator's real CrossOver bottles: 8 of 11 routed to the bridge (bridge=8, no-binary=2, unknown-version=1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "51-UAT.md: 13 live/desk gates for Phase 51, in the repo's UAT item shape"
    verification:
      - kind: other
        ref: "python3 shape-check from the plan's own <verify> block (13 numbered items, 13 inline expected:, 13 pending result:)"
        status: pass
    human_judgment: true
    rationale: "This deliverable IS the contract a human (via 51-19) will later execute against real hardware -- the python check only proves the file's MECHANICAL shape (item count, column-0 headings, inline expected:/result: pending), not that each item's content (confirmed titles, per-fix hooks, ordering) is itself correct. That judgment belongs to whoever runs 51-19."

duration: ~30min
completed: 2026-10-21
status: complete
---

# Phase 51 Plan 18: Closing Bridge-Coverage Census + Phase 51 UAT Contract Summary

**A real-bottle census tool (`pnpm bridge-census`) measuring 8 of 11 owned titles routed to the bridge on this machine today, plus the phase's 13-item live/desk UAT contract for 51-19.**

## Performance
- **Duration:** ~30min
- **Started:** 2026-10-21 (session continuation after 51-17)
- **Completed:** 2026-10-21T12:31:58Z
- **Tasks:** 2/2 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Built `meta/bridgeCensus.ts`: a pure classifier (`classifyCensusTitle`, `summarizeCensus`) composing the exact `resolveRequiredInterfaceVersions` + `evaluateShimCoverage` pipeline the live bridge uses, wrapped in a read-only CLI driver (`pnpm bridge-census [--json]`) that enumerates `appmanifest_*.acf` across the legacy, shared, and per-game bridge bottles, objdumps each title's exe, and prints an N-of-M verdict with every miss classified.
- Ran the census live against this operator's real CrossOver bottles: **8 of 11 routed to the bridge** (`bridge=8, no-binary=2, unknown-version=1`) -- the pre-gate baseline for 51-19.
- Wrote `.planning/phases/51-.../51-UAT.md`: 13 items covering the confirmed acceptance set (Avernum 5/6, Hoard, XCOM: Enemy Unknown, ELEX) plus D-51-02/03/04/08/09/10/11/12/16, in the repo's house UAT shape (`### N.` at column 0, inline `expected:`, `result:` opening with a status word), with item 3 explicitly ordered before item 4 per the pair-test review (item 4's uninstall destroys item 3's evidence).

## Task Commits
1. **Task 1: Census tool over the operator's real bottles** -- RED `9318b94f1` (test), GREEN `387276538` (feat)
2. **Task 2: Write 51-UAT.md (live and desk gates)** -- `203d1b873` (docs)

## Files Created/Modified
- `meta/bridgeCensus.ts` - pure classifier + read-only CLI driver (620 lines)
- `meta/__tests__/bridgeCensus.test.ts` - 11 fixture-based unit tests, no filesystem
- `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-UAT.md` - the phase's 13-item UAT contract
- `package.json` - added the `bridge-census` script

## Decisions Made
See `key-decisions` in the frontmatter above. Most load-bearing: `classifyCensusTitle` takes injectable coverage dependencies defaulting to the real shipped modules, which is what let the `win64-no-shim` structural case be unit-tested at all (the real x64 export set has been non-empty since 51-15's Win64 GO).

## Deviations from Plan

None - plan executed exactly as written. The classification precedence (known-bad checked first, then no-binary, then no-steam-api, then win64-no-shim, then unknown-version, then missing-symbols, then bridge) is a design judgment call needed to satisfy the plan's `<behavior>` bullets precisely, not a divergence from them.

**Total deviations:** 0. **Impact:** none.

## Issues Encountered

**Finding, not a defect:** the live `pnpm bridge-census` run classified Hoard (63000) as `unknown-version` rather than `bridge`, even though Hoard's coverage is fully wired as of 51-14 (`SHIM_SERVED_INTERFACE_VERSIONS` carries all of Hoard's measured versions). Root cause: Hoard's bottle already has the GameLib shim placed over its original `steam_api.dll` (from earlier Phase 51 testing), and per the plan's own action text the census deliberately does NOT read version strings from a file it detects as the GameLib shim (`isGameLibShimBytes`) rather than the game's original dll -- so once a title's original dll has been overwritten, this standalone tool has no way to recover which interface versions it originally required. The live bridge code has a fallback the census tool cannot use (`placeShimForGame`'s `persistedInterfaceVersions`, read from `electronStores.ts`), but wiring that in would mean importing the backend module graph this tool's zero-import design explicitly forbids. This is an inherent, accepted limitation of a standalone read-only census (not something to fix in this plan) -- worth 51-19 knowing: a census `unknown-version` result for an already-shimmed title does not mean the live bridge is actually broken for it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

51-19 (the final plan, the only plan in Wave 8) has everything it needs: `.planning/phases/51-.../51-UAT.md` is the live/desk gate contract to execute, and `pnpm bridge-census` is available to re-run as item 13 against whatever the final packaged build ships. No blockers.

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-21*

## Self-Check: PASSED

All created files confirmed on disk (`meta/bridgeCensus.ts`, `meta/__tests__/bridgeCensus.test.ts`, `51-UAT.md`, this summary). All three task commit hashes (`9318b94f1`, `387276538`, `203d1b873`) confirmed present in `git log --oneline --all`.
