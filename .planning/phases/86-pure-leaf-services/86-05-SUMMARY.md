---
phase: 86-pure-leaf-services
plan: 05
subsystem: delete-gate
tags: [delete-gate, shim-schedule, resolver, images-cache, d-22, d-06, d-13, d-24, sc4, ts-ast]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-01's D-29 host table (row 5 EXTRA_ROWS mechanism) and 86-02's slice layout that the per-slice gate describes name"
provides:
  - "infoPortGate.ts: walkStripped (with the floor count), assertDeleted, assertKept, findIdentifiers, findTsRegistrations, findRollbackFlag, findRustInfoCalls, findExportedFunctions, findImporters, checkShimShape (shim and resolver rules)"
  - "infoPortComplete.test.ts: the SliceSpec table-driven per-slice gate, first describe imagesCachePortComplete; a spec can also pin storeTable.json rows that must outlive a TS store registration (D-29 row 5)"
  - "infoShimSchedule.test.ts: the D-06/D-24 SCHEDULE (empty until 86-09) with discovery set-equality, shape, channel, deletedBy and caller checks, proven by planted fixtures"
  - "src/backend/images_cache.ts and the appRuntime imageFetches slot are gone (D-22)"
affects: [86-06, 86-09, 86-11, 86-13, 86-17, 86-24]

actuals:
  tokens: 34000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A slice's delete gate is a SliceSpec (deleted, kept, forbiddenIdentifiers, identifierRoot, flag, optional manifestSlice and storeRowKeys) run by one runSlice; each slice adds one `describe('<name>PortComplete', () => runSlice(SPEC))`"
    - "Shim and resolver bodies are checked with the TypeScript compiler API, not regex: one returned requestRustInvoke call, first argument a RUST_INFO_* constant, arguments built from parameters (and, for a resolver, its const inputs)"
    - "Schedule discovery is function-level: exported functions in src/backend/info plus the named function holding each RUST_INFO call outside it, keyed `file#name`"

key-files:
  created:
    - src/backend/testUtils/infoPortGate.ts
    - src/backend/__tests__/infoPortComplete.test.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - .planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md
  modified:
    - src/backend/appRuntime.ts
    - src/backend/__tests__/appRuntime.test.ts
    - src/backend/__tests__/diPhaseGates.test.ts
  deleted:
    - src/backend/images_cache.ts

key-decisions:
  - "Gate scans run on comment-stripped text with both the whole-line and the string-literal-aware trailing-comment strippers; the rollback-flag scan reads raw text so a flag named in a comment still fails (D-13)"
  - "findRustInfoCalls names the enclosing function (the nearest named one, so an arrow inside a callback reports the outer function); an anonymous holder reports `<anonymous>` and so can never match a schedule row"
  - "The resolver rule compares the const names to the row's inputs as sets, so declaration order is free; any non-const statement before the call is reported by name"
  - "Schedule checks loop over SCHEDULE inside one `it` each, because jest refuses `it.each([])` and SCHEDULE is empty until 86-09"
  - "The 66.4 owned-list floor in diPhaseGates moved 73 -> 72, following that test's own precedent that the floor equals the list length and moves with a deliberate deletion; it is not a lowered gate floor"

patterns-established:
  - "Run the gate's first describe red before the deletion, record the red run, then delete until green"
  - "An unused gate export fails knip, so a helper lands in the commit that first uses it (findExportedFunctions and findImporters arrived with the schedule test)"

requirements-completed: []

plan_head_before: 4d711ee4b8f7f56d40fd9dfff5d17faf44a4850f
plan_head_after: e954ece0dd77021ab029f3949e0f99e74c9823ee

duration: 45min
completed: 2026-11-22
status: complete
---

# Phase 86 Plan 05: Delete gate and shim schedule machinery Summary

**The Phase 86 delete-gate machinery now exists once and is proven on a real deletion: a shared scan helper, a per-slice port-complete gate whose first slice (images_cache) went red then green, and a shim and resolver schedule whose shape checker reads the TypeScript AST and was driven red-first.**

## Performance

- **Duration:** about 45 min
- **Tasks:** 2 (Task 2 as RED then GREEN)
- **Commits:** 3 (feat, test, feat)

## Accomplishments

- `infoPortGate.ts` is the single scan helper both gates read through. Every scan has a planted-violation self-test; the walk returns a count a floor pins.
- `imagesCachePortComplete` is the first per-slice describe. It fails if `images_cache.ts` returns, if any of `createImageFetches`, `ImageFetches`, `initImagesCache`, `getImageFromCache`, `imageFetches` is named under `src/backend`, or if a `GAMELIB_IMAGES_CACHE` flag string appears under `src/` or `src-tauri/src`.
- `infoShimSchedule.test.ts` holds the empty `SCHEDULE` (row shape `{ name, file, shape, channel, inputs?, callers, deletedBy }`) and checks discovery set-equality in both directions, the shim or resolver shape, the sent channel, `deletedBy` in 87..99, and the exact caller set.
- `images_cache.ts` and the `imageFetches` runtime slot are deleted (D-22).

## The gate's red run (before the deletion)

`pnpm exec jest --runTestsByPath src/backend/__tests__/infoPortComplete.test.ts` with `images_cache.ts` still present: 6 failed, 9 passed.

