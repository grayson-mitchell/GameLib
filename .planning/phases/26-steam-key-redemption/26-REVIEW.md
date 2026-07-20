---
phase: 26-steam-key-redemption
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/backend/main.ts
  - src/backend/storeManagers/steam/user.ts
  - src/common/types/ipc.ts
  - src/common/types/steam.ts
  - src/preload/api/steam.ts
  - src/frontend/App.tsx
  - src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts
  - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
  - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
  - src/frontend/helpers/steamKeyValidation.ts
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: warnings_resolved
resolution:
  resolved_at: 2026-07-20
  resolved: [WR-01, WR-02, WR-03]
  out_of_scope: [IN-01, IN-02]
  note: >-
    All 3 Warnings fixed and committed atomically on
    fix/steam-native-install-stability. Info items IN-01/IN-02 intentionally
    left open (out of scope for this fix pass). Verification: user.test.ts
    62/62 green, tsc --noEmit clean, eslint 0 errors on edited files.
---

# Phase 26: Code Review Report

**Reviewed:** 2026-07-20
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the Steam key redemption feature end-to-end: the login-gated sidebar
entry point, the modal component + outcome copy, the client-side format
validator, the IPC contract, the backend `redeemSteamKey` handler, and
`SteamUser.redeemKey` / `classifyPurchaseResult`.

Security verification of the two explicitly-flagged concerns:
- **Raw key is never logged** — CONFIRMED. Traced every log call in the redeem
  path (`redeemKey`, `classifyPurchaseResult`, the IPC handler, the modal). The
  key value is never passed to a logger; `classifyPurchaseResult` logs only
  `store/outcome/purchaseResultDetails`. The catch block extracts only
  `purchaseResultDetails`/`packageList` from the error and does not log the
  error object. A dedicated unit test (`user.test.ts:1103`) asserts this.
- **Auth is enforced at the backend** — CONFIRMED. `redeemKey` calls
  `ensureConnected()` (which returns false when not logged in) before touching
  the client, so the sidebar `steam.username` gate is UX-only and cannot be an
  auth bypass.

I also verified at runtime that every `EPurchaseResult` member referenced in
`classifyPurchaseResult` (`OK/AlreadyOwned/OnCooldown/InvalidKey/DuplicatedKey/
RegionLockedKey/BaseGameRequired/Unknown`) exists in the installed
`steam-user@5.x` enum with the expected numeric values, so the switch is not
silently falling through on a typo'd member.

No Critical issues found. Three Warnings concern error classification/robustness
and backend input validation; two Info items are UX/semantic notes.

## Warnings

### WR-01: Connectivity/unexpected failures during redeem are mislabeled as "invalid key"

**Status:** RESOLVED (2026-07-20, commit 9170f912). The catch block now classifies
only rejections carrying a numeric `purchaseResultDetails`; transport/timeout/
unexpected rejections return the generic `'error'` outcome. The test at
`user.test.ts:1072` was updated to expect `'error'`, plus non-numeric-details
coverage was added.

**File:** `src/backend/storeManagers/steam/user.ts:646-653`
**Issue:** The `redeemKey` catch block assumes every rejection carries a
`purchaseResultDetails`. `steam-user`'s `redeemKey` (apps.js) wraps the request
in a 90 s `StdLib.Promises.timeoutCallbackPromise`, and it can also reject for
transport/logon reasons. Any rejection without `purchaseResultDetails` falls
back to `EPurchaseResult.Unknown`, which `classifyPurchaseResult` buckets as
`'invalid'`. Net effect: a network drop or the 90 s internal timeout while
redeeming a perfectly valid key tells the user "This key doesn't look right.
Double-check it and try again." (copy.ts:33) — actively wrong guidance that
invites futile retries and rate-limiting. The `not-connected` pre-check only
covers the case where the connection was already down *before* the call, not a
mid-call failure. The existing test at `user.test.ts:1072` codifies this
behavior rather than guarding against it.
**Fix:** Distinguish a purchase-result rejection from a transport/unexpected
rejection. Only classify when `purchaseResultDetails` is actually present;
otherwise return the `'error'` outcome so the user sees the connectivity copy.
```ts
} catch (err) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any
  if (e?.purchaseResultDetails === undefined) {
    // Transport/timeout/unexpected failure — not a purchase-result verdict.
    logWarning(
      ['Steam redeemKey failed without a purchase result:', e?.message ?? 'unknown'],
      LogPrefix.Steam
    )
    return { store, outcome: 'error', message: 'redeem-failed' }
  }
  return this.classifyPurchaseResult(store, e.purchaseResultDetails, e.packageList ?? {})
}
```

### WR-02: redeem catch block swallows all errors with no diagnostic logging

**Status:** RESOLVED (2026-07-20, commit 81b02430). Both catch branches now emit a
status-only `logWarning` (store/outcome/error name+message and
`purchaseResultDetails`), mirroring `submitSteamGuardCode`. The raw key is never
logged — verified by the existing `user.test.ts` "never logs the raw key" test.

