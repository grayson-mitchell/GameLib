---
phase: 14-guided-claim-flow
reviewed: 2026-07-09T00:46:48Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/backend/humble/classify.ts
  - src/backend/humble/constants.ts
  - src/common/humble/viewFilters.ts
  - src/backend/humble/library.ts
  - src/common/types/humble.ts
  - src/frontend/screens/Humble/Keys/Waiting/index.tsx
  - src/backend/humble/__tests__/classify.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/humble/__tests__/viewFilters.test.ts
  - src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
status: issues_found
---

# Phase 14: Code Review Report — 14-07 Gap-Closure Re-Review

**Reviewed:** 2026-07-09T00:46:48Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This report covers the **14-07 gap-closure re-review scope** (commits `c55db55a`, `7ee9a234`, `7b14d5c2`; diff base `ba42c500`) and supersedes the prior full-phase review state: the Humble key-state realignment where server `redeemed_key_val` now classifies REVEALED, REDEEMED is exclusively the local Mark-as-redeemed overlay, `locallyRedeemedPending` / the WR-02 keep-visible branch / the `server_confirmed_ack` tier were deleted, and `HUMBLE_CLASSIFIER_VERSION` was bumped 4→5.

**Invariant verification results:**

- **D-66 never-re-reveal: PASS.** `HumbleClaimWizard` finish mode starts at `keyShown`, its mount effect only reads `humbleGetRevealedKeyValue` and routes a null/rejected read to the `ambiguous` step; `handleReveal` is only reachable from the warning/failed steps. Backend `doRevealKey` rejects any non-UNREVEALED target as `ineligible` before the adapter (`library.ts:927`), and the composite-keyed `revealsInFlight` set blocks concurrent duplicates (`library.ts:894-918`).
- **Expiry precedence (UNREDEEMABLE beats all): PASS.** `classifyTpk` checks `isExpired`/past-`expiration` first (`classify.ts:40-45`), before both the local-redeemed and revealed tiers; locked-in by tests (`classify.test.ts:51,125,255`).
- **No key/cookie/csrf values in logs: PASS.** Every log line in the changed backend files carries gamekey/machineName/status/type-labels only; the csrf token is logged presence-only (`library.ts:1027`); test suites assert `REAL-KEY-VALUE`, `redeemed-value-string`, `ENTITLEMENT-VALUE-MUST-NOT-LEAK` and `cookie-value` never appear in log calls or broadcasts.
- **Undo survives arbitrarily many syncs: PASS at the state level** — `isLocallyRedeemed` wins over `redeemedKeyValuePresent` in `classifyTpk`, `undoRedeemed` deletes the store mark and re-patches REVEALED, and `library.test.ts:2561-2639` exercises mark→sync→undo including the server-value-present case. However, see WR-01 for a stale `allTerminal` freeze after the undo that degrades HSYNC-03 for that order.
- **No orphaned references to deleted mechanisms: PASS with doc residue.** Repo-wide grep finds no live code referencing `locallyRedeemedPending`, the WR-02 annotations parameter of `selectKeysWaiting` (all call sites are 1-arg: `Waiting/index.tsx:33`, `Keys/index.tsx:108`), or a server-confirmed ack path. Remaining mentions are historical "superseded" comments plus stale doc comments that now assert the wrong model (IN-01, IN-02, IN-03).

The realignment itself is implemented correctly and consistently across classify/viewFilters/library. The one serious defect is downstream of the reclassification: the renderer's claim affordance was not realigned for keys that are REVEALED by **server truth alone** (revealed on Humble's website, no local annotation) — exactly the population the v5 classifier bump will flood into Keys waiting (CR-01).

## Critical Issues

### CR-01: Server-revealed keys (no local reveal record) render a dead-end "Claim" button instead of "Finish activation"

**File:** `src/frontend/screens/Humble/Keys/Waiting/index.tsx:131-139` (claimAction wiring), interacting with `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:196-239` (affordance gating) and `src/backend/humble/library.ts:927` (eligibility check)

**Issue:** After the v5 reclassification, every key the user ever revealed on Humble's website carries `redeemed_key_val` and now classifies **REVEALED** — so it enters Keys waiting. But the row's affordance is chosen from `claimAction.revealedAt`, which is sourced from `humbleRevealedStore` (`getClaimAnnotations`, `library.ts:580`) — a store populated **only** by GameLib's own `revealKey` write-ahead. A website-revealed key has no record there, so `revealedAt` is `null`, `redeemedAt` is `null`, and `keyindexResolved` is `true` (keyindex was extracted during the same sync). HumbleKeyRow therefore falls through to the **"Claim"** branch.

