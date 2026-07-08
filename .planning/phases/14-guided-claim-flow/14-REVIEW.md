---
phase: 14-guided-claim-flow
reviewed: 2026-07-08T10:46:20Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - public/locales/en/translation.json
  - src/backend/humble/__tests__/adapter.test.ts
  - src/backend/humble/__tests__/classify.test.ts
  - src/backend/humble/__tests__/dedup.test.ts
  - src/backend/humble/__tests__/electronStores.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/humble/__tests__/user.test.ts
  - src/backend/humble/__tests__/viewFilters.test.ts
  - src/backend/humble/adapter.ts
  - src/backend/humble/classify.ts
  - src/backend/humble/constants.ts
  - src/backend/humble/dedup.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/ipc_handler.ts
  - src/backend/humble/library.ts
  - src/backend/humble/user.ts
  - src/common/humble/viewFilters.ts
  - src/common/types/electron_store.ts
  - src/common/types/humble.ts
  - src/common/types/ipc.ts
  - src/frontend/screens/Humble/Keys/Spares/index.tsx
  - src/frontend/screens/Humble/Keys/Waiting/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - src/preload/api/humble.ts
findings:
  critical: 1
  warning: 6
  info: 7
  total: 14
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-08T10:46:20Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Reviewed the Phase 14 guided-claim-flow surface end to end: the reveal POST transport (`adapter.ts` `humblePostRequest`/`revealKey`), the orchestration and write-ahead/rollback logic (`library.ts`), the new stores (`electronStores.ts`), the IPC surface, the wizard and Keys-waiting/Spares views, and the associated tests.

**Security invariants verified as holding on the reviewed paths:**

- Key values are never logged: `adapter.ts` redacts `error_msg`/bodies to structure-only diagnostics; `library.ts` logs status/gamekey/machineName only; adapter tests assert no csrf token / key value / error_msg content ever reaches a logger.
- Key values persist only in the sanctioned place (`revealedKeyValue` on `humbleLibraryStore` internal records, D-74); `toDisplayKey()` strips `keyindex`/`revealedKeyValue` before every `humbleKeysUpdated` broadcast, and `humbleGetRevealedKeyValue` is the single on-demand read channel.
- CSRF header handling is intact on the happy path (opportunistic header, login capture + health-check backfill) — but see WR-03 for a rotation/staleness gap.
- Clipboard writes occur only inside click handlers (the D-73 auto-copy fires from the user's explicit danger-button click).
- The wizard never re-fires reveal for already-revealed keys ('finish' mode never calls `humbleRevealKey`; backend rejects `state !== 'UNREVEALED'`) — but see WR-01 for a concurrency hole in that same invariant.

However, the local-redeem (`locallyRedeemedPending`) lifecycle has a genuine correctness defect that survives any sync (CR-01), and several robustness gaps degrade the claim flow (WR-01 through WR-06).

## Critical Issues

### CR-01: Sync re-classification silently drops `locallyRedeemedPending`, making Undo permanently impossible after any sync

**File:** `src/backend/humble/library.ts:186-201` (with `src/backend/humble/classify.ts:44-49`)
**Issue:** `classifyOrder` classifies a locally-marked key as `REDEEMED` via the injected `isLocallyRedeemed` predicate, but per its own doc comment ("set by the caller, not this function") it never sets `locallyRedeemedPending`. The caller — `fetchAndCommitOrder`'s `keysWithInternalFields` map — carries forward only `keyindex` and `revealedKeyValue`. So after the **next sync** of that order, the cached key is `state: 'REDEEMED'` with `locallyRedeemedPending` undefined, which is indistinguishable from a server-confirmed redeem. Consequences:

1. `selectKeysWaiting` (`src/common/humble/viewFilters.ts:55-65`) drops the row from Keys-waiting (it requires `locallyRedeemedPending === true` for REDEEMED keys) — the D-77 Undo affordance disappears.
2. `undoRedeemed` (`library.ts:1099`) checks `!target.locallyRedeemedPending` and becomes a permanent no-op — the `humbleLocalRedeemedStore` mark can never be cleared through any path.
3. Because the store mark persists (disconnect-exempt) and feeds `isLocallyRedeemed` on every future sync, the key is irreversibly REDEEMED locally with **no server confirmation ever obtained** — exactly the state D-77's Undo exists to reverse.

No test covers a sync running while `humbleLocalRedeemedStore` has a mark (`localRedeemedData.set` appears only in the undo unit test), which is why this escaped.
**Fix:**
```ts
// library.ts, fetchAndCommitOrder — when building keysWithInternalFields:
const isLocalMark = humbleLocalRedeemedStore.has(
  compositeKey(gamekey, key.machineName)
)
return {
  ...key,
  // A REDEEMED classification that came from the local mark (no server
  // redeemed_key_val) must keep the pending flag so Undo stays reachable.
  ...(key.state === 'REDEEMED' && isLocalMark && !serverRedeemed(key)
    ? { locallyRedeemedPending: true }
    : {}),
  ...(keyindex !== undefined ? { keyindex } : {}),
  ...(priorKey?.revealedKeyValue !== undefined
    ? { revealedKeyValue: priorKey.revealedKeyValue }
    : {})
}
```
The cleanest source for `serverRedeemed` is having `classifyOrder` also emit a per-composite "server-redeemed" signal (it already computes `redeemedKeyValuePresent`), or having `classifyOrder` set `locallyRedeemedPending` itself when the REDEEMED verdict came from the `isLocallyRedeemed` tier rather than server truth. Add a library test: mark redeemed → sync the order → assert the key still carries `locallyRedeemedPending: true` and `undoRedeemed` still works.

## Warnings

### WR-01: No in-flight guard on `revealKey` — concurrent calls can double-fire the irreversible reveal POST

**File:** `src/backend/humble/library.ts:872-897`
**Issue:** The stated invariant is that the reveal call must never be re-fired for an already-revealed key, and T-14-03 says the renderer is never trusted. But the backend's only re-fire protection is the eligibility check `target.state !== 'UNREVEALED'`, which reads the cached state — and the cached state is only flipped to REVEALED by `patchCachedState` **after** the adapter call succeeds. The write-ahead `humbleRevealedStore` flag set at line 962 is never consulted by the eligibility check. Two `humbleRevealKey` IPC invocations arriving before the first resolves (double IPC delivery, a second window, or any renderer bug — the frontend `busy` flag is renderer-side and untrusted by the project's own threat model) both pass eligibility and both send the POST. The sole guard against duplicate submission of the one irreversible write in the codebase is client-side.
**Fix:** Add a module-level in-flight set keyed by the composite key:
```ts
const revealsInFlight = new Set<string>()
async function revealKey(gamekey: string, machineName: string) {
  const composite = compositeKey(gamekey, machineName)
  if (revealsInFlight.has(composite)) return { status: 'failed' as const }
  revealsInFlight.add(composite)
  try { /* existing body */ } finally { revealsInFlight.delete(composite) }
}
```

