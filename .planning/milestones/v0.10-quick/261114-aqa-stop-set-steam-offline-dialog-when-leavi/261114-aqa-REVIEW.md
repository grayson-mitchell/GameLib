---
phase: 261114-aqa
reviewed: 2026-11-14T00:00:00Z
depth: quick
files_reviewed: 6
files_reviewed_list:
  - src/frontend/screens/WebView/storeExitRefresh.ts
  - src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/library/refresh.ts
  - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
  - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 261114-aqa: Code Review Report

**Depth:** quick (diff-scoped, plus consumer grep)

## Summary

Both intents are implemented correctly. The only push site of `steamGoOfflineRequired` is `user.ts:325-340`, which is gated on `opts.guidedAction`. Omitting it therefore suppresses the dialog. `SteamRefreshLogonGrant` has one consumer, `library/refresh.ts:32`. It handles `'store-exit'` and passes `reason: 'user-refresh'`, which is a valid `AuthSessionReason`. No other `guidedAction: 'refresh'` caller changed. No critical issues.

## Warnings

### WR-01: Inferred store-exit refresh still surfaces the failed banner on non-go-offline refusals

**File:** `src/backend/storeManagers/steam/library/refresh.ts:61-90`
**Issue:** Only `go-offline-required` is made silent for the inferred refresh. A refusal such as `logon-rejected` or `client-not-ready` still sends `steamSyncStatus: failed`. An automatic, user-unrequested refresh therefore can show a failure banner on every store visit-exit. This is the same class of annoyance the change removes for the dialog. It may be intentional, because a rejected credential is worth showing. Confirm it, and if it is not intended, downgrade the inferred case to `idle`.
**Fix:** In the `!lease.ok` branch, send `{ status: 'idle' }` after `restoreLocalSteamLibrary` when `inferred && lease.reason !== 'logon-rejected'`.

## Info

### IN-01: Duplicate URL parsing and protocol check in `isSteamPurchaseIntentUrl`

**File:** `src/frontend/screens/WebView/storeExitRefresh.ts:44-57`
**Issue:** `isSteamPurchaseIntentUrl` re-parses the URL after `isSteamCheckoutIntentUrl` already parsed it. The https and host checks are duplicated.
**Fix:** Extract a private `parseSteamStoreUrl(url): URL | null` and share it between both classifiers.

### IN-02: `mapRefreshOriginToLogonGrant` has redundant guards

**File:** `src/backend/storeManagers/steam/authTrigger.ts:213-216`
**Issue:** The `trigger !== 'user-refresh' && trigger !== 'login'` check already implies membership in `LOGON_GRANTING_TRIGGERS`. The second `includes` check is dead code unless the array diverges, and the array is typed as `readonly SteamAuthTrigger[]`. Keeping one source of truth is cleaner.
**Fix:** Keep only the `LOGON_GRANTING_TRIGGERS.includes(trigger)` check, with a type guard or cast.

---

_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
