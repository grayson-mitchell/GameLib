---
phase: 11-library-sync-5-state-key-model
plan: 02
subsystem: backend
tags: [electron-store, concurrency-pool, humble, typescript]

# Dependency graph
requires:
  - phase: 11-library-sync-5-state-key-model
    plan: 01
    provides: HumbleKey/HumbleOrderCacheEntry/HumbleSyncState type contracts, humbleLibraryStore/humbleSyncStore/humbleRevealedStore three-way store split, HUMBLE_SYNC_CONCURRENCY/HUMBLE_COOLDOWN_MS constants, classifyOrder, 429->access_denied adapter mapping
provides:
  - HumbleLibrary (loadCached/sync/getKeys/getSyncState) sync orchestration
  - Bounded-concurrency order-detail fan-out with per-order commit and fail-soft (typed + thrown)
  - HumbleUser.disconnect() extended to clear library/sync stores, preserve REVEALED store
affects: [11-03, 11-04, 11-05-real-account-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled bounded-concurrency pool (runBounded): N workers each pull the next array index in a loop; abort only stops NEW dispatch, in-flight tasks always settle and commit -- no external p-limit dependency needed for a 2-3 concurrent fetch bound"
    - "Every adapter call site wrapped in its own try/catch mirroring user.ts:checkHealthAndFlagExpiry, since AdapterResult only covers 401/403/429 -- network/timeout/5xx still throw and must never escape as unhandled rejections"
    - "Sync-state stored as one whole HumbleSyncState record under a single CacheStore key ('state'), patched via a read-merge-write helper, rather than one CacheStore key per field"

key-files:
  created:
    - src/backend/humble/library.ts
    - src/backend/humble/__tests__/library.test.ts
  modified:
    - src/backend/humble/user.ts
    - src/backend/humble/__tests__/user.test.ts
    - src/backend/humble/electronStores.ts

key-decisions:
  - "Widened humbleSyncStore's CacheStore generic from <number, 'syncedAt'> to <HumbleSyncState, 'state'> -- the Plan 01 declaration could only persist a number under one literal key and had no way to hold syncError/cooldownUntil, which this plan's own behavior spec requires. library.ts owns a getSyncState()/setSyncState() read-merge-write pair over the single 'state' key."
  - "runBounded() treats BOTH access_denied and session_expired as abort-dispatch signals (stop launching new work), but sync() only sets syncError/cooldown for access_denied -- a session_expired mid-sync returns {status:'failed'} with no syncError, exactly mirroring the gamekeys-level session_expired branch, since Phase 10 owns expiry end-to-end."
  - "Mid-sync access_denied (403/429) sets syncError='partial' (not 'denied') and still sets cooldownUntil -- 'denied' is reserved for the gamekeys-level whole-sync-refused case where zero data was fetched; 'partial' signals some orders committed before the abort (D-34), while the cooldown still applies because Humble did in fact deny a request."

patterns-established:
  - "fetchAndCommitOrder()'s per-order try/catch keeps the prior cache entry byte-for-byte untouched (never merges/re-derives from it) on both schema_error and a caught throw -- classifyOrder is only ever called with the freshly-fetched response (Pitfall 5 compliance carried forward from Plan 01's classify.ts contract)"

requirements-completed: [HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04]

# Metrics
duration: 25min
completed: 2026-07-05
---

# Phase 11 Plan 02: Sync Orchestration + Disconnect Store Split Summary

**Bounded-concurrency (3 in-flight) Humble order-detail sync with skip-terminal partitioning, per-order commit-on-resolve, and fail-soft against both the typed access_denied/schema_error results and the still-thrown network/timeout/5xx class -- plus disconnect() now wipes the library/sync cache while permanently preserving the REVEALED-flag store.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-05 (Phase 11 wave 2)
- **Completed:** 2026-07-05
- **Tasks:** 2 completed (Task 1 followed RED/GREEN TDD gates)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Implemented `HumbleLibrary` in `src/backend/humble/library.ts`: `loadCached()` (cache-then-render, no network), `sync()` (bounded-concurrency fetch + classify + commit), `getKeys()` (flattened cache read), `getSyncState()` (fail-soft state read).
- Three-bucket `partitionGamekeys()` (Pitfall 3): a gamekey never seen in `humbleLibraryStore` always fetches; a cached entry with `allTerminal: false` always re-fetches (HSYNC-03 expiration recompute); only a cached `allTerminal: true` entry freezes and is skipped.
- Hand-rolled `runBounded()` concurrency pool capped at `HUMBLE_SYNC_CONCURRENCY` (3): stops dispatching new work on the first `access_denied`/`session_expired`, but every already-in-flight task still settles and commits (Pitfall 4) -- verified with a counter-based test asserting `maxInFlight <= 3` across 7 gamekeys.
- Per-order isolation (`fetchAndCommitOrder`, Pattern 2): a `schema_error` or a caught transient throw on one order's detail fetch keeps that gamekey's prior cache entry completely untouched and lets the rest of the pool continue -- verified for both failure classes independently.
- Every `getGamekeys`/`getOrderDetail` call site wrapped in its own try/catch mirroring `user.ts:checkHealthAndFlagExpiry` exactly, so the network/timeout/5xx class the adapter still throws (T-11-08/D-31) is caught at both levels: cache untouched, `syncError='network'`, no cooldown, `{status:'failed'}` -- never an unhandled rejection.
- `access_denied` (including HTTP 429 via Plan 01's mapping) sets `syncError='denied'` + `cooldownUntil` when it happens at the `getGamekeys` level (nothing fetched yet); a mid-sync 403/429 instead sets `syncError='partial'` (some orders already committed, D-34) while still setting the cooldown.
- `session_expired` at either level returns `{status:'failed'}` without ever touching `syncError`/`cooldownUntil` -- Phase 10's expiry machinery owns that state exclusively.
- Extended `HumbleUser.disconnect()` to clear `humbleLibraryStore` and `humbleSyncStore` (fully reconstructible via re-sync) while never touching `humbleRevealedStore`, closing the HSYNC-02 disconnect-survival requirement and Pitfall 1 (a disconnect must never regress a REVEALED key back to UNREVEALED).

## Task Commits

Each task was committed atomically:

1. **Task 1: Sync orchestration in library.ts** -- TDD cycle:
   - RED: `afc15374` (test) -- 16 failing/erroring library.test.ts cases (module doesn't exist)
   - GREEN: `e09a2608` (feat) -- library.ts implementation + electronStores.ts humbleSyncStore widening, all 16 cases pass
2. **Task 2: Extend disconnect() to preserve the REVEALED-flag store** -- `198e7cf8` (fix)

_TDD gate sequence verified in git log: test(11-02) commit precedes feat(11-02) commit for Task 1._

## Files Created/Modified

- `src/backend/humble/library.ts` - New: `HumbleLibrary` (loadCached/sync/getKeys/getSyncState), private `partitionGamekeys`/`runBounded`/`fetchAndCommitOrder`/`getSyncState`/`setSyncState` helpers
- `src/backend/humble/__tests__/library.test.ts` - New: full behavior coverage (partitioning, concurrency cap, typed + thrown fail-soft, per-order isolation, mid-sync abort commit semantics)
- `src/backend/humble/electronStores.ts` - `humbleSyncStore` generic widened from `CacheStore<number, 'syncedAt'>` to `CacheStore<HumbleSyncState, 'state'>`
- `src/backend/humble/user.ts` - `disconnect()` now clears `humbleLibraryStore`/`humbleSyncStore`; D-04 comment extended to document the REVEALED-store exclusion rationale
- `src/backend/humble/__tests__/user.test.ts` - Added `humbleLibraryStore`/`humbleSyncStore`/`humbleRevealedStore` mocks + a disconnect() test asserting the survival split

## Decisions Made

- `humbleSyncStore`'s type was widened to store the whole `HumbleSyncState` record under one `'state'` key rather than one CacheStore key per field, since the original `<number, 'syncedAt'>` declaration structurally could not hold `syncError`/`cooldownUntil` (see Deviations below).
- `runBounded()` aborts dispatch on `access_denied` OR `session_expired`, but only `access_denied` ever writes `syncError`/`cooldownUntil` -- a `session_expired` outcome anywhere in the pool short-circuits `sync()` to `{status:'failed'}` with the sync-state record left exactly as it was, consistent with the gamekeys-level `session_expired` branch and Phase 10 owning all expiry state.
- Mid-sync `access_denied` distinguishes `syncError='partial'` from the gamekeys-level `syncError='denied'` -- 'denied' means the whole sync was refused before any data moved; 'partial' means some orders were already committed when the denial arrived (D-34). Both set the cooldown, since either way Humble did signal a real denial.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Widened `humbleSyncStore`'s CacheStore generic type**
- **Found during:** Task 1 implementation (before writing library.ts, while reviewing Plan 01's `electronStores.ts`)
- **Issue:** Plan 01 declared `humbleSyncStore` as `CacheStore<number, 'syncedAt'>` -- a store whose `.set()`/`.get()` signatures only accept the literal key `'syncedAt'` with a `number` value. This plan's own behavior spec requires persisting `syncError` (a string union) and `cooldownUntil` (a number) alongside `syncedAt` on the same store, which the declared type could not structurally support (TypeScript would reject `.set('syncError', 'network')` against that generic).
- **Fix:** Changed the declaration to `CacheStore<HumbleSyncState, 'state'>`, storing the entire `HumbleSyncState` record under a single `'state'` key. `library.ts` added a private `getSyncState()`/`setSyncState(patch)` read-merge-write pair so callers still get/patch individual fields (`syncedAt`, `syncError`, `cooldownUntil`) without the store itself needing per-field keys.
- **Files modified:** `src/backend/humble/electronStores.ts`
- **Verification:** `npm run codecheck` exits 0; all 16 `library.test.ts` cases (including the `getSyncState()` default test and every fail-soft syncError/cooldown assertion) pass.
- **Committed in:** `e09a2608` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking issue] Fixed a lint error surfaced while validating the task**
- **Found during:** Task 2 (running `npm run codecheck`/eslint as part of this plan's final verification pass)
- **Issue:** `library.ts`'s `fetchAndCommitOrder` caught `err` in its try/catch but never referenced the variable (only a fixed log string), tripping `@typescript-eslint/no-unused-vars`.
- **Fix:** Renamed the caught binding to `_err` (the project's established allowed-unused-caught-error convention, confirmed via the existing eslint rule config `must match /^_/`).
- **Files modified:** `src/backend/humble/library.ts`
- **Verification:** `npx eslint src/backend/humble --ext .ts` now exits 0 errors (46 pre-existing `any`-related warnings unchanged, none introduced by this plan's files beyond the same warning class already present in `adapter.test.ts`/`user.test.ts`).
- **Committed in:** `198e7cf8` (Task 2 commit, since it was discovered during that task's final verification)

---

**Total deviations:** 2 auto-fixed (Rule 1 bug fix required to satisfy the plan's own behavior spec; Rule 3 blocking lint fix)
**Impact on plan:** Both fixes were required for the plan's own acceptance criteria (`npm run codecheck` exits 0) to pass; no scope creep, no architectural change. The `electronStores.ts` type widening is additive (same store name/file, same three exports) and does not affect Plan 01's already-committed classification/adapter work.

## Issues Encountered

None beyond the two auto-fixed deviations above. The `resetMocks: true` project jest config (documented in `jest.config.js` and referenced in `user.test.ts`/steam `library.test.ts`) required the store mocks in `library.test.ts` to re-establish their `has`/`get`/`set`/`entries`/`clear` implementations in `beforeEach()` rather than once at module scope -- this is an established project testing convention, not a plan deviation, and is called out via `resetStoreMocks()` in the new test file.

## User Setup Required

None -- no external service configuration required. Zero new npm dependencies (the concurrency pool is hand-rolled per RESEARCH.md's "Don't Hand-Roll" guidance, since `p-limit`'s current major is ESM-only and an awkward fit for this project's Electron main bundle).

## Next Phase Readiness

- `HumbleLibrary.sync()`/`loadCached()`/`getKeys()`/`getSyncState()` are ready for Plan 03/04 to wire into the `humbleSync`/`humbleGetKeys`/`humbleGetSyncState` IPC handlers (types already defined in Plan 01's `common/types/ipc.ts`) and the frontend Humble Keys screen.
- `HumbleUser.disconnect()`'s store-survival split (library/sync wiped, REVEALED preserved) is ready for Plan 03/14's claim-flow work, which depends on the REVEALED flag never regressing across a disconnect/reconnect cycle.
- No blockers. Plan 05's real-account UAT remains the designated verification point for the still-unconfirmed live-API assumptions this plan's classification/schema layers depend on (carried over from Plan 01).

---
*Phase: 11-library-sync-5-state-key-model*
*Completed: 2026-07-05*
