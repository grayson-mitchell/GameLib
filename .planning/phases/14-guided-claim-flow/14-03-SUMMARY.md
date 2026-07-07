---
phase: 14-guided-claim-flow
plan: 03
subsystem: backend
tags: [electron-ipc, humble-bundle, claim-flow, security, write-ahead-audit]

# Dependency graph
requires:
  - phase: 14-guided-claim-flow (Plan 01)
    provides: RevealOutcome/RedeemOutcome/ClaimAnnotation types, 5 new IPC channel signatures, humbleAuditStore/humbleLocalRedeemedStore, HumbleKeyInternal/HumbleOrderCacheEntryInternal internal typing
  - phase: 14-guided-claim-flow (Plan 02)
    provides: adapter revealKey() write call, classifyOrder keyIndexByComposite side-channel + isLocallyRedeemed 4th-arg predicate, HumbleUser.getCsrfToken()
provides:
  - "HumbleLibrary.revealKey/markRedeemed/undoRedeemed — the full C1/C2/SC4/D-77/D-78/D-79 orchestration chain"
  - "patchCachedState direct cache-projection patch (mirrors recomputeOwnership's read-modify-write-then-push shape)"
  - "lookupKeyindex/getRevealedKeyValue/appendAudit/getClaimAnnotations read/audit accessors"
  - "getKeys() now strips the internal-only keyindex/revealedKeyValue fields from every humbleKeysUpdated broadcast (C4/T-14-02)"
  - "5 registered IPC handlers (humbleRevealKey, humbleMarkRedeemed, humbleUndoRedeemed, humbleGetRevealedKeyValue, humbleGetClaimAnnotations) + 5 preload invokers"
affects: [14-04, 14-05, 14-06, 14-wizard-ui-plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct cache-projection patch (patchCachedState) mirrors the established recomputeOwnership read-modify-write-then-push shape for single-key updates"
    - "Write-ahead audit + flag persistence BEFORE a network call, with an explicit definitive-vs-ambiguous outcome split driving rollback-or-keep (SC4/D-78)"

key-files:
  created: []
  modified:
    - src/backend/humble/library.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/backend/humble/ipc_handler.ts
    - src/preload/api/humble.ts

key-decisions:
  - "undoRedeemed's D-77 server-truth no-op guard checks both target.state === 'REDEEMED' AND target.locallyRedeemedPending === true (not just 'is REDEEMED without the flag') — this also safely no-ops on any other state (UNREVEALED/REVEALED/UNPICKED/UNREDEEMABLE) rather than force-patching an unrelated key into REVEALED."
  - "keyindex carry-forward on re-sync is fresh-value-only (no fallback to a prior cached keyindex) per the plan's literal instruction; only revealedKeyValue is explicitly carried forward from the prior cache record when the fresh classify pass lacks one, per the plan's D-74 no-regression requirement."

requirements-completed: [HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-04]

# Metrics
duration: ~25min
completed: 2026-07-08
---

# Phase 14 Plan 03: Claim Orchestration (reveal/redeem/undo) Summary

**revealKey/markRedeemed/undoRedeemed implemented as the single C1 write-ahead-audited orchestration chain, with a definitive-vs-ambiguous rollback split (D-78) and a backend-side C2 hard block that treats fuzzy ownership matches exactly like exact ones (D-70) — plus the 5-channel IPC/preload surface the wizard will consume.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments
- Implemented the phase's safety-critical center: `HumbleLibrary.revealKey()` is the ONLY call site of the adapter's reveal write in the entire backend (C1), enforcing eligibility → C2 re-check (exact AND fuzzy ownership hard-blocked, D-69/D-70) → D-79 cooldown gate → Pitfall-C keyindex-presence guard → write-ahead audit+flag persistence (SC4) → the single adapter call → a definitive-failure-rolls-back / ambiguous-keeps-the-flag outcome split (D-78), in that exact order.
- Added the direct cache-projection patch (`patchCachedState`) and read/audit accessors (`lookupKeyindex`, `getRevealedKeyValue`, `appendAudit`, `getClaimAnnotations`) that the orchestration functions and the future wizard UI consume; `getKeys()` now strips the internal-only `keyindex`/`revealedKeyValue` fields from every broadcast (C4/T-14-02), closing the one place those D-74 internal fields could otherwise leak.
- Wired `classifyOrder`'s new `isLocallyRedeemed` predicate into the sync commit path and persisted its `keyIndexByComposite` output as an internal `keyindex` field on each cached key — with an explicit carry-forward of a prior `revealedKeyValue` so a re-sync can never regress a user's already-revealed key back to "unconfirmed".
- Registered 5 thin, server-side-revalidating IPC handlers + 5 preload invokers; `humbleGetRevealedKeyValue` is the sole C4 narrow-exposure channel that ever transmits a raw key value, and only on-demand.

## Task Commits

Each task was committed atomically:

1. **Task 1: Library helpers — patchCachedState, keyindex map, predicates, key-value + annotation accessors** - `49d13bda` (feat)
2. **Task 2: revealKey / markRedeemed / undoRedeemed orchestration** - `df7a9763` (test, RED) → `33df5ebf` (feat, GREEN)
3. **Task 3: IPC handlers + preload invokers (server-side re-validation)** - `0a5f53a2` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles final metadata commit after merge)

