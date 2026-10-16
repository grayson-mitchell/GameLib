---
phase: 12-ownership-dedup
plan: 03
subsystem: humble-dedup
tags: [typescript, jest, tdd, humble-bundle, steam, dedup, electron-store]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    plan: 01
    provides: HumbleKey.steamAppId?/ownedElsewhere/matchConfidence overlay fields, HUMBLE_CLASSIFIER_VERSION=3 backfill trigger
  - phase: 12-ownership-dedup
    plan: 02
    provides: Pure ownership-matching module src/backend/humble/dedup.ts (recomputeOwnership, fuzzyMatch, etc.)
provides:
  - humbleOwnershipOverrideStore (D-42/D-43) — disconnect-exempt store for "Not the same game" corrections, keyed by machine_name
  - HumbleLibrary.recomputeOwnership() — double-gated (SteamUser.isLoggedIn() AND non-empty steamLibraryStore) entrypoint wired into runSync()'s final step and exposed for Plan 04's Steam-refresh trigger
  - HumbleLibrary.setOwnershipOverride()/clearOwnershipOverride() — D-42 override CRUD, each re-running recompute
  - Version-bump backfill (HDEDUP-02) proven live end-to-end by test — pre-Phase-12 frozen orders re-fetch once and steamAppId populates
affects: [12-04-ipc, 12-05-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      double-gated recompute (isLoggedIn AND non-empty snapshot) as a keep-last-known floor at the caller boundary,
      store-mutation-then-recompute (setOwnershipOverride/clearOwnershipOverride) so a single write path always leaves the derived overlay fields consistent
    ]

key-files:
  created:
    - src/backend/humble/__tests__/electronStores.test.ts
  modified:
    - src/backend/humble/electronStores.ts
    - src/backend/humble/user.ts
    - src/backend/humble/library.ts
    - src/backend/humble/__tests__/library.test.ts

key-decisions:
  - "recomputeOwnership() is called unconditionally at the end of runSync() (not gated on sync outcome) — a partial sync still committed whatever orders it could, and those newly-captured steamAppIds deserve an immediate match attempt; the function's own double-gate is what actually decides whether anything happens"
  - "recomputeOwnership() call placed AFTER runSync()'s existing CR-01 isStale() fence, so a Humble disconnect mid-sync gets the same protection against re-populating wiped stores without adding a second isStale check"
  - "electronStores.test.ts created against the REAL CacheStore/electron-store (jest.mock('electron-store') tmp-dir redirection, mirroring library.realstore.test.ts) rather than a Map-mocked double, so the disconnect-survival assertion exercises actual on-disk persistence semantics"

patterns-established:
  - "Recompute entrypoints (recomputeOwnership, setOwnershipOverride, clearOwnershipOverride) all funnel through the same private recomputeOwnership() so there is exactly one place that reads humbleLibraryStore.entries(), calls the pure dedup.ts matcher, writes back, and re-pushes humbleKeysUpdated — override CRUD never duplicates that logic"

requirements-completed: [HDEDUP-01, HDEDUP-02]

# Metrics
duration: ~6min
completed: 2026-07-06
---

# Phase 12 Plan 03: Backend Wiring — Ownership Recompute + Override Persistence Summary

