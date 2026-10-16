---
phase: 14-guided-claim-flow
plan: 08
subsystem: humble-sync
tags: [electron-store, jest-tdd, ownership-dedup, freeze-predicate, security-mitigation]

# Dependency graph
requires:
  - phase: 14 (plans 01-07)
    provides: Humble guided claim flow, D-26 progressive sync fill, D-24 freeze partitioning, D-48 Steam-dedup double-gate, the classify.ts 5-state model realigned by 14-07
provides:
  - Ownership-overlay integrity at per-order commit time (fetchAndCommitOrder no longer hard-resets ownedElsewhere/matchConfidence mid-sync)
  - A single-sourced server-terminality freeze predicate (isServerTerminal / isFreezeEligible) shared by classifyOrder and patchCachedState
  - HumbleOrderCacheEntry.freezeEligible (optional, backfilled via classifier version bump 5->6)
affects: [phase-15-store-overlay, any future humble sync/dedup work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-branch commit-time overlay: Steam double-gate PASS -> pure dedup recompute at commit; gate FAIL -> per-key carry-forward from prior cache entry (mirrors the existing revealedKeyValue carry-forward pattern)"
    - "Single-sourced predicate discipline: isFreezeEligible exported from classify.ts and called identically by classifyOrder (fresh sync) and library.ts patchCachedState (undo/mark) so the two can never drift from partitionGamekeys' frozen/skip decision"
    - "Optional cache-shape field with safe fallback (freezeEligible ?? allTerminal) for backward-compatible reads of pre-version-bump persisted entries"

key-files:
  created: []
  modified:
    - src/backend/humble/library.ts
    - src/backend/humble/classify.ts
    - src/common/types/humble.ts
    - src/backend/humble/constants.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/backend/humble/__tests__/classify.test.ts

key-decisions:
  - "Branch A/B ownership overlay strategy is a MERGED, not alternative, fix — both branches run inside the same commit path, gated on the identical Steam double-gate recomputeOwnership() already uses, so the two paths can never diverge on connectivity semantics."
  - "freezeEligible is optional (never required) specifically so a pre-v6 cache entry lacking the field is not a type error and the allTerminal fallback cannot be lint-flagged as dead code."
  - "REDEEMED/UNREDEEMABLE deliberately get NO expiry guard in isFreezeEligible — only REVEALED does — preserving their pre-existing always-eligible freeze behavior exactly."
  - "HUMBLE_CLASSIFIER_VERSION bumped 5->6 to force a one-time backfill of freezeEligible across every cached order, which also immediately freezes the currently-thrashing REVEALED(null-exp) orders."

patterns-established:
  - "When a fix requires re-deriving state that a downstream broadcast/consumer reads eagerly (D-26 progressive push before the authoritative end-of-sync pass), make the eager path correct at its own commit point rather than deferring/batching the broadcast."

requirements-completed: [HCLAIM-02, HCLAIM-03]

# Metrics
duration: ~30min
completed: 2026-07-09
---

# Phase 14 Plan 08: Guided Claim Flow — Gap Closure (UAT test 8) Summary

**Fixed the UAT-8 Keys-waiting fill-then-empty churn at its confirmed root cause (per-order commits hard-resetting the ownership overlay before end-of-sync recompute), which also closed a T-14-03 mid-sync C2 reveal-bypass window and restored the D-24 freeze benefit for REVEALED keys with no pending expiration.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-09
- **Tasks:** 2/2 completed
- **Files modified:** 6

## Accomplishments

- `fetchAndCommitOrder` now computes CORRECT `ownedElsewhere`/`matchConfidence` at every per-order commit — via a merged two-branch strategy (pure dedup recompute when Steam is connected with a non-empty library; per-key carry-forward of the prior cached value otherwise) — so the D-26 progressive `humbleKeysUpdated` broadcasts never show a transiently-unowned key mid-sync, and a `revealKey()` call mid-sync can never read a transiently-false `ownedElsewhere` (T-14-03 window closed).
- Added `isServerTerminal` + the single-sourced `isFreezeEligible` predicate in `classify.ts`, and a new optional `HumbleOrderCacheEntry.freezeEligible` field, so orders whose only key is REVEALED with no pending expiration now freeze under D-24 (previously re-fetched forever, a standing Cloudflare/WAF exposure — 19/26 orders in the live account). REVEALED keys with a live future expiration deliberately stay non-frozen so retroactive expiry (re-fetch-driven only) can still reach them.
- `partitionGamekeys` and `patchCachedState` both route the frozen/skip decision through the same `isFreezeEligible` helper, with a safe `?? allTerminal` fallback for pre-v6 cached entries — undo/mark can never leave the two sites disagreeing about the same key set.
- `HUMBLE_CLASSIFIER_VERSION` bumped 5→6 to force a one-time backfill of `freezeEligible` on every cached order.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ownership-overlay integrity at commit time (Fix 1 — churn + C2 window)** - `3e3a4606` (fix)
2. **Task 2: Server-terminality freeze predicate (Fix 2 — restore D-24 freeze, cut WAF exposure)** - `01e9260d` (feat)

_Both tasks were `tdd="true"`: tests were written/updated in the same commit as the corresponding implementation (test file changes and behavior changes are logically RED→GREEN within each commit — see "TDD Gate Compliance" below for the gate-sequence caveat)._

## Files Created/Modified

- `src/backend/humble/library.ts` — `fetchAndCommitOrder` two-branch ownership overlay (Branch A: `dedupRecomputeOwnership` at commit when the Steam double-gate passes; Branch B: per-key carry-forward when it fails); `partitionGamekeys` reads `entry.freezeEligible ?? entry.allTerminal`; `patchCachedState` recomputes `freezeEligible` via the same `isFreezeEligible` helper.
- `src/backend/humble/classify.ts` — exports `isServerTerminal` and `isFreezeEligible`; `classifyOrder` computes `freezeEligible` alongside `allTerminal`.
- `src/common/types/humble.ts` — `HumbleOrderCacheEntry.freezeEligible?: boolean` with a doc comment covering the pre-v6 absence, the three write sites, and the distinction from `allTerminal`.
- `src/backend/humble/constants.ts` — `HUMBLE_CLASSIFIER_VERSION` 5→6, with an appended version-log comment line.
- `src/backend/humble/__tests__/library.test.ts` — new `sync() — 14-08 gap closure: ownership-overlay integrity at commit time (Fix 1)` describe block (churn regression, C2 mid-sync security, gated-off carry-forward ×2, new-owned-order first-commit, Steam-reconnect regression guard); updated/added freeze-predicate coverage (two `14-08:` tests replacing/superseding the old 14-07 "never frozen" test; two WR-01 tests — one updated to the new frozen-on-undo expectation, one new future-exp thaw/refreeze cycle).
- `src/backend/humble/__tests__/classify.test.ts` — `isServerTerminal`/`isFreezeEligible` unit tests; `classifyOrder — freezeEligible` coverage (REVEALED null-exp, REVEALED future-exp, REDEEMED/UNREDEEMABLE unchanged, non-terminal, UNPICKED).

## Decisions Made

- The Steam double-gate check in `fetchAndCommitOrder` reuses the exact same predicate (`SteamUser.isLoggedIn() && steamLibraryStore.get('games', []).length > 0`) as `recomputeOwnership()`, computed once per commit (`steamGames`/`steamGateOpen` locals) rather than re-derived per key, so the two functions can never disagree about connectivity.
- `isFreezeEligible` deliberately takes a minimal `{ state, expiration }` shape (not the full `HumbleKey`) so both `classifyOrder` (operating on freshly-classified keys) and `patchCachedState` (operating on `HumbleKeyInternal` cache rows) can call it without type friction.
- Two pre-existing tests that encoded the OLD (14-07) freeze semantics — where a REVEALED-only key was "never frozen" — were updated rather than left failing, since this gap-closure plan's own root-cause diagnosis is what makes that old behavior a known regression (the standing 19-orders-per-sync re-fetch / Cloudflare exposure). Both updates are documented in the "Deviations" section below for traceability.

## Deviations from Plan

### Auto-fixed Issues (Rule 1 — pre-existing test assertions encoding superseded behavior)

**1. [Rule 1 - Bug] Updated `14-07: a server-revealed key is never frozen` test to reflect the intentional 14-08 semantic change**
- **Found during:** Task 2 (running the full suite after implementing the freeze predicate)
- **Issue:** The existing test asserted a REVEALED-only key (no pending expiration) is re-fetched on every subsequent sync — this was the exact 14-07 regression this plan's `<action>` explicitly targets ("if any existing test encoded the old freeze semantics, update only the assertions that legitimately changed").
- **Fix:** Renamed to `14-08: a server-revealed (not locally-redeemed) key with no pending expiration now freezes — skipped on the next sync`; added a `freezeEligible: true` assertion and changed the final expectation from `toHaveBeenCalledTimes(1)` to `not.toHaveBeenCalled()`. Added a sibling test proving the future-expiration case still re-fetches.
- **Files modified:** `src/backend/humble/__tests__/library.test.ts`
- **Committed in:** `01e9260d` (part of Task 2 commit)

**2. [Rule 1 - Bug] Updated the WR-01 "mark → sync → undo → second sync re-fetches" test**
- **Found during:** Task 2 (same full-suite run)
- **Issue:** The test used a REVEALED key with `expiration: null` and asserted the second sync re-fetches it after undo — under 14-08's freeze predicate, a REVEALED key with no pending expiration is now `freezeEligible: true`, so it legitimately stays frozen instead.
- **Fix:** Updated the test's title/body/assertions to expect the order stays frozen (`freezeEligible: true`, `getOrderDetail` NOT called on the second sync). Added a new sibling test (`WR-01 (14-08): mark → sync (freezes) → undo(future-exp REVEALED, thaws) → sync (re-fetches) → mark (refreezes)`) using a future-expiring REVEALED key to preserve exact coverage of the plan's original thaw/refreeze consistency requirement.
- **Files modified:** `src/backend/humble/__tests__/library.test.ts`
- **Committed in:** `01e9260d` (part of Task 2 commit)

No architectural changes (Rule 4) were needed — both fixes were scoped exactly as the plan specified (a two-branch commit-time overlay strategy for Task 1, a single-sourced freeze predicate for Task 2).

## TDD Gate Compliance

Both tasks are `tdd="true"` and were executed with tests and implementation landing in the SAME commit per task (test additions for Task 1 in `3e3a4606`; test additions/updates for Task 2 in `01e9260d`), rather than as separate `test(...)` (RED) → `feat(...)` (GREEN) commits. This reflects that the fixes for both tasks were implemented together in the same editing pass (the root-cause diagnosis in `14-UAT.md` had already fully specified both fixes' mechanics before implementation began), and the split into two commits was performed via `git add -p` hunk selection along the Task 1 / Task 2 boundary after both fixes were verified green together. Every new/updated test was confirmed to fail against the pre-fix code path during design (the ownership-overlay churn, C2 mid-sync bypass, and pre-14-08 freeze-never-happens behaviors are exactly what the old code produced) and to pass against the post-fix code — but the RED state was not captured as a separate git commit for either task.

## Verification

- `pnpm test` — 766/766 passed (baseline 745 + 21 new/net tests from this plan).
- `pnpm codecheck` (`tsc --noEmit`) — clean.
- Manual reasoning check: `partitionGamekeys` and `patchCachedState` both route the frozen/skip decision through the single `isFreezeEligible` helper exported from `classify.ts` — no second predicate exists anywhere in `library.ts`.

## Success Criteria Status

- [x] UAT test 8 churn eliminated: owned keys keep `ownedElsewhere:true` across all intermediate mid-sync broadcasts — including when Steam is gated off mid-sync (D-48 carry-forward).
- [x] C2 owned-key block fires against a key whose order was just re-committed mid-sync (T-14-03 window closed).
- [x] REVEALED(null-exp)-bearing orders freeze and are skipped next sync; REVEALED(future-exp) orders keep re-fetching (retroactive expiry preserved); pre-v6 entries partition via the `allTerminal` fallback.
- [x] Undo on a frozen order re-evaluates freeze eligibility via the same single-sourced predicate; no permanent freeze/thaw inconsistency (proven both for the null-exp "stays frozen" case and the future-exp "thaws then refreezes" case).
- [x] D-26 progressive fill intact (no batching/deferring/debouncing of broadcasts); reveal transport, D-66, and audit/logging invariants untouched.
- [x] `pnpm test` and `pnpm codecheck` green.

## Known Stubs

None — no stub patterns introduced.

## Threat Flags

None beyond what the plan's own `<threat_model>` already registered (T-14-03 mitigated as designed; T-14-08-01 accepted as designed; T-14-08-02 mitigated as designed). No new network endpoints, auth paths, or schema changes at trust boundaries were introduced beyond the `freezeEligible` cache field, which carries only a boolean derived from already-present key state/expiration data.

## Self-Check: PASSED

- FOUND: src/backend/humble/library.ts
- FOUND: src/backend/humble/classify.ts
- FOUND: src/common/types/humble.ts
- FOUND: src/backend/humble/constants.ts
- FOUND: src/backend/humble/__tests__/library.test.ts
- FOUND: src/backend/humble/__tests__/classify.test.ts
- FOUND commit 3e3a4606
- FOUND commit 01e9260d
