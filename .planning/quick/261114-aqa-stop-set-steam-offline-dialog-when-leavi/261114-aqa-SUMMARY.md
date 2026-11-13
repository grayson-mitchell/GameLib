# Quick 261114-aqa Summary

Stopped the "Set Steam offline to continue" dialog from appearing when leaving the in-app Steam Store.

- Task 1 (423f74129): Steam /app/ pages arm the store-exit refresh only via in-store nav. New `isSteamCheckoutIntentUrl` and per-row `armsOnEntry` (steam only = cart/checkout). Other stores unchanged.
- Task 2: origin `steam-store-exit` yields a distinct `'store-exit'` logon grant (`mapRefreshOriginToLogonGrant`, `INFERRED_REFRESH_ORIGINS`). `refresh()` acquires without `guidedAction` for it, logs one store-exit line on go-offline-required, keeps cache, emits idle. Explicit Refresh/redeem/retry/login unchanged.

## Deviations
- [Rule 1] Two existing authTrigger tests conflicted with the plan: "frozen arrays, not Sets" (now allows exactly the one INFERRED_REFRESH_ORIGINS Set) and "steam-store-exit arms user-refresh grant" (now expects 'store-exit').
- TDD RED run was skipped in practice (tests written alongside the code); all new cases pass.

## Gates
- jest (6 suites incl. useStoreEmbedHost): 428 passed, 0 failed
- eslint clean; prettier --check clean (all paths not ignored); tsc: no new errors (baseline 0); `pnpm build:sidecar` ok; graphify updated.