## Files Created/Modified
- `src/backend/humble/library.ts` — `compositeKey`, `patchCachedState`, `toDisplayKey` (getKeys() internal-field strip), `lookupKeyindex`, `getRevealedKeyValue`, `appendAudit`, `getClaimAnnotations`, `revealKey`, `markRedeemed`, `undoRedeemed`; classifyOrder call site now passes `isLocallyRedeemed` and merges `keyIndexByComposite` + carries forward `revealedKeyValue`
- `src/backend/humble/__tests__/library.test.ts` — new `humbleLocalRedeemedStore`/`humbleAuditStore` test doubles; `humbleRevealedStore` double gained `get`/`delete` (was `has`/`set` only) and switched from a `Set` to a `Map<string, {revealedAt}>` backing; `HumbleUser.getCsrfToken()` and adapter `revealKey` mocks; a `makeRevealableEntry` fixture helper; full `revealKey()`/`markRedeemed()`/`undoRedeemed()` describe blocks (17 new tests)
- `src/backend/humble/ipc_handler.ts` — 5 new handlers (`humbleRevealKey`, `humbleMarkRedeemed`, `humbleUndoRedeemed`, `humbleGetRevealedKeyValue`, `humbleGetClaimAnnotations`), each a thin delegate to `HumbleLibrary`
- `src/preload/api/humble.ts` — 5 new `makeHandlerInvoker` exports matching the handlers above

## Decisions Made
- `patchCachedState` stayed unexported on the `HumbleLibrary` object (only `revealKey`/`markRedeemed`/`undoRedeemed`/`getRevealedKeyValue`/`getClaimAnnotations` are exported) — it is purely an internal helper used by the three orchestration functions, per the plan's own allowance ("patchCachedState may stay unexported if only used internally").
- `undoRedeemed`'s D-77 no-op guard was tightened beyond the plan's literal phrasing ("no-op if a server redeemed value now exists") to `target.state !== 'REDEEMED' || !target.locallyRedeemedPending` — this correctly no-ops both for the server-truth case AND for any other non-locally-pending state, rather than only checking the single server-truth condition and risking an incorrect patch-to-REVEALED on an unrelated state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `mockRevealedStore` test double was missing `get()`/`delete()`, silently misclassifying every definitive reveal failure as `ambiguous`**
- **Found during:** Task 2 GREEN run (2 test failures: schema_error and access_denied both returned `{status: 'ambiguous'}` instead of `{status: 'failed'}`)
- **Issue:** `library.test.ts`'s `humbleRevealedStore` mock only implemented `has`/`set`/`clear` (sufficient for every pre-Phase-14 test, which only ever called `.has()`). `revealKey()`'s definitive-failure rollback branch calls `humbleRevealedStore.delete(machineName)`, which threw `TypeError: ... .delete is not a function` inside the `try` block — caught by the same function's `catch`, which then (correctly, per its own contract) reported the outcome as `ambiguous`. The bug was in the test double, not the production code path being exercised.
- **Fix:** Added `get`/`delete` to the mock, switched the backing collection from `Set<string>` to `Map<string, {revealedAt: number}>` (needed for `get()` to return a value, matching the real `CacheStore` API), and wired `resetStoreMocks()` accordingly.
- **Files modified:** `src/backend/humble/__tests__/library.test.ts`
- **Verification:** `pnpm jest src/backend/humble/__tests__/library.test.ts` — 73/73 pass, including both previously-failing D-78 definitive-failure tests
- **Committed in:** `33df5ebf` (part of Task 2's GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, test-infrastructure bug surfaced by the TDD RED→GREEN cycle itself)
**Impact on plan:** Necessary correctness fix to the test harness — no production-code scope creep. The D-78 rollback logic in `library.ts` was correct on first write; only the test double needed the fix.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None — no external service configuration required. The reveal endpoint's live CSRF requirement remains unconfirmed until the Plan 06 live-validation checkpoint (T-14-07, per 14-02's SUMMARY), unaffected by this plan.

## Next Phase Readiness
- Downstream wizard-UI plans (14-04/05/06) can now call `humbleRevealKey`/`humbleMarkRedeemed`/`humbleUndoRedeemed`/`humbleGetRevealedKeyValue`/`humbleGetClaimAnnotations` via the preload invokers in `src/preload/api/humble.ts` without further backend exploration.
- `HumbleLibrary.getClaimAnnotations()` exposes `keyindexResolved` per key so the wizard can proactively disable claiming on any pre-Phase-14 cached row not yet backfilled by a version-4 sync.
- No blockers. `pnpm codecheck` exits 0; `pnpm jest src/backend/humble` — 363/363 tests pass (11 suites).

---
*Phase: 14-guided-claim-flow*
*Completed: 2026-07-08*
