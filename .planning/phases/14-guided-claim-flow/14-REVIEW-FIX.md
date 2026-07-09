---
phase: 14-guided-claim-flow
fixed_at: 2026-07-09T06:42:04Z
review_path: .planning/phases/14-guided-claim-flow/14-REVIEW.md
iteration: 3
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-07-09T06:42:04Z
**Source review:** .planning/phases/14-guided-claim-flow/14-REVIEW.md
**Iteration:** 3 — covers the **14-08 gap-closure re-review** (REVIEW.md reviewed 2026-07-09T03:21:47Z, which supersedes the iteration-2 review state). Iteration 2's report (3 findings from the 14-07 re-review) is superseded by this document.

**Summary:**
- Findings in scope: 3 (1 Critical, 2 Warning; fix_scope: critical_warning — IN-01..IN-03 not in scope)
- Fixed: 3
- Skipped: 0

**Gates:** full suite 769/769 passing (baseline 766 + 3 new tests added with these fixes); `pnpm codecheck` (tsc --noEmit) clean.

**Security invariants re-verified after fixes:** no key/cookie/csrf values touch any log line (the fixes add zero new log statements; existing outcome-summary tests still assert `cookie-value`/`REDEEMED-VALUE` never appear in logs or broadcasts); reveal transport untouched (`revealKey`/`doRevealKey`/adapter unchanged in this diff); no auto-reveal introduced (the new regression test drives the reveal through the existing explicit `revealKey` entry point and asserts the ambiguous outcome fires no retry); D-66 never-re-reveal untouched — CR-01's fix RESTORES the D-66 website-reveal value-pickup path (frozen flag-only orders now keep re-fetching until the value lands) without ever firing a reveal POST; D-26 per-order broadcasts untouched.

## Fixed Issues

### CR-01: `freezeEligible` froze flag-only REVEALED keys (no server value), permanently stranding D-78 ambiguous-reveal reconciliation and D-66 website-reveal pickup

**Files modified:** `src/backend/humble/classify.ts`, `src/backend/humble/library.ts`, `src/common/types/humble.ts`, `src/backend/humble/__tests__/classify.test.ts`, `src/backend/humble/__tests__/library.test.ts`
**Commit:** d57b6f23
**Applied fix:** Widened the single-sourced `isFreezeEligible` predicate per the review sketch: it now takes an optional `revealedKeyValuePresent` signal, and a REVEALED key is freeze-eligible only when `expiration === null` **AND** `revealedKeyValuePresent === true` (absent/undefined treated as NOT present — the safe default is to keep re-fetching). REDEEMED/UNREDEEMABLE keep their always-eligible behavior exactly. All three write sites now supply the best value signal available locally, via the SAME predicate:

- `classifyOrder` passes membership in the string side-channel (`revealedKeyValueByComposite`) — the same signal library.ts persists onto the internal `revealedKeyValue` field, so a fresh order's classify-time and commit-time computations agree exactly.
- `fetchAndCommitOrder` no longer persists `classified.freezeEligible`; it recomputes over `keysWithInternalFields` using `revealedKeyValue !== undefined` — the merged keys are where the carried-forward value lives, so a GameLib-revealed key whose value was carried forward still freezes even when the fresh server payload lacks the value.
- `patchCachedState` uses the same `revealedKeyValue !== undefined` signal — a successful reveal (value persisted via `extra`) freezes; an ambiguous/rejected reveal (never reaches this function) does not. This keeps the WR-01 (prior review) no-drift guarantee: predicate single-sourced, only the value-present signal is site-local.

**Reviewer caveat decided explicitly:** non-Steam keys whose server value is an OBJECT (omitted from the string side-channel by design) never freeze and keep re-fetching. Chosen over the object-tolerant `redeemedKeyValuePresent` alternative because it keeps classifyOrder's computation in exact agreement with the persisted value at commit time, and is consistent with those keys' honest Pitfall-B "unconfirmed" `getRevealedKeyValue` path — a residual re-fetch (stale-safe), never a stranded key. Documented in the classify.ts comment.

**Tests added/updated:**
- Predicate level (classify.test.ts): value-backed REVEALED(null-exp) → eligible; flag-only REVEALED (absent AND explicit-false signal) → never eligible; future-exp REVEALED → not eligible even when value-backed.
- classifyOrder level (classify.test.ts): `revealedViaFlagOrder` + `ALWAYS_REVEALED` (flag-only, no server value) → `freezeEligible: false`; existing value-backed test (`redeemedOrder` → `true`) retained.
- End-to-end regression (library.test.ts, the exact strand trace from the review): ambiguous reveal (adapter threw, write-ahead flag kept) → sync with no server value commits REVEALED with `freezeEligible: false` and `getRevealedKeyValue` null → next sync DOES re-fetch → server value now present → value picked up, order freezes → third sync skips it.
- Updated the existing WR-01 mark→sync→undo→sync test to seed a GameLib-revealed (`revealedKeyValue`-backed) key, preserving its intent — a value-backed REVEALED(null-exp) order stays frozen after undo (no needless re-fetch) — under the new value-present requirement.

### WR-01: Steam connectivity gate duplicated inline — parity enforced by comment, not code

**Files modified:** `src/backend/humble/library.ts`
**Commit:** 4bce6a3a
**Applied fix:** Extracted the D-48/T-12-02 double-gate into one shared helper exactly as the review sketched — `getSteamGate(): { open: boolean; steamGames: GameInfo[] }` (returns closed with `[]` when not logged in; otherwise reads the cached library once and reports open only when non-empty). BOTH sites now read it: `fetchAndCommitOrder`'s commit-time branch selector (`steamGate.open` selects Branch A/B, `steamGate.steamGames` feeds `dedupRecomputeOwnership`) and `recomputeOwnership`'s end-of-sync no-op gate. A one-sided semantic addition to either site is now structurally impossible without touching the shared helper. Comments at both sites updated to reference the helper; existing gated-off carry-forward and churn tests pin the behavior (108/108 library tests pass unchanged apart from the CR-01 updates).

### WR-02: "isTerminal is UNCHANGED" guard test never called `isTerminal` — vacuous guard

**Files modified:** `src/backend/humble/__tests__/classify.test.ts`
**Commit:** 602d7ec9
**Applied fix:** Imported `isTerminal` into classify.test.ts and rewrote the guard test to assert `isTerminal`'s own outputs across all five states — critically `isTerminal('REVEALED') === false` alongside `isServerTerminal('REVEALED') === true`, plus REDEEMED/UNREDEEMABLE true and UNREVEALED/UNPICKED false — so the one regression the guard exists to catch (someone "simplifying" `isTerminal` to include REVEALED) now fails the test.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-07-09T06:42:04Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