### WR-02: A successfully revealed key loses its "Finish activation" resume after the next sync

**File:** `src/backend/humble/library.ts:186-201`, `src/common/humble/viewFilters.ts:55-65`, `src/backend/humble/classify.ts:37-39`
**Issue:** Humble's reveal endpoint populates `redeemed_key_val` server-side (that is what the POST does). On the next sync, `classifyTpk` sees `redeemedKeyValuePresent` and classifies the key `REDEEMED` — server truth, no `locallyRedeemedPending`. `selectKeysWaiting` then drops the row from Keys-waiting. Result: a user who reveals a key in the wizard but closes it before activating on Steam loses the D-66 "Finish activation" affordance as soon as any sync runs (startup health-check chain, manual refresh, the wizard's own "Sync now" button on the ambiguous path). The persisted `revealedKeyValue` is still on disk but is no longer reachable from any view — the key silently reads as "done" even though it was never activated on the target platform. This directly undermines D-66's purpose ("REVEALED-but-unredeemed resume") for any reveal not finished in one sitting. The D-30 precedence itself is documented as locked; the fix therefore belongs in the view/annotation layer, not the classifier.
**Fix:** In `selectKeysWaiting`, keep a `REDEEMED` key visible while it has a reveal annotation but no local/explicit redeem mark — e.g. have `getClaimAnnotations`/the view treat `revealedAt set && redeemedAt unset && state === 'REDEEMED'` as still-waiting ("Finish activation"), and only drop the row once the user marks redeemed (or an explicit "server-confirmed-and-acknowledged" signal exists). At minimum, document/decide this behavior explicitly — it is currently an unstated data-access loss.

### WR-03: Stored CSRF token can go stale and then permanently mismatch the live cookie jar

