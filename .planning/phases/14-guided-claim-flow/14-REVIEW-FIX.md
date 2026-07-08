---
phase: 14-guided-claim-flow
fixed_at: 2026-07-08T11:21:18Z
review_path: .planning/phases/14-guided-claim-flow/14-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-07-08T11:21:18Z
**Source review:** .planning/phases/14-guided-claim-flow/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 Critical, 6 Warning; fix_scope: critical_warning)
- Fixed: 7
- Skipped: 0

**Gates:** full suite 738/738 passing (baseline 706 + 32 new tests added with these fixes); `pnpm codecheck` (tsc --noEmit) clean. The pre-existing jest "worker process failed to exit gracefully" warning was verified present on the base commit and is not a regression.

**Security invariants re-verified after fixes:** key/cookie/CSRF values never logged (new log lines are presence/length/status-only, with tests asserting non-leakage); reveal POST still transits Electron net.request on `persist:humble` (adapter transport untouched); 'finish' mode still never re-fires the reveal POST (WR-05 recovery path lands on 'ambiguous', which offers sync only); CSRF header handling preserved and strengthened (WR-03 reads the live cookie, stored snapshot kept as fallback).

## Fixed Issues

### CR-01: Sync re-classification silently drops `locallyRedeemedPending`

**Files modified:** `src/backend/humble/classify.ts`, `src/backend/humble/__tests__/classify.test.ts`, `src/backend/humble/__tests__/library.test.ts`
**Commit:** e68ca336
**Applied fix:** Implemented the reviewer's "cleanest source" option: `classifyOrder` itself now emits `locallyRedeemedPending: true` on a key whenever the REDEEMED verdict came from the local-mark tier (`state === 'REDEEMED' && !redeemedKeyValuePresent && isLocallyRedeemed(...)`). The flag rides the classified `HumbleKey` through `fetchAndCommitOrder`'s spread and persists on the cache entry, so the Keys-waiting row and `undoRedeemed` both survive any number of syncs. A server-confirmed redeem (`redeemedKeyValuePresent`) never carries the flag. Added the previously-missing test class: a sync running while `humbleLocalRedeemedStore` holds a mark (asserts flag survives AND `undoRedeemed` still works afterward), plus the server-truth counter-case, plus classify-level unit tests.

### WR-01: No in-flight guard on `revealKey` — concurrent calls can double-fire the reveal POST

**Files modified:** `src/backend/humble/library.ts`, `src/backend/humble/__tests__/library.test.ts`
**Commit:** 34774a8c
**Applied fix:** Added a module-level composite-keyed `revealsInFlight` set as the reviewer suggested; `revealKey` is now a guard wrapper (duplicate returns `{status:'failed'}` with a redacted warning, guard released in `finally`) around the original body (`doRevealKey`). Tests: concurrent duplicate never reaches the adapter; guard is per-composite-key (different keys reveal concurrently); guard releases after both resolved failure and thrown/ambiguous outcomes.

### WR-02: Revealed key loses its "Finish activation" resume after the next sync

**Files modified:** `src/common/humble/viewFilters.ts`, `src/backend/humble/library.ts`, `src/frontend/screens/Humble/Keys/Waiting/index.tsx`, `src/backend/humble/__tests__/viewFilters.test.ts`, `src/backend/humble/__tests__/library.test.ts`
**Commit:** 5bfc2cb3
**Applied fix:** As the reviewer directed, the fix lives in the view layer (D-30 classifier precedence untouched). `selectKeysWaiting` accepts an optional annotations map (the `humbleGetClaimAnnotations` shape) and keeps a REDEEMED key visible while `revealedAt` is set and `redeemedAt` unset; the Waiting view passes its annotations in. **Necessary addition beyond the reviewer's sketch:** `markRedeemed` gained a second eligibility tier — acknowledging a server-confirmed REDEEMED key (no `locallyRedeemedPending`) records the `redeemedAt` mark WITHOUT the pending flag (audit outcome `server_confirmed_ack`). Without this, the kept "Finish activation" row could never be dropped, because the old `state !== 'REVEALED'` gate made "Mark as redeemed" a permanent no-op for exactly the rows this fix keeps visible.

### WR-03: Stored CSRF token can go stale and permanently mismatch the live cookie jar