Clicking Claim opens the wizard in `claim` mode → warning step ("there's no undo") → `humbleRevealKey` → backend `doRevealKey` rejects it: `target.state !== 'UNREVEALED'` → `ineligible` → the wizard maps `ineligible` to the `failed` step, whose copy ("nothing was used up… try again") invites a retry that fails identically, forever. The key's Mark-as-redeemed affordance is also unreachable (it only renders behind `revealedAt !== null`), so the row is permanently stuck in Keys waiting with a misleading, always-failing button.

This directly contradicts 14-07-SUMMARY's documented consequence #2, which states these keys "will (re)surface as REVEALED / **'Finish activation'**". They do not — they resurface as REVEALED / "Claim". The backend guard prevents any harmful reveal POST, but the primary flow this phase ships is functionally broken for what is likely the largest key class in a real veteran library.

**Fix:** Gate the Finish/Claim decision on server truth (`key.state`), not solely on the local annotation. Minimal change in `HumbleKeyRow` (or pass state-derived values from `Waiting/index.tsx`):

```tsx
// HumbleKeyRow claim-affordance selection: a key whose STATE is already
// REVEALED must never render "Claim" — the backend will reject the reveal.
) : claimAction.revealedAt !== null || humbleKey.state === 'REVEALED' ? (
  <span className="humbleKeyClaimGroup">
    {claimAction.revealedAt !== null && (
      <span className="humbleKeyClaimAnnotation">…Revealed {{date}}…</span>
    )}
    <button … onClick={claimAction.onFinish}>
      {t('humbleKeys.finishActivation', 'Finish activation')}
    </button>
  </span>
) : claimAction.keyindexResolved ? (
```

Finish mode then honors D-66 (never re-reveals): `humbleGetRevealedKeyValue` returns null for a website-revealed key and the wizard shows the honest `ambiguous` state with the D-72 owned-note path, matching the summary's documented expectation. Add a Waiting-tab test with a `state: 'REVEALED'` key and an empty annotations map asserting `onFinish` (not `onClaim`) is the rendered action.

## Warnings

### WR-01: `patchCachedState` never recomputes `allTerminal` — undo leaves a non-terminal key frozen under D-24

**File:** `src/backend/humble/library.ts:481-504` (patchCachedState), `src/backend/humble/library.ts:1169-1186` (undoRedeemed)

**Issue:** Sequence: user marks a key redeemed → next sync re-classifies the order REDEEMED via `isLocallyRedeemed` and commits `allTerminal: true` → the order is now frozen (D-24, `partitionGamekeys` skips it). User then clicks **Undo**: `undoRedeemed` deletes the mark and `patchCachedState` flips the key back to REVEALED — but spreads `{ ...entry, keys: newKeys }`, leaving `allTerminal: true` on an entry whose only key is now non-terminal. Every subsequent sync skips the order, so:

- HSYNC-03 retroactive-expiry recompute never runs for it (a key that has since expired keeps showing REVEALED instead of UNREDEEMABLE — violating the expiry-beats-all invariant at the sync layer, even though `classifyTpk` itself is correct);
- expiration refreshes and any server-side changes never reach it until the next `HUMBLE_CLASSIFIER_VERSION` bump.

The 14-07 realignment makes this path central: REDEEMED is now always-undoable by design, so mark→sync→undo is an expected flow, not an edge case. Existing tests (`library.test.ts:2561-2639`) cover mark→sync→undo but never run a **second** sync after the undo, which is where the stale freeze bites.

**Fix:** Recompute `allTerminal` from the patched key set:

```ts
const newKeys = [...entry.keys]
newKeys[index] = patchedKey
const allTerminal =
  newKeys.length > 0 &&
  newKeys.every((k) => k.state === 'REDEEMED' || k.state === 'UNREDEEMABLE')
humbleLibraryStore.set(gamekey, { ...entry, keys: newKeys, allTerminal })
```

(Consider exporting `isTerminal` from `classify.ts` so the predicate cannot drift.) Add a test: mark → sync → undo → sync again asserts `getOrderDetail` IS called for that gamekey.

### WR-02: `refreshAnnotations` and `onUndoRedeem` have no rejection handling and no unmount guard

**File:** `src/frontend/screens/Humble/Keys/Waiting/index.tsx:50-57,140-146`