**File:** `src/backend/humble/user.ts:398-419, 510-529`; `src/backend/humble/adapter.ts:299-301`
**Issue:** The `csrf-prevention-token` header is sourced from a snapshot captured at login (or backfilled by the health check **only when absent**: `if (result.status === 'ok' && !HumbleUser.getCsrfToken())`). Meanwhile `humblePostRequest` attaches the **live** partition cookie jar natively (`useSessionCookies`) — including the current `csrf_cookie`. If Humble rotates `csrf_cookie` (typical for CSRF double-submit schemes), every reveal thereafter sends a header that no longer matches the cookie: a genuine Humble 403 → `access_denied` → 15-minute shared cooldown (D-79) on every attempt, and the stale token never self-heals because the backfill is gated on absence, not staleness. The user's only recovery is disconnect/reconnect, which nothing tells them to do.
**Fix:** Read `csrf_cookie` from the `persist:humble` partition at reveal time (the same `session.fromPartition(...).cookies.get(...)` call the login capture already uses) and pass that live value to `adapterRevealKey`, falling back to the stored snapshot only if the partition read fails. This guarantees header/cookie agreement by construction and makes the stored copy a cache, not the source of truth.

### WR-04: Ownership-override Undo affordance is unreachable when needed and misleading when shown

**File:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:110-149`; `src/frontend/screens/Humble/Keys/Spares/index.tsx:97`; `src/backend/humble/dedup.ts:167-170`
**Issue:** `humbleSetOwnershipOverride` triggers a recompute that sets `ownedElsewhere: false, matchConfidence: 'none'` on the overridden key. But the "Undo — this game is not owned" button renders only inside the `{humbleKey.ownedElsewhere && ...}` block and only for `matchConfidence === 'fuzzy'` — conditions an overridden key can never satisfy again. Two concrete defects:
1. An actually-overridden key (now in Keys-waiting with no owned badge) has **no UI path anywhere** to reverse the override — contradicting the component's own comment that "a mistaken override must stay reversible."
2. On Giftable Spares, every not-yet-overridden fuzzy row renders **both** "Not the same game" and "Undo — this game is not owned" simultaneously; clicking Undo there calls `humbleClearOwnershipOverride` for an override that does not exist (a confusing no-op).

(Also note the Undo button's translated label says "this game is not owned" while its action *restores* the owned flag — the copy states the opposite of the effect.)
**Fix:** The undo affordance must key off "an override record exists," not off the current fuzzy/owned flags. E.g. expose the override map (like `humbleGetGiftedAt`) or an `overridden` flag on `HumbleKey`, and render the undo control on the row wherever the overridden key now appears (Keys-waiting), removing it from non-overridden Spares rows.

### WR-05: Wizard IPC promise rejections are unhandled — 'finish' mode can hang on "Loading…" forever

**File:** `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx:60-87, 93-131, 139-153`
**Issue:** The finish-mode effect calls `window.api.humbleGetRevealedKeyValue(...).then(...)` with no `.catch` — an IPC rejection leaves `revealedKey === null` and `step === 'keyShown'` permanently, so the wizard shows "Loading…" with no action buttons and no recovery, plus an unhandled promise rejection. Similarly, `handleReveal` and `handleMarkRedeemed` use `try { await ... } finally { ... }` with no `catch`: an IPC-level rejection (as opposed to a typed outcome) escapes `void handleReveal()` as an unhandled rejection and the wizard silently stays on the warning step with no feedback.
**Fix:** Add `.catch(() => setStep('failed'))` (or 'ambiguous' for the finish read) to the mount effect, and a `catch { setStep('failed') }` clause in `handleReveal`/`handleMarkRedeemed`.

### WR-06: A well-formed `{success: false}` server denial is misreported as `schema_error` → "nothing was used up" copy can be false

**File:** `src/backend/humble/adapter.ts:628-639`; `src/backend/humble/library.ts:1003-1028`; wizard 'failed' step
**Issue:** `revealKey` returns `{ status: 'schema_error', raw: undefined }` for a response that parsed perfectly but carried `success: false` — e.g. Humble's "already redeemed"/"expired" denial. That is not a schema drift; it is a definitive server verdict. Downstream, `library.ts` treats it as a definitive failure: it rolls back the write-ahead REVEALED flag ("this key was never actually revealed server-side" — false for an already-redeemed denial) and the wizard renders "Couldn't reveal this key — nothing was used up. You can try again," inviting an endless retry loop against a key the server considers consumed. It also pollutes the `schema_error` diagnostic meaning (`describeSchemaFailure` never ran for this case, yet the audit outcome records `schema_error`).
**Fix:** Introduce a distinct status for this branch, e.g. `{ status: 'rejected_by_server' }` on `AdapterResult`/`RevealOutcome` (still carrying no `error_msg` content, presence/length logging unchanged), let `library.ts` keep the REVEALED write-ahead flag for it (the truthful state is "unconfirmed — sync to check"), and give the wizard honest copy for that branch instead of "nothing was used up."

## Info

### IN-01: Dead duplicate i18n keys in translation.json

**File:** `public/locales/en/translation.json` (`humbleKeys.*`)
**Issue:** `revealTitle`, `revealBody`, `revealConfirm`, `revealFailed`, `ambiguousOutcome`, `cooldownRetry`, `ownedBlockTitle`, `ownedBlockBody`, `ownedBlockGoto`, `ownedPassiveNote`, `yourKey` duplicate the strings the wizard actually uses (`revealConfirmTitle/-Body/-Action`, `revealFailedBody`, `revealAmbiguousBody`, `revealCooldownBody`, `c2Title/Body/Action`, `finishOwnedNote`, `keyShownTitle`) and are referenced nowhere in `src/` (only `humbleKeys.cooldown` is used, by Keys/index.tsx). Looks like an earlier naming pass that was superseded.
**Fix:** Delete the unused key set (translators would otherwise translate both).

### IN-02: Definitive-failure rollback deletes a machineName-keyed flag that another gamekey may own

**File:** `src/backend/humble/library.ts:1005`
**Issue:** `humbleRevealedStore.delete(machineName)` on definitive failure can erase the REVEALED flag of a *different* gamekey's key sharing the same machineName (the store is machineName-keyed; Open Q4 acknowledges the read-side limitation, but this extends it to a destructive write, regressing that other key to UNREVEALED on next sync — Pitfall 1 territory).
**Fix:** When migrating this store to composite keys eventually, prioritize this delete path; short-term, only delete if the flag's `revealedAt` matches the timestamp written by this same invocation.

### IN-03: `revealKey`'s cooldown write is not generation-fenced

**File:** `src/backend/humble/library.ts:1020-1027`
**Issue:** The sync path guards every `setSyncState` with the CR-01 `isStale()` fence, but `revealKey`'s `access_denied` branch writes `setSyncState({ syncError: 'denied', cooldownUntil: ... })` unconditionally — a disconnect landing while the reveal POST is in flight repopulates the just-wiped `humbleSyncStore` with a 15-minute cooldown that gates the next account's first sync.
**Fix:** Capture the generation at `revealKey` entry and skip the `setSyncState` when stale (audit/revealed-store writes are disconnect-exempt and correct as-is).

### IN-04: Cooldown step renders a static countdown and "0m" edge case

**File:** `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx:268-284`
**Issue:** `minutes` is computed once per render with no ticking re-render, and when `cooldownRetryAt` is `null` the copy renders "retry in 0m" (the `Math.max(1, …)` floor applies only to the non-null branch). The step also has no dismiss button — only the dialog chrome closes it.
**Fix:** Treat `cooldownRetryAt === null` the same as the minimum ("retry in 1m" or generic copy); optionally add an interval to refresh the countdown.

### IN-05: Prior `keyindex` is not carried forward when a fresh order response omits it

**File:** `src/backend/humble/library.ts:186-201`
**Issue:** The commit path carries `revealedKeyValue` forward from the prior cache entry but not `keyindex`; if a live payload drifts and drops the `keyindex` field, an already-claimable row regresses to the Pitfall-C "Sync to enable claiming" dead-end (and a further sync cannot fix it).
**Fix:** Mirror the `revealedKeyValue` carry-forward: `...(keyindex !== undefined ? { keyindex } : priorKey?.keyindex !== undefined ? { keyindex: priorKey.keyindex } : {})`.

### IN-06: `refreshAnnotations` lacks the unmount guard its sibling effect has

**File:** `src/frontend/screens/Humble/Keys/Waiting/index.tsx:40-44`
**Issue:** The mount effect guards `setAnnotations` with a `cancelled` flag, but `refreshAnnotations` (called from `closeWizard`/undo) does not — a route change while the IPC round-trip is in flight calls `setAnnotations` on an unmounted component (harmless no-op in React 18, but inconsistent with the file's own pattern).
**Fix:** Route both through one guarded helper, or ignore results after unmount via a ref.

### IN-07: `ineligible` reveal outcome collapses into the retryable 'failed' step

**File:** `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx:122-126`
**Issue:** `case 'failed': case 'ineligible': default:` all land on the 'failed' step whose copy says "You can try again" — but `ineligible` (e.g. keyindex unresolved, or state advanced under the wizard) will fail identically on every retry.
**Fix:** Give `ineligible` its own terminal copy (e.g. reuse the "Sync to enable claiming" language) without a retry button.

---

_Reviewed: 2026-07-08T10:46:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
