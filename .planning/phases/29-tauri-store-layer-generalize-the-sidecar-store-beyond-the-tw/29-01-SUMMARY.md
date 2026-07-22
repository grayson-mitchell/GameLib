---
phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
plan: 01
subsystem: infra
tags: [tauri, sidecar, electron-store, jest, atomic-write]

# Dependency graph
requires:
  - phase: 27-tauri-shell-walking-skeleton
    provides: fileStore.ts (minimal electron-store replacement, pathShim.ts, T-27-03 path guard)
  - phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
    provides: electronUntouched.test.ts real-config-directory safety proof, three-way mock isolation convention
provides:
  - fileStore.ts path-keyed shared data cell (cellRegistry) closing the D-14 same-path clobber
  - fileStore.ts options.defaults support (on-disk wins over defaults)
  - fileStore.ts atomic persist (temp file + rename, with direct-write fallback)
  - Greppable D-07 (accepted cross-process clobber) and D-14 (in-process shared cell) documentation
  - First unit test suite for fileStore.ts (src/backend/sidecar/__tests__/fileStore.test.ts)
affects: [29-02, 29-04, 29-05, 29-06, 29-07, storeLayer, tauri-store-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Path-keyed in-memory data cell (Map<filePath, {data}>) to dedup two store instances at the same resolved on-disk path"
    - "Atomic file write: writeFileSync to a pid-suffixed temp file then renameSync onto the real path, with a direct-write fallback on rename failure"

key-files:
  created:
    - src/backend/sidecar/__tests__/fileStore.test.ts
  modified:
    - src/backend/sidecar/fileStore.ts

key-decisions:
  - "D-14 fix implemented as a module-level cellRegistry keyed by resolved filePath — new FileStore() still returns a distinct object per call, but the underlying data object is shared across instances at the same path"
  - "D-02b: options.defaults seeds unset keys under loaded data at cell-creation time only; defaults are never written to disk at construction (deviates intentionally from electron-store/conf, which does persist defaults)"
  - "D-10 atomic persist falls back to a direct writeFileSync if renameSync fails, so a persist can never be silently lost; diagnostic goes to stderr without ever including store values (token material lives in these stores)"

requirements-completed: [REQ-29-06, REQ-29-05]

# Metrics
duration: 8min
completed: 2026-07-22
---

# Phase 29 Plan 01: fileStore hardening Summary

**Path-keyed shared data cell closes the steamConfigStore/steamBottleConfigStore same-file write clobber; added options.defaults, atomic temp+rename persist, and the first unit suite for fileStore.ts.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-22T17:58:44+12:00 (previous docs commit)
- **Completed:** 2026-07-22T18:06:42+12:00
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Closed the D-14 same-on-disk-path clobber: `steamConfigStore` and `steamBottleConfigStore` both resolve to `steam_store/config.json`; a module-level `cellRegistry` (`Map<filePath, {data}>`) now shares one in-memory data object across every `FileStore` instance at the same path, so a write through either instance is visible to (and survives) the other.
- Added `options.defaults` handling (D-02b): a key present only in `defaults` reads back as the default, an on-disk value for the same key wins; defaults are never persisted to disk at construction.
- Made `persist()` atomic (D-10): writes to `${filePath}.tmp-${pid}` then `renameSync`s onto the real path; falls back to a direct `writeFileSync` (with a value-free stderr diagnostic) if the rename fails, so a crash mid-persist can no longer truncate the file and a persist is never silently dropped.
- Documented D-07 (accepted cross-process Electron/Tauri write clobber) and D-14 in a greppable module docstring, naming the colliding stores and referencing `SEAM.md`.
- Preserved the T-27-03 path-tampering guard byte-for-byte (`resolveStorePath()` unchanged).
- Created `src/backend/sidecar/__tests__/fileStore.test.ts` — the first unit suite for this file — covering the same-path-collision regression, `options.defaults`, atomic persist, dot-notation, the `cache.ts` D-11 surface (`clear`/`store` getter-setter/`Symbol.iterator`), and corrupt-file recovery. Uses the mandatory three-way `os`/`electron`/`electron-store` mock isolation pattern so no test path can ever resolve under the real user profile.

## Task Commits

Each task was committed atomically:

1. **Task 1: Path-keyed shared data cell, defaults, atomic persist, D-07/D-14 docs** - `871975e6` (feat)
2. **Task 2: fileStore unit suite incl. the same-path-collision regression** - `4140a4aa` (test)

**Plan metadata:** (pending — this SUMMARY's commit)

## Files Created/Modified
- `src/backend/sidecar/fileStore.ts` - Path-keyed shared cell (`cellRegistry`), `options.defaults` seeding, atomic temp+rename persist with fallback, `__resetFileStoreRegistry()` test hook, D-07/D-14 documentation
- `src/backend/sidecar/__tests__/fileStore.test.ts` - New unit suite (6 tests): same-path collision, defaults, atomic persist, dot-notation, cache.ts D-11 surface, corrupt file recovery

## Decisions Made
- Kept `new FileStore()` returning a distinct object per call (per the plan's explicit instruction) — only the `data` payload is shared via the cell registry, not the instance itself. This preserves any future per-instance state without reopening the D-14 fix's blast radius.
- `__resetFileStoreRegistry()` is exported as a named, clearly-documented test-only function rather than a default-export static method, keeping the production `FileStore` default export's surface unchanged for existing `import FileStore from '../fileStore'` call sites.
- Placed the `load()` helper as a module-level function (was a private instance method) since cell creation, not instance construction, is now the point that needs a fresh disk read.

## Deviations from Plan

None - plan executed exactly as written. All four sub-changes in Task 1 (cellRegistry, defaults, atomic persist, D-07/D-14 docs) and all six required test cases in Task 2 were implemented as specified in the plan's `<action>` blocks.

## Issues Encountered

The `jest.mock('os', ...)` acceptance-criterion grep (`grep -c "jest.mock('os'" ... returns 1`) initially returned 2 because the module docstring also contained the literal substring `jest.mock('os', ...)` in prose. Reworded the docstring to say "the `os` module mock's homedir override" instead, dropping the literal `jest.mock('os'` substring from the comment while keeping the same explanation. Not a deviation from the plan's required behavior — purely wording to satisfy an exact-count acceptance criterion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `fileStore.ts` is now safe for `steamBottleConfigStore` (and any future store) to live in the sidecar without the same-path clobber risk that Phase 29's later plans (29-02 onward) would otherwise arm.
- `options.defaults` and atomic persist are available for any store construction site that needs them.
- The new unit suite (`npx jest src/backend/sidecar/__tests__/fileStore.test.ts`) and the full sidecar suite (`npx jest src/backend/sidecar` — 6 suites, 46 tests) both pass, including `electronUntouched.test.ts` (real-config-directory safety proof), confirming no regression to the `cache.ts` consumer or existing sidecar flows.
- No blockers for 29-02 (next plan in the wave).

---
*Phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw*
*Completed: 2026-07-22*
