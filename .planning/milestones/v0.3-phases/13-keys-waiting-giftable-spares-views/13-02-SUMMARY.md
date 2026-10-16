---
phase: 13-keys-waiting-giftable-spares-views
plan: 02
subsystem: backend
tags: [electron-store, ipc, humble, disconnect-survival, server-side-validation]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    provides: humbleOwnershipOverrideStore/setOwnershipOverride precedent (D-42/D-43) and the ownedElsewhere/matchConfidence key fields this plan's validation reads
provides:
  - humbleGiftedAtStore — a disconnect-surviving electron-store keyed by machineName recording gift-action confirmation timestamps (D-59)
  - HumbleLibrary.recordGiftLinkOpened / getAllGiftedAt library functions
  - humbleRecordGiftLinkOpened / humbleGetGiftedAt IPC channels with server-side ownedElsewhere+UNREVEALED re-validation
affects: [13-04 (Giftable Spares view consumes humbleGetGiftedAt/humbleRecordGiftLinkOpened)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Disconnect-survival store carve-out: new stores that must outlive HumbleUser.disconnect() are named as a 3rd/Nth exclusion in the single carve-out comment block, never given their own .clear() call"
    - "Server-side IPC re-validation: write-path IPC handlers re-check the authoritative key-state condition against HumbleLibrary.getKeys() and logWarning+no-op on mismatch, never trusting renderer-side gating (mirrors humbleSetOwnershipOverride)"

key-files:
  created: []
  modified:
    - src/backend/humble/electronStores.ts
    - src/backend/humble/user.ts
    - src/backend/humble/library.ts
    - src/backend/humble/ipc_handler.ts
    - src/common/types/ipc.ts
    - src/backend/humble/__tests__/electronStores.test.ts

key-decisions:
  - "D-59 reinterpreted per D-57: the gifted-at store records a confirmation timestamp only — GameLib never possesses or persists a gift-link URL/token"
  - "recordGiftLinkOpened does not call recomputeOwnership — gifting a key has no effect on ownership/classification, unlike setOwnershipOverride"

patterns-established:
  - "Pattern: server-side IPC handlers for state-changing actions must re-derive eligibility from HumbleLibrary.getKeys() at call time, not trust a renderer that only rendered the button conditionally"

requirements-completed: [HVIEW-02]

# Metrics
duration: 20min
completed: 2026-07-07
---

# Phase 13 Plan 02: Gift-Link Persistence + Validated IPC Summary

**Disconnect-surviving humbleGiftedAtStore plus server-validated humbleRecordGiftLinkOpened/humbleGetGiftedAt IPC channels for the Giftable Spares double-gift guard.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-07T18:52:00+12:00 (approx.)
- **Completed:** 2026-07-07T19:23:00+12:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `humbleGiftedAtStore` (CacheStore, `humble_gifted_at`, keyed by machineName) mirroring the `humbleOwnershipOverrideStore` precedent exactly, including the disconnect-exclusion doc comment and export.
- Extended `HumbleUser.disconnect()`'s existing carve-out comment to name three excluded stores (revealed / ownership-override / gifted-at) rather than adding any new `.clear()` call — the Pitfall 5 regression this plan explicitly guards against.
- Added a `humbleGiftedAtStore` test describe block proving both creation/keying and D-59 disconnect survival (clears configStore/humbleLibraryStore/humbleSyncStore, asserts the gifted-at value persists).
- Added `HumbleLibrary.recordGiftLinkOpened(machineName)` (write, no recomputeOwnership) and `HumbleLibrary.getAllGiftedAt()` (read, returns `Record<string, number>`), exported from the `HumbleLibrary` object.
- Added `humbleRecordGiftLinkOpened` IPC handler that re-validates `ownedElsewhere && state === 'UNREVEALED'` against the live key set from `HumbleLibrary.getKeys()`, rejecting with `logWarning(machineName only)` + no-op on any mismatch — mirrors `humbleSetOwnershipOverride`'s non-fuzzy rejection shape.
- Added `humbleGetGiftedAt` IPC handler delegating to `HumbleLibrary.getAllGiftedAt()`.
- Added both new channel signatures to `AsyncIPCFunctions` in `common/types/ipc.ts` directly after `humbleClearOwnershipOverride`, each with a doc comment citing D-59/D-57 and the server-side validation contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: humbleGiftedAtStore + disconnect carve-out + survival test** - `5c716e82` (feat, tdd)
2. **Task 2: library.ts record/read functions + validated IPC channels** - `9981f4c4` (feat)

**Plan metadata:** (this commit, added by orchestrator per worktree isolation policy — SUMMARY.md/REQUIREMENTS.md only)

## Files Created/Modified
- `src/backend/humble/electronStores.ts` - new `humbleGiftedAtStore` CacheStore + export
- `src/backend/humble/user.ts` - carve-out comment extended to name `humbleGiftedAtStore` as a third disconnect-exempt store (no `.clear()` call added)
- `src/backend/humble/library.ts` - `recordGiftLinkOpened`/`getAllGiftedAt` functions + `HumbleLibrary` export additions
- `src/backend/humble/ipc_handler.ts` - `humbleRecordGiftLinkOpened` (validated) + `humbleGetGiftedAt` handlers
- `src/common/types/ipc.ts` - `humbleRecordGiftLinkOpened`/`humbleGetGiftedAt` AsyncIPCFunctions signatures
- `src/backend/humble/__tests__/electronStores.test.ts` - `humbleGiftedAtStore` describe block (creation + D-59 survival)

## Decisions Made
- Followed the plan's literal precedent-mirroring instructions exactly: `humbleGiftedAtStore` mirrors `humbleOwnershipOverrideStore` structurally (declaration, export-block position, disconnect carve-out); `recordGiftLinkOpened`/`getAllGiftedAt` mirror `setOwnershipOverride`/`getKeys`; the IPC handler mirrors `humbleSetOwnershipOverride`'s reject-and-log shape.
- `recordGiftLinkOpened` intentionally omits `recomputeOwnership()` (plan-directed) since gifting doesn't change classification/ownership — distinct from `setOwnershipOverride`, which does recompute.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 (Giftable Spares view) can now call `humbleRecordGiftLinkOpened(machineName)` on gift-link click and `humbleGetGiftedAt()` to read the map for disabling/labeling already-gifted rows.
- No new Humble network calls were added (D-57 confirmed: static deep-link, GameLib never possesses a gift-link value) — nothing here changes the C5 adapter boundary.
- Full `src/backend/humble` suite (256 tests, 9 suites) and `pnpm codecheck` both pass clean; no blockers for downstream plans.

---
*Phase: 13-keys-waiting-giftable-spares-views*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: .planning/phases/13-keys-waiting-giftable-spares-views/13-02-SUMMARY.md
- FOUND: 5c716e82 (Task 1 commit)
- FOUND: 9981f4c4 (Task 2 commit)