**File:** `src/backend/storeManagers/steam/user.ts:646-653`
**Issue:** The catch path emits no log at all before returning a classified
result. Combined with WR-01, a genuine unexpected failure (e.g. steam-user
throwing a `TypeError`, a CM disconnect, or the 90 s timeout) is silently
reported to the user as `invalid` and leaves zero trace in the log for support
or debugging. Every other error site in this file logs status/EResult context
(see `submitSteamGuardCode` at :599 and `startCredentialLogin` at :516). The
security constraint (never log the key) is satisfiable while still logging the
error type/EResult — the key is a separate argument and is never a property of
the steam-user error object.
**Fix:** Log a status-only diagnostic (outcome + `purchaseResultDetails` or
`err.message`, never `key`) in the catch, mirroring the discipline already used
elsewhere in the file. The fix in WR-01 already adds a `logWarning` for the
no-details branch; add an equivalent status-only log for the classified branch.

### WR-03: Backend IPC handler performs no input validation on the trust boundary

**Status:** RESOLVED (2026-07-20, commit 09ecada9). The `redeemSteamKey` handler now
guards the destructured payload (rejects non-`'steam'` store, non-string/empty
key) and returns `{ store: 'steam', outcome: 'error', message: 'invalid-request' }`
before delegating to `SteamUser.redeemKey`.

**File:** `src/backend/main.ts:929-931`
**Issue:** `addHandler('redeemSteamKey', async (event, { store, key }) =>
SteamUser.redeemKey(store, key))` destructures `store` and `key` straight from
the renderer payload and forwards them to steam-user with no type/shape
validation. This handler is the main-process trust boundary for a
security-sensitive secret. A malformed payload (e.g. `undefined`, or `key`
being a non-string) reaches `client.redeemKey(key)`; a non-`'steam'` `store`
value is accepted and then classified/returned as if it were `'steam'`
(`classifyPurchaseResult` hard-codes `store` into the result). While there is no
privilege escalation (the user can only redeem onto their own account), the
absence of a guard on the boundary the phase context explicitly called out is a
defensive gap.
**Fix:** Validate at the handler (or at the top of `redeemKey`) before doing any
work:
```ts
addHandler('redeemSteamKey', async (event, payload) => {
  const store = payload?.store
  const key = payload?.key
  if (store !== 'steam' || typeof key !== 'string' || key.length === 0) {
    return { store: 'steam', outcome: 'error', message: 'invalid-request' }
  }
  return SteamUser.redeemKey(store, key)
})
```

## Info

### IN-01: DuplicatedKey is bucketed as "invalid", giving misleading retry guidance

**File:** `src/backend/storeManagers/steam/user.ts:685` (and `copy.ts:30-34`)
**Issue:** `EPurchaseResult.DuplicatedKey` (an already-activated key) is grouped
into the `'invalid'` bucket, so the user is shown "This key doesn't look right.
Double-check it and try again." A duplicated/already-activated key is not
malformed — the correct user-facing meaning is much closer to the
`'already-owned'` copy ("This key has already been redeemed"). As written, the
message contradicts `copy.ts`'s own stated goal that each bucket tell the user
*why* it failed, and it encourages a pointless retry. This may be a deliberate
SPEC REQ5 bucketing decision; flagging so it can be confirmed against intent.
**Fix:** If SPEC allows, move `DuplicatedKey` into the `'already-owned'` bucket
(with `AlreadyOwned`), or add a distinct outcome/copy for already-redeemed keys.

### IN-02: Modal does not re-gate on Steam login state

**File:** `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx:16-102`
**Issue:** The dialog renders purely off `showRedeemKeyDialog` and never checks
`steam.username`. The only trigger (the sidebar item) is login-gated, and the
backend rejects with `not-connected` if the session is gone, so this is not a
security issue — but if a Steam session is lost while the modal is open, the user
can still type and submit, receiving the generic connectivity error rather than a
clear "you are signed out" state. Low impact; noted for completeness.
**Fix:** Optionally short-circuit `onRedeem` (or the mount) when `steam.username`
is falsy and surface a "sign in to Steam" message.

## Test Coverage (light review)

Coverage is strong for the units under test:
- `user.test.ts` covers every `EPurchaseResult` bucket, the not-connected paths
  (both `ensureConnected===false` and null client), and — importantly — asserts
  the raw key is never logged (:1103). Note: the "no `purchaseResultDetails`
  → invalid" test (:1072) locks in the behavior WR-01/WR-02 flag as a defect; if
  those are fixed, this test should be updated to expect `'error'`.
- `steamKeyValidation.test.ts` covers empty/whitespace/short/charset/over-reject
  cases well.
- `copy.test.ts` and the SidebarLinks login-gating test adequately cover their
  surfaces.

No new test defects (missing assertions / flaky patterns) found.

---

_Reviewed: 2026-07-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
