---
phase: 14-guided-claim-flow
reviewed: 2026-07-09T03:21:47Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/backend/humble/library.ts
  - src/backend/humble/classify.ts
  - src/common/types/humble.ts
  - src/backend/humble/constants.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/humble/__tests__/classify.test.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 14: Code Review Report — 14-08 Gap-Closure Re-Review

**Reviewed:** 2026-07-09T03:21:47Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This report covers the **14-08 gap-closure re-review scope** (commits `3e3a4606` + `01e9260d`; diff base `5ede3a0e`) and supersedes the prior 14-07 re-review state of this file. Scope: Fix 1 (two-branch ownership-overlay strategy at per-order commit time — Steam gate passes → `dedupRecomputeOwnership` at commit; gate fails → per-key carry-forward of prior `ownedElsewhere`/`matchConfidence`), and Fix 2 (single-sourced `isServerTerminal`/`isFreezeEligible` predicates, new optional `HumbleOrderCacheEntry.freezeEligible`, `partitionGamekeys` reading `freezeEligible ?? allTerminal`, classifier v5→6 bump). Both test suites pass (215/215).

**Invariant verification results:**

1. **Gate-expression parity (commit-time vs end-of-sync): PASS with a drift hazard.** `fetchAndCommitOrder`'s gate (`SteamUser.isLoggedIn() && steamGames.length > 0`, `library.ts:205-206`) is semantically identical to `recomputeOwnership`'s double-gate (`library.ts:442-448`) today — but it is a duplicated inline re-implementation, not a shared helper. See WR-01.
2. **Steam hiccup can never zero a prior `ownedElsewhere:true`: PASS.** Branch B carries forward per-key via `priorKey?.ownedElsewhere ?? key.ownedElsewhere` (`library.ts:223-230`); `ownedElsewhere` is a required boolean, so `??` preserves both prior `true` and prior `false` and only falls back to classify's hard-reset when no prior key exists. End-of-sync `recomputeOwnership` retains its D-48 no-op double-gate. Locked by the two gated-off carry-forward tests (`library.test.ts:2011-2053`).
3. **C2 mid-sync window closed: PASS.** Branch A overlays ownership BEFORE `humbleLibraryStore.set` (the entry is committed atomically with ownership already applied), so `doRevealKey`'s live re-read can never observe classify's transient `ownedElsewhere:false`. Verified by the mid-sync `owned_blocked` test (`library.test.ts:1972-2009`). Branch B keeps stale-but-safe carry-forward. (A brand-new never-cached owned key with the gate closed commits `false` — unavoidable: no Steam data exists; end-of-sync recompute catches up when the gate reopens, verified `library.test.ts:2079-2101`.)
4. **`freezeEligible` computed identically at all write sites: PASS.** `classifyOrder` (`classify.ts:491-492`) and `patchCachedState` (`library.ts:583-584`) both use `keys.length > 0 && keys.every(isFreezeEligible)` over the same exported predicate; `fetchAndCommitOrder` persists `classified.freezeEligible`. The ownership overlay never touches `state`/`expiration`, so computing over pre-overlay `classified.keys` cannot diverge. WR-01 (prior review) undo consistency verified by the mark→sync→undo→sync tests (`library.test.ts:2902-2990`).
5. **REVEALED with live future expiration is never frozen: PASS** — `isFreezeEligible` excludes `state === 'REVEALED' && expiration !== null` (`classify.ts:107-110`), verified at predicate, classifyOrder, sync-partition, and undo-cycle levels. **However, the inverse case is broken:** a flag-only REVEALED key (local write-ahead flag, NO server key value) with `expiration: null` freezes, permanently stranding the D-78 ambiguous-outcome reconciliation and D-66 website-reveal value pickup. See CR-01 — this is the one genuine defect found.
6. **D-26 per-order broadcasts untouched: PASS.** `sendFrontendMessage('humbleKeysUpdated', getKeys())` still fires after every per-order commit (`library.ts:865`); the churn test asserts ≥2 intermediate pushes, each carrying `ownedElsewhere:true` (`library.test.ts:1935-1971`).
7. **No key/cookie/csrf values in logs: PASS.** The 14-08 diff adds no new log lines; existing lines remain gamekey/status/count-only; the outcome-summary test still asserts `cookie-value` never appears.
8. **D-66 never-re-reveal untouched: PASS (code).** `revealKey`/`doRevealKey` are unchanged in this diff; the `revealsInFlight` set and the UNREVEALED-only eligibility gate are intact. (CR-01 degrades D-66's *value-pickup* path for one key class, but never causes a re-reveal POST.)
9. **Test coverage of replaced tests: PASS.** The 14-07 "never frozen" test was superseded intentionally (documented in-test) and its retroactive-expiry intent is preserved by the new future-expiration variant (`library.test.ts:1573-1600`); the old WR-01 "undo unfreezes" intent is preserved by the new future-exp mark→undo→thaw→re-mark cycle test (`library.test.ts:2941-2990`). No silent coverage loss found — except the vacuous guard in WR-02 below.

## Critical Issues

### CR-01: `freezeEligible` freezes flag-only REVEALED keys (no server value), permanently stranding D-78 ambiguous-reveal reconciliation and D-66 website-reveal pickup

**File:** `src/backend/humble/classify.ts:103-111` (predicate), `src/backend/humble/library.ts:266-273` (persisted at commit)

**Issue:** `isFreezeEligible` treats every REVEALED key with `expiration: null` as server-final, justified by "once Humble populates `redeemed_key_val` it never un-populates it." That premise only holds when the server value is actually present. A key can classify REVEALED purely from the **local write-ahead flag** (`humbleRevealedStore`) with no server value at all — exactly the state produced by the two designed-for reveal outcomes that deliberately KEEP the flag without patching the cache:

- **`ambiguous`** (adapter threw — `library.ts:1195-1217`): we genuinely don't know whether Humble processed the reveal; the wizard shows "unconfirmed — sync to check."
- **`rejected_by_server`** (WR-06 — `library.ts:1144-1167`): definitive denial, flag kept.

Trace of the strand (expiration `null` throughout):
1. Reveal ends `ambiguous`. Cached state still UNREVEALED, `freezeEligible: false` — fine so far.
2. Next sync re-fetches the order. Humble never actually processed the reveal, so the payload carries no `redeemed_key_val`. `classifyTpk` reads `isLocallyRevealed → REVEALED`; `revealedKeyValueByComposite` is empty; no prior `revealedKeyValue` to carry. Entry commits with `state: 'REVEALED'`, `revealedKeyValue` absent, and — the bug — `freezeEligible: true`.
3. Every subsequent sync skips the order (frozen). `getRevealedKeyValue` returns `null` forever ("unconfirmed"). An explicit user retry of `revealKey` returns `ineligible` (state is REVEALED, not UNREVEALED — `library.ts:1015`). If the user reveals the key on Humble's **website**, the frozen order never re-fetches, so the server value is never picked up either — the wizard's D-66 finish mode can never show the key.

There is no thaw path: `patchCachedState` only runs on reveal/mark/undo, none of which is reachable for this key. The only recovery is a future `HUMBLE_CLASSIFIER_VERSION` bump or a destructive disconnect/reconnect. Pre-14-08, this reconciliation worked precisely because REVEALED orders were re-fetched every sync — Fix 2 removed that without distinguishing value-backed REVEALED from flag-only REVEALED. Note the new freeze tests only exercise the value-backed case (`makeRawOrder(..., { redeemed: true })` sets `redeemed_key_value`), which is why this was missed.

**Fix:** Make REVEALED freeze-eligibility additionally require a present key value, keeping the predicate single-sourced. Sketch:

```ts
// classify.ts — widen the single-sourced predicate:
export function isFreezeEligible(key: {
  state: HumbleKeyState
  expiration: string | null
  revealedKeyValuePresent?: boolean
}): boolean {
  if (!isServerTerminal(key.state)) return false
  if (key.state === 'REVEALED') {
    return key.expiration === null && key.revealedKeyValuePresent === true
  }
  return true // REDEEMED/UNREDEEMABLE: unchanged
}
```

- In `classifyOrder`, pass each tpk's `redeemedKeyValuePresent` into the per-key eligibility check (it is already computed at `classify.ts:371`).
- In `fetchAndCommitOrder`, compute `freezeEligible` over `keysWithInternalFields` (where the carried-forward/side-channel `revealedKeyValue` lives) instead of persisting `classified.freezeEligible`, so a GameLib-revealed key whose value was carried forward still freezes.
- In `patchCachedState`, `HumbleKeyInternal.revealedKeyValue !== undefined` supplies the same signal — a successful reveal (value persisted) freezes; an ambiguous one (no patch) never does.
- Caveat to decide explicitly: non-Steam keys whose server value is an OBJECT are deliberately omitted from the string side-channel (`classify.ts:404-408`) — under this fix they keep re-fetching. If that residual exposure matters, use the truthy `redeemedKeyValuePresent` (object-tolerant) at classify time and document the internal-field divergence.
- Add the missing regression test: ambiguous reveal → sync (server has no value) → order must NOT freeze → later sync with server value present → freezes.

## Warnings

### WR-01: Steam connectivity gate duplicated inline — the exact invariant Fix 1 depends on is enforced by comment, not by code

**File:** `src/backend/humble/library.ts:205-206` vs `src/backend/humble/library.ts:441-448`

**Issue:** The commit-time branch selector re-implements the D-48 double-gate (`SteamUser.isLoggedIn() && steamGames.length > 0`) inline, while `recomputeOwnership` expresses the same gate as two early returns. The Fix 1 comment asserts they are "the EXACT same Steam connectivity check," but nothing structural enforces it. This is precisely the drift class Fix 2 just eliminated for the freeze predicate (single-sourced `isFreezeEligible`): if either site's gate later changes (e.g., a staleness/partial-refresh condition is added to `recomputeOwnership` only), the commit-time branch and the end-of-sync recompute disagree again and the fill-then-empty churn / T-14-03 C2 window reopens silently — the tests pin today's behavior but wouldn't catch a one-sided semantic addition.

**Fix:** Extract a shared helper and use it at both sites:

```ts
function getSteamGate(): { open: boolean; steamGames: GameInfo[] } {
  if (!SteamUser.isLoggedIn()) return { open: false, steamGames: [] }
  const steamGames = steamLibraryStore.get('games', [])
  return { open: steamGames.length > 0, steamGames }
}
```

### WR-02: "isTerminal is UNCHANGED" guard test never calls `isTerminal` — the stated invariant is not asserted

**File:** `src/backend/humble/__tests__/classify.test.ts:1120-1126`

**Issue:** The test titled *"isTerminal (user-journey terminality) is UNCHANGED — still REDEEMED/UNREDEEMABLE only"* asserts only `expect(isServerTerminal('REVEALED')).toBe(true)` — a duplicate of the first test in the describe block. `isTerminal` is not even imported into this file. The one regression this guard exists to catch (someone "simplifying" `isTerminal` to include REVEALED, which would freeze REVEALED orders under `allTerminal` and break `patchCachedState`'s recompute) would pass this test untouched. The guard is vacuous.

**Fix:**

```ts
import { isTerminal } from '../classify'
// ...
test('isTerminal (user-journey terminality) is UNCHANGED — still REDEEMED/UNREDEEMABLE only', () => {
  expect(isTerminal('REVEALED')).toBe(false) // server-terminal but NOT user-journey terminal
  expect(isTerminal('REDEEMED')).toBe(true)
  expect(isTerminal('UNREDEEMABLE')).toBe(true)
  expect(isTerminal('UNREVEALED')).toBe(false)
  expect(isTerminal('UNPICKED')).toBe(false)
})
```

## Info

### IN-01: Duplicated D-74 comment block in `fetchAndCommitOrder`

**File:** `src/backend/humble/library.ts:182-188` and `src/backend/humble/library.ts:232-239`

**Issue:** The seven-line "Phase 14 (D-74): merge the freshly-classified order's keyindex side-channel…" comment appears verbatim twice — a copy-paste artifact of inserting the Fix 1 block between the original comment and the code it described. The first instance (above `priorEntry`) now describes code ~50 lines away.

**Fix:** Delete the first instance (lines 182-188); keep the one directly above `keysWithInternalFields`.

### IN-02: Zero-key orders never freeze — residual per-sync re-fetch exposure the Fix 2 goal does not cover

**File:** `src/backend/humble/library.ts:266-273` (`freezeEligible: classified.freezeEligible`), `src/backend/humble/classify.ts:491-492`

**Issue:** For an order that classifies to zero keys (pure PDF/ebook/entitlement bundles, D-29), `keys.length > 0 && …` yields `freezeEligible: false` (and `allTerminal: false`), so these orders are re-fetched on every sync forever. This preserves pre-existing partition semantics, but it is the same standing Cloudflare/WAF re-fetch exposure class Fix 2 was written to cut — a tester with many ebook bundles keeps a permanent N-orders-per-sync fetch load. If intentional (an entitlement-only order could theoretically gain keys later), record it as an explicit decision; otherwise consider a distinct freeze rule for diagnosed-legitimate zero-key shapes.

### IN-03: Branch B ownership carry-forward inherits the index-based fallback-identity hazard

**File:** `src/backend/humble/library.ts:223-230` (with `src/backend/humble/classify.ts:362-365`)

**Issue:** The carry-forward map is keyed by `machineName`, but a tpk lacking `machine_name` gets the synthetic identity `` `${gamekey}:${keys.length}` `` — an array index. If the composition/order of key-evidenced tpks in an order changes between syncs, indexes shift and a prior key's `ownedElsewhere`/`matchConfidence` (and, pre-existing, `revealedKeyValue`) can be carried onto the wrong key — including carrying a stale `false` onto a previously-owned key. Real Humble payloads reliably carry `machine_name`, so this is a low-probability edge, and the pattern predates 14-08 (the `revealedKeyValue` carry uses the same map) — noted because Fix 1 extends it to a C2-security-relevant field.

**Fix:** No action required now; if machine_name-less tpks are ever observed live, switch the synthetic identity to a content hash of stable tpk fields rather than an index.

---

_Reviewed: 2026-07-09T03:21:47Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