- `src/backend/images_cache.ts is deleted`: "expected deleted, still on disk: src/backend/images_cache.ts"
- the five `non-test code under src/backend never names <id>` cases, each reporting `src/backend/appRuntime.ts` and `src/backend/images_cache.ts`
- the flag scan and all self-tests passed, as expected

After `git rm src/backend/images_cache.ts` and removing the slot: green.

## Measured floors

- Walk over non-test `.ts/.tsx/.rs` under `src/` and `meta/`: **1329 files** after the deletion (1330 before). Floor set to 800 so the 87-99 deletions cannot trip it; it only has to prove the walk read a real tree.
- `src-tauri/src` `.rs` files: 66, floor 40. `src/backend` non-test `.ts/.tsx`: 611 (612 before), floor 400.
- Row 5 (carry-forward): the machinery supports it directly. A slice spec may list `storeRowKeys`, and its describe then fails if `storeTable.json` drops one, so 86-11, 86-17 and 86-24 can pin their EXTRA_ROWS keys in the same describe that proves the TS registration is gone.

## Task commits

1. Task 1 (tracer): `ad5d5dc22` feat(86-05): per-slice delete gate and shared scan helper, delete images_cache (D-22)
2. Task 2 RED: `b898dc6d1` test(86-05): failing shim and resolver schedule test (9 failing: resolver rule and two stubbed discovery helpers)
3. Task 2 GREEN: `e954ece0d` feat(86-05): resolver rule, exported-function discovery and importer detection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] meta/knip-baseline.txt needed no edit**
- **Found during:** Task 1
- **Issue:** The plan listed `meta/knip-baseline.txt` as a file to update, and `images_cache.ts` said it was knip-baselined. The baseline holds no `images_cache` line (the ratchet is exact in both directions and passed before and after).
- **Fix:** None needed; left the baseline untouched.

**2. [Rule 3 - Blocking] diPhaseGates owned-list floor 73 -> 72**
- **Found during:** Task 1
- **Issue:** Removing `images_cache.ts` from `OWNED_66_4` made its length-equals-floor check fail (72 below 73).
- **Fix:** Followed the test's own recorded precedent (each deliberate deletion moves the floor with the list), with a comment line naming this plan. This is the list shrinking, not a gate floor lowered to turn a red run green.
- **Files modified:** src/backend/__tests__/diPhaseGates.test.ts
- **Commit:** ad5d5dc22

**3. [Rule 3 - Blocking] Task 1 exports trimmed to what Task 1 uses**
- **Found during:** Task 1
- **Issue:** `pnpm find-deadcode` failed on exports with no consumer yet (`findExportedFunctions`, `findImporters`, `findRustInfoCalls`, `checkShimShape`, the two row types).
- **Fix:** Task 1 shipped `findRustInfoCalls` and the shim rule, each with a self-test in `infoPortComplete.test.ts`; `findExportedFunctions`, `findImporters` and the resolver rule arrived in Task 2 (RED stubs, then GREEN). The row types stayed unexported until the schedule test used `ShimRow`.

**4. [Rule 1 - Bug] jest rejects an empty `it.each` table**
- **Found during:** Task 2
- **Issue:** The per-row checks were written as `it.each(SCHEDULE...)`; with SCHEDULE empty jest errors.
- **Fix:** One `it` per check looping over SCHEDULE.

**Cosmetic:** the comments in `appRuntime.ts`, `appRuntime.test.ts` and `diPhaseGates.test.ts` that named image fetches or the deleted file were reworded.

### Left as planned

The renderer's guarded `imagecache://` branch (`CachedImage` and `imageCacheSchemeAvailable`, hard-coded false) stays, filed as `.planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md` (minor, platform any, ready code). Its comments still name the deleted file; the todo covers them.

## Verification

- `test ! -e src/backend/images_cache.ts`: pass
- `pnpm exec jest --runTestsByPath` over infoPortComplete, infoShimSchedule, appRuntime, diPhaseGates: all pass (infoPortComplete + infoShimSchedule 52 tests)
- `pnpm codecheck`, `pnpm find-deadcode` (312 baselined, unchanged), `pnpm planning-gates` (12/12), `pnpm boundaries`: pass
- `npx prettier --check` over the five written source files: clean; `eslint` over the three new files: clean
- `grep -c imageFetches src/backend/appRuntime.ts`: 0. `grep -c deletedBy src/backend/__tests__/infoShimSchedule.test.ts`: 5

## Foreign failures (recorded, not fixed)

- `pnpm backend-di-ceilings` fails on `steam/__tests__/optInDlc.test.ts` and `frontend/state/__tests__/libraryStoreFollowers.test.ts` (jestMock, no baseline entry), pre-existing and listed in the carry-forward.
- The foreign dirty files (cache.ts and its test, sidecar/*, gog/**, state.json, debug and spikes) were not touched; `git status --short` matched the start snapshot apart from this plan's own files.

## Known Stubs

None.

## Threat Flags

None. The plan adds test-time scans only; no endpoint, auth path or file access at runtime.

## Self-Check: PASSED

- FOUND: src/backend/testUtils/infoPortGate.ts, src/backend/__tests__/infoPortComplete.test.ts, src/backend/__tests__/infoShimSchedule.test.ts, the todo file
- MISSING (as intended): src/backend/images_cache.ts
- FOUND commits: ad5d5dc22, b898dc6d1, e954ece0d
