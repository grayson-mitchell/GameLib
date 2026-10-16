---
phase: 19-crossover-compatibility-index-macos
plan: 03
subsystem: infra
tags: [zod, electron-store, cache, backend, crossover-index]

# Dependency graph
requires: []
provides:
  - "crossoverIndexSchema (zod) + CrossoverIndex type validating the CrossOver compatibility index payload (D-09)"
  - "crossoverIndexStore: 24h-TTL, keep-last-good CacheStore (invalidateCheck: () => false, D-08/D-09)"
  - "IndexDescriptor<T> + loadIndex<T>(): the single D-19 seam for fetch -> gunzip -> safeParse -> fallback"
affects: [19-crossover-compatibility-index-macos remaining plans (index consumer, IPC bridge, grid badge, deferred mac-arch-overrides index)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-19 seam: one IndexDescriptor<T> type + one generic loadIndex<T>() function, no registry/plugin dispatch"
    - "Keep-last-good CacheStore via invalidateCheck: () => false + a self-managed fetchedAt staleness clock (mirrors umuStore precedent)"
    - "Bundled-snapshot fallback via publicDir + graceful-fs readFileSync, tolerating ENOENT as a normal cold-start"

key-files:
  created:
    - src/backend/crossover_index/schema.ts
    - src/backend/crossover_index/electronStore.ts
    - src/backend/crossover_index/fetcher.ts
    - src/backend/crossover_index/__tests__/schema.test.ts
    - src/backend/crossover_index/__tests__/fetcher.test.ts
  modified: []

key-decisions:
  - "crossoverIndexStore typed CacheStore<CachedIndex<unknown>> (not <CrossoverIndex>) so the single store stays unopinionated about payload shape for future descriptors (D-19); loadIndex<T> narrows back to a concrete T via desc.schema.safeParse"
  - "readFileSync sourced from graceful-fs (not fs) to mirror the existing getCurrentChangelog precedent in src/backend/utils.ts"

patterns-established:
  - "IndexDescriptor<T> = { name, url, bundledPath, schema, ttlMinutes } is the only extension point for future indexes (e.g. deferred mac-arch-overrides.json)"

requirements-completed: [CXIDX-04, CXIDX-05]

# Metrics
duration: ~20min
completed: 2026-07-13
---

# Phase 19 Plan 03: CrossOver Index App-Side Cache Scaffold Summary

**Zod-validated, keep-last-good backend cache layer (schema.ts + electronStore.ts + fetcher.ts) that safely consumes a remotely-published CrossOver compatibility index without a running builder or publishing workflow yet.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completed
- **Files modified:** 5 (all new)

## Accomplishments
- `crossoverIndexSchema` (zod) rejects out-of-bounds ratings, truncated (<1000-entry) payloads, wrong version, and non-object garbage — all via `safeParse`, never throwing (D-09)
- `crossoverIndexStore`: a 24h-TTL `CacheStore` with `invalidateCheck: () => false` so a validated index is never auto-evicted, only ever replaced by a validated newer fetch (D-08/D-09/T-19-05)
- `loadIndex<T>(descriptor)`: the single D-19 seam — fetch (5MB-capped axios) → gunzip → JSON.parse → `schema.safeParse` → on any failure (schema reject, network, gunzip, oversized) falls back to last-good, then bundled snapshot, then `null`, and never throws
- Bundled-snapshot fallback reads via `publicDir` + `graceful-fs` `readFileSync`, tolerating an ENOENT (fresh clone / no artifact yet) as a normal cold-start — logs at info, returns `null`

## Task Commits

Each task was committed atomically:

1. **Task 1: Zod payload schema + keep-last-good CacheStore** - `bab10341` (feat)
2. **Task 2: Generic loadIndex(IndexDescriptor) fetch/validate/keep-last-good layer** - `33c7b3a8` (feat)

_No separate plan-metadata commit — this plan runs inside a worktree; the orchestrator handles STATE.md/ROADMAP.md updates after the wave completes._

## Files Created/Modified
- `src/backend/crossover_index/schema.ts` - `crossoverIndexSchema` (zod) + `CrossoverIndex` type; the D-09 payload validator
- `src/backend/crossover_index/electronStore.ts` - `crossoverIndexStore`, a 24h-TTL keep-last-good `CacheStore<CachedIndex<unknown>>`
- `src/backend/crossover_index/fetcher.ts` - `IndexDescriptor<T>` + `loadIndex<T>()`, the D-19 fetch/validate/fallback seam
- `src/backend/crossover_index/__tests__/schema.test.ts` - 8 tests: accept + 7 reject cases (rating bounds, truncation, version, garbage)
- `src/backend/crossover_index/__tests__/fetcher.test.ts` - 7 tests covering every `<behavior>` case for `loadIndex`

## Decisions Made
- `crossoverIndexStore` typed `CacheStore<CachedIndex<unknown>>` rather than `CacheStore<CachedIndex<CrossoverIndex>>` — keeps the single store unopinionated about payload shape so a future descriptor (e.g. the deferred `mac-arch-overrides.json` index) can share the same store keyed by its own `descriptor.name` without a second store or a type error. `loadIndex<T>` re-narrows to a concrete `T` via `desc.schema.safeParse()` before returning.
- `readFileSync` imported from `graceful-fs`, matching the existing `getCurrentChangelog` bundled-JSON precedent in `src/backend/utils.ts`, rather than Node's built-in `fs` (which the RESEARCH.md interfaces skeleton shorthand implied but the codebase idiom does not use directly).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Retyped `crossoverIndexStore` from `CacheStore<CachedIndex<CrossoverIndex>>` to `CacheStore<CachedIndex<unknown>>`**
- **Found during:** Task 2 (writing `loadIndex<T>`)
- **Issue:** Task 1's `electronStore.ts` hardcoded the store's value type to `CrossoverIndex`. Task 2's `loadIndex<T>` is generic over `T` per the plan's own D-19 seam requirement ("Keep the store generic/unopinionated enough that fetcher.ts can store any descriptor's payload under its `name` key"). A store hardcoded to one concrete type cannot type-check `crossoverIndexStore.set(desc.name, { data: parsed.data, ... })` for an arbitrary `T`.
- **Fix:** Changed the store's generic parameter to `unknown`; `fetcher.ts` casts `crossoverIndexStore.get(desc.name)` to `CachedIndex<T>` (safe because `desc.schema.safeParse` is the actual runtime narrowing/validation gate — the cast never bypasses D-09 validation, it only satisfies the compiler for a value this same module validated on the way in).
- **Files modified:** `src/backend/crossover_index/electronStore.ts` (retyped in the Task 2 commit, alongside `fetcher.ts`)
- **Verification:** `pnpm tsc --noEmit -p .` clean for `crossover_index/*`; both test suites (15 tests total) pass
- **Committed in:** `33c7b3a8` (Task 2 commit)

**2. [Rule 3 - Blocking] Mocking Node's `fs` module broke unrelated backend module init in the fetcher test**
- **Found during:** Task 2 (writing `fetcher.test.ts`)
- **Issue:** The plan's action text said "mock `readFileSync`/publicDir for bundled cases." An initial `jest.mock('fs', ...)` (spreading `jest.requireActual('fs')`) broke `electron-store`'s internal `conf` dependency during the `backend/utils` import chain (`TypeError: Cannot read properties of undefined (reading 'toString')` inside `conf`'s `_encryptData`), because `fetcher.ts` actually needs `readFileSync` sourced from `graceful-fs` (matching the `getCurrentChangelog` precedent), not Node's built-in `fs`.
- **Fix:** Changed `fetcher.ts`'s import to `readFileSync` from `graceful-fs`, and the test to `jest.mock('graceful-fs', ...)` — the exact pattern already used in `src/backend/__tests__/utils.test.ts`.
- **Files modified:** `src/backend/crossover_index/fetcher.ts`, `src/backend/crossover_index/__tests__/fetcher.test.ts`
- **Verification:** `pnpm test -- src/backend/crossover_index` — 2 suites, 15 tests, all pass; full `pnpm test -- src/backend` — 42 suites, 992 tests, all pass (no regressions)
- **Committed in:** `33c7b3a8` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues, both resolved within Task 2 before its commit)
**Impact on plan:** Both fixes were necessary for the code to type-check/run at all; no scope creep, no architectural change, no new dependency. The D-19 seam and D-09 keep-last-good behavior are unchanged from the plan's intent.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required

None - no external service configuration required. (The bundled snapshot file `public/crossover-index.json.gz` and any release-workflow curl step are out of scope for this plan — deferred to a later plan in this phase per RESEARCH.md Pattern 2.)

## Next Phase Readiness

- `loadIndex<CrossoverIndex>` is ready for a real consumer plan to wire a concrete `IndexDescriptor` (name/URL/bundledPath) and call it from a fetch-and-broadcast layer.
- The D-19 seam is proven type-safe for a second descriptor (deferred `mac-arch-overrides.json`) without further abstraction.
- No blockers. `public/crossover-index.json.gz` does not exist yet in this worktree — `loadIndex` will correctly cold-start to `null` until a later plan populates it or a real fetch succeeds.

---
*Phase: 19-crossover-compatibility-index-macos*
*Completed: 2026-07-13*

## Self-Check: PASSED

All 5 created files verified present on disk; both task commits (`bab10341`, `33c7b3a8`) verified present in git log.