**Files modified:** `src/backend/humble/user.ts`, `src/backend/humble/library.ts`, `src/backend/humble/__tests__/user.test.ts`, `src/backend/humble/__tests__/library.test.ts`
**Commit:** ff5de31e
**Applied fix:** Added `HumbleUser.getLiveCsrfToken()`: reads `csrf_cookie` from the `persist:humble` partition (the same `session.fromPartition(...).cookies.get(...)` call the login capture uses), falling back to the stored snapshot only when the partition read fails or finds nothing. `revealKey` now awaits this instead of `getCsrfToken()`, guaranteeing header/cookie agreement by construction. CSRF handling is preserved (required per live validation) — only its source of truth changed. Tests cover live-beats-stale, both fallback paths, undefined when neither exists, and never-logs-the-value.

### WR-04: Ownership-override Undo affordance unreachable when needed, misleading when shown

**Files modified:** `src/backend/humble/library.ts`, `src/backend/humble/ipc_handler.ts`, `src/common/types/ipc.ts`, `src/preload/api/humble.ts`, `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`, `src/frontend/screens/Humble/Keys/Spares/index.tsx`, `src/frontend/screens/Humble/Keys/Waiting/index.tsx`, `src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx`, `src/backend/humble/__tests__/library.test.ts`, `public/locales/en/translation.json`
**Commit:** ddcb8f6a
**Applied fix:** Exposed the override map per the reviewer's suggestion: new `HumbleLibrary.getAllOwnershipOverrides()` (mirrors `getAllGiftedAt`) behind a new `humbleGetOwnershipOverrides` IPC channel (timestamps only, no key values). `HumbleKeyRow`'s undo control now renders solely off the caller-supplied `undoOverride` flag (moved out of the `ownedElsewhere && fuzzy` block, which an overridden key can never satisfy); Keys-waiting fetches the override map (mount + refresh) and sets the flag where the overridden key actually appears; Giftable Spares no longer renders the undo control on non-overridden fuzzy rows (the confusing no-op). The inverted label copy was fixed: "Undo — this game is not owned" → "Undo — I do own this game" (translation.json + component default).

### WR-05: Wizard IPC promise rejections unhandled — 'finish' mode can hang on "Loading…" forever

**Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx`, `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx`
**Commit:** 9ffdecc7
**Applied fix:** Mount effect gained `.catch(() => setStep('ambiguous'))` (cancelled-guarded) — the reviewer's suggested 'ambiguous' option for the finish read, which offers "Sync now" and never re-fires reveal. **Deliberate deviations from the reviewer's `setStep('failed')` sketch for the handlers:** (1) `handleReveal`'s new catch routes to 'ambiguous', not 'failed' — an IPC-level rejection means the outcome is UNKNOWN (the irreversible POST may have fired), so the 'failed' copy ("nothing was used up… try again") could be false and its retry button would invite re-firing; 'ambiguous' is the honest terminal. (2) `handleMarkRedeemed`'s catch swallows and stays on 'keyShown' (busy cleared) — marking redeemed is local and idempotent, so the user simply retries the button; the 'failed' step's reveal-failure copy would be the wrong context. Tests cover all three rejection paths, including that finish-mode recovery never calls `humbleRevealKey`.

### WR-06: Well-formed `{success:false}` server denial misreported as `schema_error`

**Files modified:** `src/backend/humble/adapter.ts`, `src/common/types/humble.ts`, `src/backend/humble/library.ts`, `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx`, `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css`, `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx`, `src/backend/humble/__tests__/adapter.test.ts`, `src/backend/humble/__tests__/library.test.ts`, `public/locales/en/translation.json`
**Commit:** 8b97eb50
**Applied fix:** Adapter `revealKey` now returns `{status:'rejected_by_server'}` for an explicit `success === false` body (presence/length-only logging preserved; `error_msg` content still never logged — test-asserted). Scoped narrowly: `success` absent/mistyped or `success:true` without a key remain `schema_error` (genuine drift). The new status was added to `RevealOutcome` and to the adapter's return union (`AdapterResult<{key}> | {status:'rejected_by_server'}`) rather than widening the shared `AdapterResult` type, so no other adapter caller is affected. `library.ts` KEEPS the write-ahead REVEALED flag for this branch (truthful state: "unconfirmed — sync to check"), audits `reveal_rejected`, and sets no cooldown. The wizard gained a terminal 'rejected' step with honest copy ("Humble declined to reveal this key — it may already be redeemed or expired. Sync to check its current status."), a Sync-now action, and deliberately no retry button.

## Verification

- Per-fix: targeted jest suites run and passing after each finding, before each commit.
- Full gates at end: `pnpm test` 738/738 (no regression from the 706 baseline; +32 new tests), `pnpm codecheck` clean.
- Each finding committed atomically (`fix(14): <id> …`), 7 commits total: e68ca336, 34774a8c, 5bfc2cb3, ff5de31e, ddcb8f6a, 9ffdecc7, 8b97eb50.

---

_Fixed: 2026-07-08T11:21:18Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
