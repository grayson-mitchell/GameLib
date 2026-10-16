---
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
plan: 03
subsystem: backend/humble
tags: [electron-store, jest-tdd, ownership-dedup, state-machine]

# Dependency graph
requires:
  - phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin (plan 02)
    provides: 'HumbleLocalRedeemedRecord.source (optional, ''user'' | ''ownership-exact''), exported from electronStores.ts; markRedeemed stamps ''user''; getClaimAnnotations derives redeemedSource with a missing-source-defaults-to-''user'' rule.'
provides:
  - "recomputeOwnership auto-settles exact-match owned+REVEALED Humble keys to REDEEMED (D-42-01/D-42-02)"
  - "Auto-settle is guarded by 5 named conditions; fuzzy matches NEVER auto-settle (REQ-42-05)"
  - "humbleSettleDeclinedStore: new D-04 disconnect-exempt CacheStore making an Undo of an auto-settle durable across later recomputes"
  - "undoRedeemed writes a decline record only when reversing a source: 'ownership-exact' record"
affects: [humble-ownership-recompute, humble-guided-claim-flow, humble-store-indicator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "5 independently-commented settle guards (never one compound boolean) inside recomputeOwnership's per-key map, mirroring the existing per-guard commenting style in setOwnershipOverride/patchCachedState"
    - "WR-01 flag recompute: allTerminal/freezeEligible recomputed from the settled key set only when at least one key actually settled, never spread forward"

key-files:
  created: []
  modified:
    - src/backend/humble/library.ts (recomputeOwnership settle logic, undoRedeemed decline-write, new import)
    - src/backend/humble/electronStores.ts (new humbleSettleDeclinedStore + export)
    - src/backend/sidecar/storeRegistration.ts (import + touched-array registration)
    - src/backend/humble/__tests__/library.test.ts (RED coverage, Task 1)

key-decisions:
  - "Implemented Task 2's settle behind guards 1-4 only (ownedElsewhere, matchConfidence==='exact', state==='REVEALED', !humbleLocalRedeemedStore.has), deferring guard 5 (!humbleSettleDeclinedStore.has) to Task 3 per the plan's own sequencing note, since the store does not exist until Task 3."
  - "Cast dedupRecomputeOwnership's return value to HumbleKeyInternal[] in recomputeOwnership: the function's declared return type is the display-safe HumbleKey[], but at runtime every element is spread from an entry.keys HumbleKeyInternal, so the internal-only revealedKeyValue field survives — needed to call isFreezeEligible with the same revealedKeyValuePresent signal patchCachedState uses."
  - "Reworded a Task 3 docstring in undoRedeemed to avoid literally quoting the string \"source: 'ownership-exact'\" a second time, preserving the plan's exactly-one-write-site grep invariant (grep -c \"source: 'ownership-exact'\" library.ts == 1)."

requirements-completed: [REQ-42-04, REQ-42-05]

# Metrics
duration: 12min
completed: 2026-09-08
---

# Phase 42 Plan 03: Ownership Auto-Settle (D-42-01/D-42-02) Summary

**Exact-match owned+REVEALED Humble keys now auto-settle to REDEEMED during `recomputeOwnership` with provenance `source: 'ownership-exact'`, guarded by 5 named conditions so fuzzy matches never auto-settle (REQ-42-05), and the settle is durably undoable via a new `humbleSettleDeclinedStore`.**

## Performance

- **Duration:** 12 min (18:49:56 → 19:01:24, local time, spanning the RED commit through the final wording-fix commit)
- **Tasks:** 3 completed (Task 1 RED, Task 2 settle, Task 3 durable undo) + 1 post-task wording fix commit
- **Files modified:** 4 (library.ts, electronStores.ts, storeRegistration.ts, library.test.ts)

## Accomplishments

- `recomputeOwnership` in `library.ts` now settles an exact-match owned REVEALED key to REDEEMED, stamping `humbleLocalRedeemedStore` with `source: 'ownership-exact'`, appending a redaction-safe `ownership_settled` audit record (D-76, no key value), and recomputing `allTerminal`/`freezeEligible` from the settled key set (WR-01) only when a settle actually fired.
- Fuzzy matches, unmatched keys, non-REVEALED states, and already-locally-redeemed keys are all excluded by name-commented guards — verified by a table-driven negative test covering 6 distinct non-settling cases.
- A new `humbleSettleDeclinedStore` (`humble_settle_declined`, `CacheStore<{ declinedAt: number }, string>`) makes an Undo of an auto-settled key durable: `undoRedeemed` now writes a decline record when the record it reverses has `source: 'ownership-exact'`, and `recomputeOwnership`'s new guard 5 refuses to re-settle a declined key on a later recompute against the same unchanged exact-ownership signal.
- Undoing an explicit "Mark as redeemed" (`source: 'user'` or a legacy source-less record) never writes a decline record — it keeps its pre-Phase-42 semantics exactly, verified by a dedicated test.

## RED Output Captured (Task 1)

Full output saved to `/tmp/gsd-42-03-red.txt` during Task 1. Summary line from that run:

```
Test Suites: 2 failed, 208 passed, 210 total
Tests:       5 failed, 2 skipped, 4730 passed, 4737 total
```

The 5 RED failures were:
1. `electronUntouched.test.ts:306` — pre-existing baseline failure (`src/backend/sidecar/`, untouched by this plan; confirmed against the documented baseline sha before starting).
2. `D-42-01/D-42-02 ownership auto-settle › exact-match owned+REVEALED key settles to REDEEMED with source: ownership-exact, audits ownership_settled (no key value), and getClaimAnnotations reports it` — the positive settle test.
3. `D-42-01/D-42-02 ownership auto-settle › undo of an auto-settled key is durable: a subsequent recompute with the SAME exact-ownership inputs leaves the key REVEALED and writes no new record` — the undo-durability test (expected to stay red until Task 3 landed).
4. `D-42-01/D-42-02 ownership auto-settle › flag recompute (WR-01 trap): an order whose only non-terminal key is an exact-match owned REVEALED key gets allTerminal:true after settle, and allTerminal:false again after undo` — the flag-recompute test.
5. `D-42-01/D-42-02 ownership auto-settle › churn: two consecutive recomputeOwnership() calls settle exactly once — unchanged redeemedAt, exactly one ownership_settled audit record` — the churn/idempotency test.

After Task 2, only failures 1 (pre-existing baseline) and 3 (undo-durability, awaiting Task 3) remained. After Task 3, only failure 1 (pre-existing baseline, unrelated to this plan's diff) remains.

## CacheStore Registration Lists

Per the project memory that CacheStore registration is mirrored across multiple lists, I grepped for every place `humbleLocalRedeemedStore` (the closest sibling disconnect-exempt store) is named and cross-checked against `humbleAuditStore`/`humbleGiftedAtStore`/`humbleOwnershipOverrideStore` to confirm the pattern was consistent. Found and updated **3 list-entries across 2 files**:

1. `src/backend/humble/electronStores.ts` — the module's own `export { ... }` block.
2. `src/backend/sidecar/storeRegistration.ts` — the `import { ... as _humbleSettleDeclinedStore } from '../humble/electronStores'` block.
3. `src/backend/sidecar/storeRegistration.ts` — the `touched: unknown[]` array inside `ensureStoresRegistered()`.

## Task 3 Planner Note (carried verbatim from the plan)

> PLANNER NOTE — carry this verbatim into the summary. This is not new scope.
> D-42-01 requires the auto-settle be undoable. Without a decline record,
> `undoRedeemed` deletes the local-redeemed entry and reverts the key, and the
> very next `recomputeOwnership()` — which runs at the end of every sync AND
> standalone on every Steam-library refresh — re-settles it from the unchanged
> exact-ownership signal. The Undo would be cosmetic and the user could never
> keep a wrongly-settled key in REVEALED. The existing
> `humbleOwnershipOverrideStore` cannot be reused: exact matches are
> deliberately not overridable (enforced in `dedup.ts`; see
> `setOwnershipOverride`'s docblock in `library.ts`).

## Clearing a Decline Is Out of Scope

`humbleSettleDeclinedStore` has no delete path anywhere in this plan's code. Once a user Undoes an auto-settle, the decline record persists indefinitely (D-04 disconnect-exempt, same as its siblings) and there is no mechanism in this plan to clear it and allow the key to re-settle. This is intentional and matches the plan's explicit scope boundary — a future plan would need to add a "re-enable auto-settle for this key" action if that behavior is ever wanted.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — pin D-42-01/D-42-02 ownership auto-settle behaviour** - `a7c0a6f45` (test)
2. **Task 2: Auto-settle exact-match owned+REVEALED Humble keys** - `9ed3db490` (feat)
3. **Task 3: Make the undo durable with a settle-declined store** - `a36a34780` (feat)
4. **Post-task fix: preserve the single ownership-exact write-site invariant** - `87b4b6b40` (docs)

_No plan-metadata commit — this executor is explicitly forbidden from writing STATE.md/ROADMAP.md or invoking gsd-sdk write verbs (see below)._

## Files Created/Modified

- `src/backend/humble/library.ts` - `recomputeOwnership` settle logic (5 named guards, `ownership_settled` audit, WR-01 flag recompute); `undoRedeemed` decline-record write; new `humbleSettleDeclinedStore` import.
- `src/backend/humble/electronStores.ts` - new `humbleSettleDeclinedStore` (`humble_settle_declined`, D-04 disconnect-exempt) and its export.
- `src/backend/sidecar/storeRegistration.ts` - import and `touched`-array registration of `_humbleSettleDeclinedStore`.
- `src/backend/humble/__tests__/library.test.ts` - Task 1 RED coverage: mock store wiring for `humbleSettleDeclinedStore`, `makeSettleCandidateKey`/`seedSteamOwning440` test helpers, and a full `describe('D-42-01/D-42-02 ownership auto-settle', ...)` block (positive settle, 6-case negative table, gate-closed no-op, no-overwrite, undo-durability, non-settle-undo, flag-recompute, churn).

## Decisions Made

- Split the settle guard across Task 2 (guards 1-4) and Task 3 (guard 5), per the plan's own sequencing note, since `humbleSettleDeclinedStore` does not exist until Task 3.
- Cast `dedupRecomputeOwnership`'s return value to `HumbleKeyInternal[]` in `recomputeOwnership` — its declared signature returns the display-safe `HumbleKey[]`, but the runtime objects are spread-through `HumbleKeyInternal`s from `entry.keys`, and the freeze-eligibility recompute needs the internal `revealedKeyValue` field, exactly as `patchCachedState` already relies on.
- Reworded a Task 3 docstring line in `undoRedeemed` to avoid a second literal occurrence of `source: 'ownership-exact'`, keeping the plan's exactly-one-write-site grep invariant intact.

## Deviations from Plan

None beyond the wording fix above (which is a comment-only correction to preserve a plan-mandated grep invariant, not a behavior change) — plan executed as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Threat Model Coverage

- **T-42-08/T-42-09/T-42-10** (settle correctness, fuzzy exclusion, no-overwrite): covered by guards 1-4 and the corresponding Task 1 positive/negative test coverage.
- **T-42-11/T-42-12** (Steam-gate no-op, WR-01 flag drift): covered by `getSteamGate()`'s existing early-return and the settled-only conditional flag recompute.
- **T-42-SC** (undo durability / re-settle race): covered by guard 5 and `humbleSettleDeclinedStore`, verified by the durability and non-settle-undo tests.

## Next Phase Readiness

D-42-01/D-42-02 auto-settle is fully implemented and undoable-durable. The store-indicator work referenced in `42-CONTEXT.md`'s D-42-03 is explicitly out of scope for this plan and remains for a future plan. No blockers.

---
*Phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin*
*Completed: 2026-09-08*

## Self-Check: PASSED

All 4 modified/created source files found on disk; all 4 task commit hashes (`a7c0a6f45`, `9ed3db490`, `a36a34780`, `87b4b6b40`) found in `git log --oneline --all`.