**Wired the pure `dedup.ts` matcher into live Humble sync: a disconnect-exempt override store, a double-gated `recomputeOwnership()` that runs at the end of every sync and via an exported entrypoint for Plan 04, and override CRUD methods — all proven by test including the classifier-version backfill that makes pre-Phase-12 cached orders pick up `steamAppId`.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-06T06:43:13+12:00 (first commit)
- **Completed:** 2026-07-06T06:47:19+12:00 (last commit)
- **Tasks:** 2 completed
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `humbleOwnershipOverrideStore` (`humble_ownership_override`, keyed by `machine_name`) added to `electronStores.ts`, mirroring `humbleRevealedStore`'s disconnect-survival contract exactly (D-42/D-43); `user.ts`'s exemption comment extended to name it alongside `humbleRevealedStore` — `disconnect()` itself never imports or references the new store
- New `electronStores.test.ts` runs against the REAL `CacheStore`/`electron-store` (tmp-dir redirected) and proves an override survives a disconnect-style wipe of `configStore`/`humbleLibraryStore`/`humbleSyncStore`
- `HumbleLibrary.recomputeOwnership()`: double-gated on `SteamUser.isLoggedIn()` AND `steamLibraryStore.get('games', []).length > 0` — either failing makes it a complete no-op (no store write, no renderer push), so a Steam hiccup can never zero out a previously-computed `ownedElsewhere: true` (D-48). Otherwise iterates every cached order, runs the pure `dedup.ts` matcher with the D-42 override predicate injected, writes back, and re-pushes `humbleKeysUpdated` as a distinct final push (not the per-order progressive push)
- Called unconditionally at the end of `runSync()` (placed after the existing CR-01 `isStale()` fence, so a disconnect mid-sync gets the same protection for free) and exported standalone for the Plan 04 Steam-refresh trigger
- `setOwnershipOverride(machineName)` / `clearOwnershipOverride(machineName)` (D-42): persist/clear the override then immediately recompute, so the renderer always reflects the corrected flag on the same tick
- Backfill (HDEDUP-02) proven live: a test seeds a pre-Phase-12 frozen (`allTerminal: true`, no `steamAppId`, no stored `classifierVersion`) cache entry, runs `sync()`, and confirms it is re-fetched once, `steamAppId` populates from the mocked `steam_app_id` field, and `classifierVersion` stamps to `HUMBLE_CLASSIFIER_VERSION` (3) — the version-bump mechanism from Plan 01 combined with Plan 02's matcher and this plan's wiring closes the full backfill loop
- 5 new `library.test.ts` cases (backfill, recompute-after-sync, two keep-last-known no-op variants + one positive control, override clear/restore) all green; full humble backend suite 254/254; `tsc --noEmit` clean; eslint shows 0 new errors (pre-existing `any`-typed `mock.calls` warnings only, same pattern already present throughout the file)

## Task Commits

Each task was committed atomically:

1. **Task 1: Override store + disconnect exemption** - `e65036b7` (feat)
2. **Task 2 (TDD RED): failing tests for ownership recompute wiring** - `773cbe1d` (test)
3. **Task 2 (TDD GREEN): wire ownership recompute into HumbleLibrary** - `03976d84` (feat)

No REFACTOR commit — the GREEN implementation needed no cleanup pass.

## TDD Gate Compliance

- RED gate: `773cbe1d` (`test(12-03)`) — 5 new tests failed before implementation existed (1 assertion failure on the not-yet-recomputed key, 4 `TypeError: ... is not a function` for the not-yet-exported entrypoints); verified failing before commit
- GREEN gate: `03976d84` (`feat(12-03)`) — 56/56 `library.test.ts` passing after implementation
- REFACTOR gate: intentionally skipped, no changes needed

## Files Created/Modified

- `src/backend/humble/electronStores.ts` - Added `humbleOwnershipOverrideStore` (`CacheStore<{ overriddenAt: number }, string>`, store name `humble_ownership_override`), exported alongside the existing stores
- `src/backend/humble/user.ts` - Extended the D-04/D-30 disconnect-exemption comment to name `humbleOwnershipOverrideStore` alongside `humbleRevealedStore` (D-42/D-43); `disconnect()`'s clear/wipe path was NOT modified — it never referenced the new store
- `src/backend/humble/library.ts` - Imports `recomputeOwnership` from `./dedup` (aliased `dedupRecomputeOwnership`), `humbleOwnershipOverrideStore` from `./electronStores`, `steamLibraryStore` from `backend/storeManagers/steam/electronStores`, `SteamUser` from `backend/storeManagers/steam/user`. Adds `recomputeOwnership()`, `setOwnershipOverride()`, `clearOwnershipOverride()`; calls `recomputeOwnership()` at the end of `runSync()`; exports all three on `HumbleLibrary`
- `src/backend/humble/__tests__/electronStores.test.ts` (new) - 2 tests against the real electron-store-backed `CacheStore`: override store creation/keying, and disconnect-style-wipe survival
- `src/backend/humble/__tests__/library.test.ts` - New mocks for `backend/storeManagers/steam/electronStores` (`steamLibraryStore.get`) and `backend/storeManagers/steam/user` (`SteamUser.isLoggedIn`), plus a `mockOverrideStore` for `humbleOwnershipOverrideStore`; `makeRawOrder()` extended to accept `title`/`steamAppId` options; 4 new `describe` blocks covering backfill, recompute-after-sync, keep-last-known (2 no-op cases + 1 positive control), and override clear/restore

