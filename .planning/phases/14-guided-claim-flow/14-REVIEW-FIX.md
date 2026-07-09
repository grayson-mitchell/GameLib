---
phase: 14-guided-claim-flow
fixed_at: 2026-07-09T01:17:48Z
review_path: .planning/phases/14-guided-claim-flow/14-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-07-09T01:17:48Z
**Source review:** .planning/phases/14-guided-claim-flow/14-REVIEW.md
**Iteration:** 2 — covers the **14-07 gap-closure re-review** (REVIEW.md reviewed 2026-07-09T00:46:48Z, which supersedes the iteration-1 review state). Iteration 1's report (7 findings from the original full-phase review) is superseded by this document.

**Summary:**
- Findings in scope: 3 (1 Critical, 2 Warning; fix_scope: critical_warning — IN-01..IN-04 not in scope)
- Fixed: 3
- Skipped: 0

**Gates:** full suite 745/745 passing (baseline 732 + 13 new tests added with these fixes); `pnpm codecheck` (tsc --noEmit) clean.

**Security invariants re-verified after fixes:** the server-provided key value captured by the new CR-01 side-channel is never logged and never broadcast (`toDisplayKey` strips `revealedKeyValue` before every `humbleKeysUpdated` push; new tests assert `REDEEMED-VALUE` appears in no log call and no broadcast); no reveal POST is fired anywhere in the new finish-mode path (test asserts the reveal adapter is never touched — D-66 never-re-reveal intact, and the backend's non-UNREVEALED guard is unchanged); skipped direct-redeem entitlements never contribute to the side-channel (test locks `ENTITLEMENT-VALUE-MUST-NOT-LEAK` out of the map); reveal transport untouched (still Electron net.request on `persist:humble`).

## Fixed Issues

### CR-01: Server-revealed keys (no local reveal record) rendered a dead-end "Claim" button instead of "Finish activation"

**Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`, `src/backend/humble/classify.ts`, `src/backend/humble/library.ts`, `src/backend/humble/__tests__/classify.test.ts`, `src/backend/humble/__tests__/library.test.ts`, `src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx`
**Commit:** 5d111070
**Applied fix:** Two coordinated changes, per the reviewer's suggested UI gate plus the verified-necessary backend value path:

1. **UI affordance (reviewer's fix):** `HumbleKeyRow` now gates the Finish/Claim decision on server truth — `claimAction.revealedAt !== null || humbleKey.state === 'REVEALED'` renders **Finish activation** wired to `onFinish`; the "Revealed {date}" annotation renders only when the local timestamp actually exists. A website-revealed key can no longer reach the dead-end Claim branch (the backend's non-UNREVEALED reveal guard was NOT weakened — it is correct and unchanged).
2. **Finish-mode key value (verified gap):** I verified the sync pipeline did **not** carry `redeemed_key_val` into the internal store — `revealedKeyValue` was populated only by GameLib's own reveal write and carried forward, so `humbleGetRevealedKeyValue` returned null for every website-revealed key and finish mode would always land on the `ambiguous` step. Fixed by adding a `revealedKeyValueByComposite` side-channel to `classifyOrder` (string values only; object-shaped values for some non-Steam key types are deliberately omitted and keep the honest Pitfall-B "unconfirmed" path) with the same discipline as `keyIndexByComposite` — never on the broadcast `HumbleKey`, never logged. `fetchAndCommitOrder` merges it onto the internal `revealedKeyValue` field, with a prior GameLib-revealed value still winning (never-regress guarantee preserved). This also matches electronStores.ts's pre-existing D-74 rationale ("a wiped revealedKeyValue is reconstructible from the next sync"), which the code had never actually implemented. No fallback re-fires the reveal POST.

**Tests added (13 total across the three findings; 10 here):** classify side-channel suite (string `redeemed_key_val` captured composite-keyed, spec-fallback `redeemed_key_value` captured, object value omitted while still classifying REVEALED, absent value absent from map, value never on any returned `HumbleKey`, skipped direct-redeem entitlement never contributes); library website-revealed-key path (sync → state REVEALED → `getRevealedKeyValue` returns the server value → reveal adapter never called → value in no log line and no broadcast) plus prior-value-wins carry-forward; Waiting-tab test with `state: 'REVEALED'` and an empty annotations map asserting the rendered button is `onFinish` (not `onClaim`), no fabricated "Revealed {date}" annotation, and `onFinish` opens the wizard with `entryMode: 'finish'`.

### WR-01: `patchCachedState` never recomputed `allTerminal` — undo left a non-terminal key frozen under D-24

**Files modified:** `src/backend/humble/classify.ts`, `src/backend/humble/library.ts`, `src/backend/humble/__tests__/library.test.ts`
**Commit:** e4fc3b3a
**Applied fix:** Exported `isTerminal` from `classify.ts` (reviewer's suggestion, so the predicate cannot drift from what `classifyOrder` computes) and `patchCachedState` now recomputes `allTerminal` from the patched key set instead of spreading the stale value forward. After `undoRedeemed` flips the only key back to REVEALED, the entry unfreezes and later syncs (including HSYNC-03 retroactive-expiry recompute) reach it again. Side effect (consistent by design): `markRedeemed` on an order's last non-terminal key now sets `allTerminal: true` immediately rather than on the next sync — same D-24 freeze a sync would have committed.

**Test added:** the mark → sync → undo → **second sync** sequence the reviewer noted was missing — asserts the first sync freezes (`allTerminal: true`), undo recomputes to `false`, and the second sync (with the classifier version already stamped, so nothing else bypasses the freeze) calls `getOrderDetail` for that gamekey again.

### WR-02: `refreshAnnotations` and `onUndoRedeem` had no rejection handling and no unmount guard

**Files modified:** `src/frontend/screens/Humble/Keys/Waiting/index.tsx`, `src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx`
**Commit:** 88f53fd5
**Applied fix:** Both IPC fetches in `refreshAnnotations` now carry `.catch` handlers (keep last-known map — annotations are advisory; `humble.keys` remains the authoritative state via the `humbleKeysUpdated` push), and a component-lifetime `mountedRef` (a stable mutable box via `useState`, flipped by the mount effect's cleanup) guards every `setAnnotations`/`setOverrides` so a late resolution after navigation never sets state on an unmounted component — the reviewer's optional hoisted-ref hardening included. The mount effect now delegates to `refreshAnnotations()` (deduplicating the previously-duplicated fetch logic; its old per-effect `cancelled` local is subsumed by the mounted flag). `onUndoRedeem` gained `.catch(() => refreshAnnotations())` per the reviewer's fix, so a rejected undo neither escapes as an unhandled rejection nor leaves the row silently showing "Redeemed + Undo". `useState` was chosen over `useRef` deliberately: the colocated test harness's module-level react mock stubs only `useState`/`useEffect`/`useContext`.

**Tests added:** rejected mount-time annotation fetches settle without escaping and the tab still renders with the Pitfall-C defaults; a rejected `humbleUndoRedeemed` still triggers a second annotations fetch (row re-reads backend truth).

## Skipped Issues

None — all 3 in-scope findings fixed. (IN-01..IN-04 are Info-tier and outside `fix_scope: critical_warning`.)

---

_Fixed: 2026-07-09T01:17:48Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