**Issue:** The mount-time effect guards `cancelled`, but `refreshAnnotations()` (invoked from `closeWizard` and after undo) does not — `void promise.then(setState)` with no `.catch`. An IPC rejection (renderer channel torn down, backend error) becomes an unhandled promise rejection, and a late resolution after the user navigates away calls `setAnnotations`/`setOverrides` on an unmounted component. `onUndoRedeem`'s chain (`humbleUndoRedeemed(...).then(() => refreshAnnotations())`) has the same gap: a rejected undo IPC call surfaces as an unhandled rejection and the annotations silently stay stale (the row keeps showing "Redeemed + Undo" although nothing changed). This is exactly the failure class 14-REVIEW's earlier WR-05 fixed inside `HumbleClaimWizard`; the same discipline was not applied here.

**Fix:**

```ts
function refreshAnnotations() {
  window.api
    .humbleGetClaimAnnotations()
    .then((map) => setAnnotations(map))
    .catch(() => {/* keep last-known map; annotations are advisory */})
  window.api
    .humbleGetOwnershipOverrides()
    .then((map) => setOverrides(map))
    .catch(() => {})
}
// onUndoRedeem:
onUndoRedeem: () =>
  void window.api
    .humbleUndoRedeemed({ gamekey: key.gamekey, machineName: key.machineName })
    .then(() => refreshAnnotations())
    .catch(() => refreshAnnotations())
```

(If unmount-safety is wanted too, hoist a `mountedRef` and check it in the `.then`s.)

## Info

### IN-01: `WAITING_STATES` doc comment now contradicts the code it annotates

**File:** `src/common/humble/viewFilters.ts:12-15,64`
**Issue:** The comment above `WAITING_STATES` still reads "REDEEMED/UNREDEEMABLE are terminal and never appear here", but `selectKeysWaiting` deliberately includes every unowned REDEEMED key (`… || k.state === 'REDEEMED'`). Related UX consequence worth a deliberate UAT check: because REDEEMED rows now stay in the view permanently, the tab badge (`Keys/index.tsx:108`) counts already-redeemed keys, the blurb "Keys you don't own yet — claim them before they expire" describes rows that need no claiming, and the "You're all caught up" empty state becomes unreachable once any key is marked redeemed.
**Fix:** Update the comment ("UNREDEEMABLE is terminal and never appears here; REDEEMED is a local, undoable overlay and stays visible for its Undo affordance"), and confirm with the design owner that the badge/blurb/empty-state implications are intended.

### IN-02: Stale IPC doc comment references the deleted server-confirmed redeem tier

**File:** `src/common/types/ipc.ts:317-318`
**Issue:** `humbleUndoRedeemed`'s comment says "never applicable to a server-confirmed redeem" — that tier was deleted by 14-07; every REDEEMED mark is now undoable.
**Fix:** Reword to "reverses the local-only 'Mark as redeemed' overlay (every REDEEMED mark is local and undoable, 14-07)".

### IN-03: `ClaimAnnotation` doc cites classifier version 4 as the backfill trigger

**File:** `src/common/types/humble.ts:209-210`
**Issue:** "HUMBLE_CLASSIFIER_VERSION bump to 4 forces the one-time backfill" is stale — the constant is now 5, and 5 is what forces the re-classification pass that also backfills keyindex.
**Fix:** Drop the hardcoded number ("the HUMBLE_CLASSIFIER_VERSION bump forces the one-time backfill") so the comment cannot rot again.

### IN-04: `HumbleClaimWizard.handleMarkRedeemed` discards the `RedeemOutcome` — an `ineligible` result closes the wizard as if it succeeded

**File:** `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx:168-188` (cross-file consumer of the realigned `markRedeemed` contract)
**Issue:** `markRedeemed` now returns `{ status: 'ineligible' }` whenever the cached state is not currently REVEALED (e.g. the key expired to UNREDEEMABLE between reveal and mark, or an ambiguous reveal left the cached state UNREVEALED). The wizard `await`s the call and unconditionally invokes `onDone()`, so the user sees the wizard close normally while no mark was recorded; only the subsequent annotations refresh hints that nothing happened. Rare paths, but the outcome type exists precisely so the renderer can react.
**Fix:** `const outcome = await window.api.humbleMarkRedeemed(...); if (outcome.status === 'ineligible') { setStep('ambiguous'); return } onDone()` (or a dedicated notice), keeping the current catch/finally behavior.

---

_Reviewed: 2026-07-09T00:46:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