## Decisions Made

- **Unconditional recompute call at sync end**: `recomputeOwnership()` is invoked regardless of `sawFailure` (clean vs. partial sync) because a partial sync still committed every order that DID succeed, and those rows' `steamAppId`/title deserve an immediate ownership pass. The double-gate inside `recomputeOwnership()` is the sole authority on whether the pass actually mutates anything — no redundant outcome-based gating was added at the call site.
- **Placement after the existing CR-01 fence**: rather than adding a second `isStale()` check around the new call, it was placed immediately after `runSync()`'s pre-existing `if (isStale()) return { status: 'failed' }` guard — a disconnect mid-sync already short-circuits before reaching the new code, so no additional fence logic was needed.
- **electronStores.test.ts against the real store, not a Map double**: the plan's acceptance criterion is specifically about disconnect *survival*, which is a persistence-semantics claim; a Map-mocked double would prove nothing about the actual `CacheStore`/`electron-store` interaction (this mirrors the project's own established pattern in `library.realstore.test.ts`).

## Deviations from Plan

None — plan executed as written. Both tasks' acceptance criteria and behavior specs were implemented and verified without any Rule 1-4 deviations.

## Authentication Gates

None (no auth-gated code touched in this plan).

## Known Stubs

None. Both `recomputeOwnership()`'s double-gate and the override CRUD methods are fully implemented and exercised by tests. IPC exposure of `setOwnershipOverride`/`clearOwnershipOverride` and the Steam-refresh call site for `recomputeOwnership()` are explicitly out of scope for this plan (Plan 04's stated responsibility) — not stubs, but the next plan's wiring surface.

## Threat Flags

None beyond the plan's own threat model. T-12-02 (tampering via stale Steam data) mitigated by the double-gate proven via 3 dedicated tests; T-12-04 (tampering via disconnect wipe) mitigated by the disconnect-exemption + `electronStores.test.ts`; T-12-06 (information disclosure via `humbleKeysUpdated`) unchanged — the payload shape is untouched by this plan, still the display-safe `getKeys()` projection.

## Orchestrator Notes

- REQUIREMENTS.md deliberately NOT touched (shared artifact) — HDEDUP-01/02 are now functionally complete end-to-end at the backend layer, but the orchestrator owns marking requirements complete after all worktree agents in this wave finish, per the standard protocol.
- STATE.md / ROADMAP.md untouched per worktree protocol.

## Self-Check: PASSED

- FOUND: src/backend/humble/electronStores.ts (exports humbleOwnershipOverrideStore; grep count 2)
- FOUND: src/backend/humble/user.ts (disconnect() exemption comment names humbleOwnershipOverrideStore; disconnect() body does not reference it)
- FOUND: src/backend/humble/library.ts (imports recomputeOwnership from ./dedup, steamLibraryStore from steam electronStores, SteamUser from steam user; exports recomputeOwnership/setOwnershipOverride/clearOwnershipOverride on HumbleLibrary)
- FOUND: src/backend/humble/__tests__/electronStores.test.ts (2 tests)
- FOUND commit e65036b7 (feat(12-03): add ownership-override store exempt from disconnect wipe)
- FOUND commit 773cbe1d (test(12-03): add failing tests for ownership recompute wiring)
- FOUND commit 03976d84 (feat(12-03): wire ownership recompute into HumbleLibrary)
- jest src/backend/humble/__tests__/electronStores.test.ts: 2/2 passed
- jest src/backend/humble/__tests__/library.test.ts: 56/56 passed
- jest src/backend/humble (full suite): 254/254 passed
- jest src/backend/storeManagers/steam (regression check, no circular-import breakage): 170/170 passed
- tsc --noEmit: clean
- eslint on all 5 touched files: 0 errors (58 pre-existing-pattern `any`-typed warnings in library.test.ts, unchanged in kind from before this plan)
